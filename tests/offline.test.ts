import { describe, expect, it, vi } from 'vitest';

import type { ActiveExamPreference, CatalogManifest, ProgressEvent, SyncResponse } from '../src/contracts';
import { ActiveExamError, CatalogError, FetchSyncTransport, MemoryOfflineStorage, MemoryPackageCache, OfflineActiveExamPort, OfflinePackageManager, OfflinePackagePort, OfflineQuestionSourcePort, SyncQueue, retryDelayMs } from '../src/offline';

const editionPackageBody = (packageId: string, editionId: string, year: number, context: string) => JSON.stringify({
  schemaVersion: 1,
  packageId,
  institutionId: 'inep',
  examId: 'enem',
  editionId,
  questions: [{
    id: `enem-${editionId}-1`, institutionId: 'inep', examId: 'enem', editionId, year,
    subjectId: 'matematica', kind: 'single-choice', context, files: [], alternativesIntroduction: null,
    alternatives: [{ id: 'a', label: 'A', text: '3', file: null }, { id: 'b', label: 'B', text: '4', file: null }],
    answer: { optionIds: ['b'] },
  }],
});

const packageBody = (context = 'Quanto é 2 + 2?') => editionPackageBody('enem-2024', 'enem-2024', 2024, context);

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

async function multiEditionManifest(entries: Array<{ packageId: string; editionId: string; label: string; year: number; body: string; version: number }>): Promise<CatalogManifest> {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-09T12:00:00-03:00',
    institutions: [{ id: 'inep', name: 'INEP' }],
    exams: [{ id: 'enem', institutionId: 'inep', name: 'ENEM', category: 'vestibular' }],
    editions: entries.map(({ editionId, label, year }) => ({ id: editionId, examId: 'enem', label, year })),
    subjects: [{ id: 'matematica', name: 'Matemática' }],
    packages: await Promise.all(entries.map(async ({ packageId, editionId, body, version }) => ({
      id: packageId,
      institutionId: 'inep',
      examId: 'enem',
      editionId,
      url: `/data/enem/${packageId}.json`,
      version,
      sha256: await sha256(body),
      byteSize: new TextEncoder().encode(body).byteLength,
      questionCount: 1,
      subjectIds: ['matematica'],
      questionKinds: ['single-choice'],
    }))),
  };
}

async function activeExamFixture() {
  const entries = [
    { packageId: 'enem-2022-completo', editionId: 'enem-2022', label: 'ENEM — edição 2022', year: 2022, body: editionPackageBody('enem-2022-completo', 'enem-2022', 2022, 'Questão de 2022'), version: 1 },
    { packageId: 'enem-2023-completo', editionId: 'enem-2023', label: 'ENEM — edição 2023', year: 2023, body: editionPackageBody('enem-2023-completo', 'enem-2023', 2023, 'Questão de 2023'), version: 1 },
  ];
  const catalog = await multiEditionManifest(entries);
  const bodies = new Map(entries.map(({ packageId, body }) => [packageId, body]));
  const storage = new MemoryOfflineStorage();
  const cache = new MemoryPackageCache();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('manifest')) return Response.json(catalog);
    const packageId = [...bodies.keys()].find((id) => url.includes(id));
    return packageId ? new Response(bodies.get(packageId)) : new Response(null, { status: 404 });
  });
  const manager = new OfflinePackageManager(storage, cache, fetcher);
  await manager.refreshCatalog();
  await manager.install(entries[0]!.packageId);
  await manager.install(entries[1]!.packageId);
  return { cache, catalog, entries, manager, storage };
}

