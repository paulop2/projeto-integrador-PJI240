import { describe, expect, it, vi } from 'vitest';

import type { CatalogManifest, ProgressEvent, SyncResponse } from '../src/contracts';
import { FetchSyncTransport, MemoryOfflineStorage, MemoryPackageCache, OfflinePackageManager, SyncQueue, retryDelayMs } from '../src/offline';

const packageBody = (context = 'Quanto é 2 + 2?') => JSON.stringify({
  schemaVersion: 1,
  packageId: 'enem-2024',
  institutionId: 'inep',
  examId: 'enem',
  editionId: 'enem-2024',
  questions: [{
    id: 'enem-enem-2024-1', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', year: 2024,
    subjectId: 'matematica', kind: 'single-choice', context, files: [], alternativesIntroduction: null,
    alternatives: [{ id: 'a', label: 'A', text: '3', file: null }, { id: 'b', label: 'B', text: '4', file: null }],
    answer: { optionIds: ['b'] },
  }],
});

const sha256 = async (body: string) => {
  const value = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return `sha256:${[...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

async function manifest(body: string, version = 1): Promise<CatalogManifest> {
  return {
    schemaVersion: 1, generatedAt: '2026-08-23T12:00:00-03:00',
    institutions: [{ id: 'inep', name: 'INEP' }],
    exams: [{ id: 'enem', institutionId: 'inep', name: 'ENEM', category: 'vestibular' }],
    editions: [{ id: 'enem-2024', examId: 'enem', label: 'ENEM 2024', year: 2024 }],
    subjects: [{ id: 'matematica', name: 'Matemática' }],
    packages: [{ id: 'enem-2024', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', url: '/data/enem/enem-2024.json', version, sha256: await sha256(body), byteSize: new TextEncoder().encode(body).byteLength, questionCount: 1, subjectIds: ['matematica'], questionKinds: ['single-choice'] }],
  };
}

describe('offline packages', () => {
  it('lists the initial catalog and downloads with a clean browser fetch receiver', async () => {
    const body = packageBody(); const catalog = await manifest(body);
    const receivers: unknown[] = [];
    async function browserFetch(this: unknown, input: RequestInfo | URL) {
      receivers.push(this);
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return new Response(String(input).includes('manifest') ? JSON.stringify(catalog) : body);
    }
    const storage = new MemoryOfflineStorage();
    const manager = new OfflinePackageManager(storage, new MemoryPackageCache(), browserFetch);

    expect((await manager.list())[0]).toMatchObject({ state: 'available', descriptor: { id: 'enem-2024' } });
    await expect(manager.install('enem-2024')).resolves.toMatchObject({ packageId: 'enem-2024' });
    expect(receivers).toEqual([globalThis, globalThis]);
  });

  it('downloads once, survives an offline reload, and removes a selected package', async () => {
    const body = packageBody(); const catalog = await manifest(body);
    const storage = new MemoryOfflineStorage(); const cache = new MemoryPackageCache();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(String(input).includes('manifest') ? JSON.stringify(catalog) : body));
    const manager = new OfflinePackageManager(storage, cache, fetcher, () => 100);

    expect((await manager.list())[0]?.state).toBe('available');
    await manager.install('enem-2024');
    expect((await manager.list(false))[0]?.state).toBe('downloaded');
    await manager.install('enem-2024');
    expect(fetcher).toHaveBeenCalledTimes(2); // manifest + one package

    const offlineManager = new OfflinePackageManager(storage, cache, async () => { throw new Error('offline'); });
    expect((await offlineManager.loadQuestions())[0]?.id).toBe('enem-enem-2024-1');
    await offlineManager.remove('enem-2024');
    expect(await offlineManager.loadQuestions()).toEqual([]);
  });

  it('marks changed hash/version and retains the installed package if validation fails', async () => {
    const firstBody = packageBody(); const secondBody = packageBody('Conteúdo atualizado');
    const first = await manifest(firstBody); const second = await manifest(secondBody, 2);
    const storage = new MemoryOfflineStorage(); const cache = new MemoryPackageCache();
    let currentBody = firstBody;
    const manager = new OfflinePackageManager(storage, cache, async (input) => new Response(String(input).includes('manifest') ? JSON.stringify(first) : currentBody));
    await manager.refreshCatalog(); await manager.install('enem-2024');
    await storage.putCatalog(second);
    expect((await manager.list(false))[0]?.state).toBe('update-available');
    currentBody = `${secondBody}corrompido`;
    await expect(manager.install('enem-2024')).rejects.toThrow(/byte size|integrity/);
    expect((await storage.getDownload('enem-2024'))?.version).toBe(1);
    expect((await manager.loadQuestions())[0]?.context).toBe('Quanto é 2 + 2?');
  });
});

const viewedEvent: ProgressEvent = {
  type: 'question_viewed', eventId: '00000000-0000-4000-8000-000000000001', deviceId: '00000000-0000-4000-8000-000000000002',
  questionId: 'enem-enem-2024-1', occurredAt: 10, localDay: '2026-08-23',
};

describe('offline sync queue', () => {
  it('invokes the native-like sync fetch with the browser global receiver', async () => {
    const receivers: unknown[] = [];
    async function browserFetch(this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
      receivers.push(this);
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      expect(JSON.parse(String(init?.body))).toEqual({ cursor: null, events: [] });
      return Response.json({ acceptedEventIds: [], changes: [], nextCursor: 'cursor-1', hasMore: false });
    }

    await expect(new FetchSyncTransport('/api/sync', browserFetch).sync({ cursor: null, events: [] })).resolves.toMatchObject({ nextCursor: 'cursor-1' });
    expect(receivers).toEqual([globalThis]);
  });

  it('appends idempotently and acknowledges a successful batch', async () => {
    const storage = new MemoryOfflineStorage(); await storage.appendProgress(viewedEvent); await storage.appendProgress(viewedEvent);
    const response: SyncResponse = { acceptedEventIds: [viewedEvent.eventId], changes: [], nextCursor: 'cursor-1', hasMore: false };
    const transport = { sync: vi.fn(async () => response) };
    expect(await new SyncQueue(storage, transport, () => 1_000).flush()).toBe(true);
    expect(await storage.listProgress()).toHaveLength(1);
    expect(await storage.listOutbox(1_000)).toHaveLength(0);
    expect(await storage.getSyncCursor()).toBe('cursor-1');
  });

  it('keeps failures queued with exponential retry metadata', async () => {
    const storage = new MemoryOfflineStorage(); await storage.appendProgress(viewedEvent);
    const queue = new SyncQueue(storage, { sync: async () => { throw new Error('sem rede'); } }, () => 5_000);
    expect(await queue.flush()).toBe(false);
    expect(await storage.listOutbox(5_000)).toHaveLength(0);
    const pending = await storage.listOutbox(5_000 + retryDelayMs(1));
    expect(pending[0]).toMatchObject({ attempt: 1, lastError: 'sem rede' });
  });
});