describe('offline packages', () => {
  it('exposes complete catalog metadata for two editions and keeps lifecycle operations keyed by package ID', async () => {
    const body2022 = editionPackageBody('enem-2022-completo', 'enem-2022', 2022, 'Questão de 2022');
    const body2023 = editionPackageBody('enem-2023-completo', 'enem-2023', 2023, 'Questão de 2023');
    const entries = [
      { packageId: 'enem-2022-completo', editionId: 'enem-2022', label: 'ENEM — edição 2022', year: 2022, body: body2022, version: 1 },
      { packageId: 'enem-2023-completo', editionId: 'enem-2023', label: 'ENEM — edição 2023', year: 2023, body: body2023, version: 1 },
    ];
    let catalog = await multiEditionManifest(entries);
    const bodies = new Map(entries.map(({ packageId, body }) => [packageId, body]));
    const storage = new MemoryOfflineStorage();
    const cache = new MemoryPackageCache();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('manifest')) return Response.json(catalog);
      const packageId = [...bodies.keys()].find((id) => url.includes(id));
      return packageId ? new Response(bodies.get(packageId)) : new Response(null, { status: 404 });
    });
    const port = new OfflinePackagePort(new OfflinePackageManager(storage, cache, fetcher));

    expect(await port.list()).toEqual([
      {
        id: 'enem-2022-completo', institutionId: 'inep', examId: 'enem', editionId: 'enem-2022',
        label: 'ENEM — edição 2022', year: 2022, byteSize: new TextEncoder().encode(body2022).byteLength,
        questionCount: 1, state: 'available',
      },
      {
        id: 'enem-2023-completo', institutionId: 'inep', examId: 'enem', editionId: 'enem-2023',
        label: 'ENEM — edição 2023', year: 2023, byteSize: new TextEncoder().encode(body2023).byteLength,
        questionCount: 1, state: 'available',
      },
    ]);

    await port.install('enem-2022-completo');
    expect((await storage.listDownloads()).map(({ packageId }) => packageId)).toEqual(['enem-2022-completo']);
    expect((await port.list()).map(({ id, state }) => [id, state])).toEqual([
      ['enem-2022-completo', 'downloaded'],
      ['enem-2023-completo', 'available'],
    ]);

    await port.install('enem-2023-completo');
    const updatedBody2022 = editionPackageBody('enem-2022-completo', 'enem-2022', 2022, 'Questão de 2022 atualizada');
    bodies.set('enem-2022-completo', updatedBody2022);
    catalog = await multiEditionManifest([
      { ...entries[0]!, body: updatedBody2022, version: 2 },
      entries[1]!,
    ]);
    expect((await port.list()).map(({ id, state }) => [id, state])).toEqual([
      ['enem-2022-completo', 'update-available'],
      ['enem-2023-completo', 'downloaded'],
    ]);

    await port.install('enem-2022-completo');
    expect((await storage.getDownload('enem-2022-completo'))?.version).toBe(2);
    expect((await storage.getDownload('enem-2023-completo'))?.version).toBe(1);
    await port.remove('enem-2022-completo');
    expect((await port.list()).map(({ id, state }) => [id, state])).toEqual([
      ['enem-2022-completo', 'available'],
      ['enem-2023-completo', 'downloaded'],
    ]);
  });

  it('reports a controlled error when no validated catalog is available', async () => {
    const manager = new OfflinePackageManager(
      new MemoryOfflineStorage(),
      new MemoryPackageCache(),
      async () => { throw new Error('offline'); },
    );

    await expect(new OfflinePackagePort(manager).list()).rejects.toEqual(expect.objectContaining({
      name: 'CatalogError',
      message: 'No validated catalog is available',
    }));
  });

  it('reports a controlled error for inconsistent stored catalog metadata', async () => {
    const body = packageBody();
    const catalog = await manifest(body);
    const storage = new MemoryOfflineStorage();
    await storage.putCatalog({ ...catalog, editions: [] });
    const manager = new OfflinePackageManager(
      storage,
      new MemoryPackageCache(),
      async () => { throw new Error('offline'); },
    );

    await expect(new OfflinePackagePort(manager).list()).rejects.toBeInstanceOf(CatalogError);
    await expect(new OfflinePackagePort(manager).list()).rejects.toThrow('Stored catalog is inconsistent');
  });

  it('reports malformed downloaded catalog JSON as a controlled error', async () => {
    const manager = new OfflinePackageManager(
      new MemoryOfflineStorage(),
      new MemoryPackageCache(),
      async () => new Response('{'),
    );

    await expect(manager.refreshCatalog()).rejects.toEqual(expect.objectContaining({
      name: 'CatalogError',
      message: 'Downloaded catalog is not valid JSON',
    }));
  });

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
    expect(await offlineManager.restoreActiveExam()).toEqual({ status: 'empty' });
    expect(await storage.getActiveExamPreference()).toBeNull();

    await manager.install('enem-2024');
    expect(await manager.restoreActiveExam()).toEqual({ status: 'active', packageId: 'enem-2024', editionId: 'enem-2024' });
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
    expect((await manager.list(false))[0]?.state).toBe('update-available');
    expect(await storage.getActiveExamPreference()).toEqual({
      selectionRequired: false,
      selection: { packageId: 'enem-2024', editionId: 'enem-2024' },
    });
    expect((await manager.loadQuestions())[0]?.context).toBe('Quanto é 2 + 2?');
  });
});

describe('active exam preference', () => {
  it('loads only the exact active package and returns no feed without a valid selection', async () => {
    const { entries, manager, storage } = await activeExamFixture();
    const source = new OfflineQuestionSourcePort(manager);
    const progress: ProgressEvent = {
      type: 'question_viewed', eventId: '00000000-0000-4000-8000-000000000021', deviceId: '00000000-0000-4000-8000-000000000022',
      questionId: 'enem-enem-2022-1', occurredAt: 10, localDay: '2026-09-10',
    };
    await storage.appendProgress(progress);
    await storage.putSession(progress.questionId, { startedAt: 10, selectedOptionId: null, outcome: null });

    expect((await source.load()).map(({ editionId }) => editionId)).toEqual(['enem-2022']);
    await manager.selectActiveExam(entries[1]!.packageId, entries[1]!.editionId);
    expect((await source.load()).map(({ editionId }) => editionId)).toEqual(['enem-2023']);
    expect(await storage.listProgress()).toEqual([progress]);
    expect(await storage.getSessions()).toEqual({
      [progress.questionId]: { startedAt: 10, selectedOptionId: null, outcome: null },
    });

    await storage.deleteActiveExamPreference();
    await expect(source.load()).resolves.toEqual([]);
  });

  it('persists a package and edition pair and restores it without a network', async () => {
    const { cache, entries, manager, storage } = await activeExamFixture();
    const port = new OfflineActiveExamPort(manager);

    await expect(port.select(entries[1]!.packageId, entries[1]!.editionId)).resolves.toEqual({
      status: 'active', packageId: 'enem-2023-completo', editionId: 'enem-2023',
    });
    expect(await storage.getActiveExamPreference()).toEqual({
      selectionRequired: false,
      selection: { packageId: 'enem-2023-completo', editionId: 'enem-2023' },
    });

    const reloadedOffline = new OfflineActiveExamPort(new OfflinePackageManager(storage, cache, async () => {
      throw new Error('offline');
    }));
    await expect(reloadedOffline.initialize()).resolves.toEqual({
      status: 'active', packageId: 'enem-2023-completo', editionId: 'enem-2023',
    });
  });

  it('applies the startup policy for absent and obsolete preferences', async () => {
    const { entries, manager, storage } = await activeExamFixture();
    const port = new OfflineActiveExamPort(manager);

    await storage.deleteActiveExamPreference();
    await expect(port.initialize()).resolves.toEqual({ status: 'selection-required' });
    expect(await storage.getActiveExamPreference()).toEqual({ selectionRequired: true, selection: null });

    await manager.remove(entries[0]!.packageId);
    await storage.putActiveExamPreference({
      selectionRequired: false,
      selection: { packageId: 'pacote-obsoleto', editionId: 'edicao-obsoleta' },
    });
    await expect(port.initialize()).resolves.toEqual({
      status: 'active', packageId: 'enem-2023-completo', editionId: 'enem-2023',
    });
  });

  it('rejects a package whose local cache is missing or corrupt without changing the valid selection', async () => {
    const { cache, catalog, entries, manager, storage } = await activeExamFixture();
    const previous = await storage.getActiveExamPreference();
    await cache.putPackage(catalog.packages[1]!, new Response('corrompido'));

    await expect(manager.selectActiveExam(entries[1]!.packageId, entries[1]!.editionId)).rejects.toBeInstanceOf(ActiveExamError);
    await expect(manager.selectActiveExam(entries[0]!.packageId, entries[1]!.editionId)).rejects.toThrow(/not installed and intact/);
    expect(await storage.getActiveExamPreference()).toEqual(previous);
  });

  it('invalidates the removed active exam and preserves unrelated offline data', async () => {
    const { entries, manager, storage } = await activeExamFixture();
    const event: ProgressEvent = {
      type: 'question_viewed', eventId: '00000000-0000-4000-8000-000000000011', deviceId: '00000000-0000-4000-8000-000000000012',
      questionId: 'enem-enem-2022-1', occurredAt: 10, localDay: '2026-09-09',
    };
    await storage.appendProgress(event);
    await storage.putSession(event.questionId, { startedAt: 10, selectedOptionId: null, outcome: null });

    await manager.remove(entries[0]!.packageId);

    await expect(manager.restoreActiveExam()).resolves.toEqual({ status: 'selection-required' });
    expect((await storage.listDownloads()).map(({ packageId }) => packageId)).toEqual(['enem-2023-completo']);
    expect(await storage.listProgress()).toEqual([event]);
    expect((await storage.listOutbox(10))[0]?.event).toEqual(event);
    expect(await storage.getSessions()).toEqual({ [event.questionId]: { startedAt: 10, selectedOptionId: null, outcome: null } });
  });

  it('removes a non-active exam without changing the feed, preference, progress, or sessions', async () => {
    const { entries, manager, storage } = await activeExamFixture();
    const source = new OfflineQuestionSourcePort(manager);
    const event: ProgressEvent = {
      type: 'question_viewed', eventId: '00000000-0000-4000-8000-000000000031', deviceId: '00000000-0000-4000-8000-000000000032',
      questionId: 'enem-enem-2023-1', occurredAt: 10, localDay: '2026-09-10',
    };
    await storage.appendProgress(event);
    await storage.putSession(event.questionId, { startedAt: 10, selectedOptionId: null, outcome: null });
    const previousPreference = await storage.getActiveExamPreference();

    await manager.remove(entries[1]!.packageId);

    expect((await source.load()).map(({ editionId }) => editionId)).toEqual(['enem-2022']);
    expect(await storage.getActiveExamPreference()).toEqual(previousPreference);
    expect(await storage.listProgress()).toEqual([event]);
    expect(await storage.getSessions()).toEqual({ [event.questionId]: { startedAt: 10, selectedOptionId: null, outcome: null } });
  });

  it('keeps the active package intact when removal storage fails and succeeds on retry', async () => {
    class FailsFirstRemovalStorage extends MemoryOfflineStorage {
      private shouldFail = true;

      override async removeDownload(packageId: string, nextActiveExamPreference?: ActiveExamPreference | null) {
        if (this.shouldFail) {
          this.shouldFail = false;
          throw new Error('storage unavailable');
        }
        await super.removeDownload(packageId, nextActiveExamPreference);
      }
    }

    const body = packageBody();
    const catalog = await manifest(body);
    const storage = new FailsFirstRemovalStorage();
    const cache = new MemoryPackageCache();
    const manager = new OfflinePackageManager(storage, cache, async (input) => new Response(String(input).includes('manifest') ? JSON.stringify(catalog) : body));
    await manager.refreshCatalog();
    await manager.install('enem-2024');

    await expect(manager.remove('enem-2024')).rejects.toThrow('storage unavailable');
    expect((await manager.loadQuestions())[0]?.context).toBe('Quanto é 2 + 2?');
    expect(await storage.getActiveExamPreference()).toEqual({
      selectionRequired: false,
      selection: { packageId: 'enem-2024', editionId: 'enem-2024' },
    });

    await expect(manager.remove('enem-2024')).resolves.toBeUndefined();
    expect(await manager.restoreActiveExam()).toEqual({ status: 'empty' });
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
