import { describe, expect, it, vi } from 'vitest';

import type { CatalogManifest, QuestionPackage } from '../../src/contracts';
import { MemoryOfflineStorage, MemoryPackageCache, OfflinePackageManager } from '../../src/offline';

const encoder = new TextEncoder();

function packagePayload(context: string, file: string | null = null): QuestionPackage {
  return {
    schemaVersion: 1,
    packageId: 'enem-2024',
    institutionId: 'inep',
    examId: 'enem',
    editionId: 'enem-2024',
    questions: [{
      id: 'enem-enem-2024-1',
      institutionId: 'inep',
      examId: 'enem',
      editionId: 'enem-2024',
      year: 2024,
      subjectId: 'matematica',
      kind: 'single-choice',
      context,
      files: file ? [file] : [],
      alternativesIntroduction: null,
      alternatives: [
        { id: 'a', label: 'A', text: '3', file: null },
        { id: 'b', label: 'B', text: '4', file: null },
      ],
      answer: { optionIds: ['b'] },
    }],
  };
}

async function hash(body: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function catalog(body: string, version: number): Promise<CatalogManifest> {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-23T12:00:00-03:00',
    institutions: [{ id: 'inep', name: 'INEP' }],
    exams: [{ id: 'enem', institutionId: 'inep', name: 'ENEM', category: 'vestibular' }],
    editions: [{ id: 'enem-2024', examId: 'enem', label: 'ENEM 2024', year: 2024 }],
    subjects: [{ id: 'matematica', name: 'Matemática' }],
    packages: [{
      id: 'enem-2024', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024',
      url: '/data/enem/enem-2024.json', version, sha256: await hash(body),
      byteSize: encoder.encode(body).byteLength, questionCount: 1,
      subjectIds: ['matematica'], questionKinds: ['single-choice'],
    }],
  };
}

describe('offline package lifecycle integration', () => {
  it('installs assets, reloads without a network, updates atomically, and removes the package', async () => {
    const v1 = JSON.stringify(packagePayload('Versão inicial', '/images/figure.png'));
    const v2 = JSON.stringify(packagePayload('Versão atualizada', '/images/figure.png'));
    const manifestV1 = await catalog(v1, 1);
    const manifestV2 = await catalog(v2, 2);
    const storage = new MemoryOfflineStorage();
    const cache = new MemoryPackageCache();
    let currentBody = v1;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('manifest')) return new Response(JSON.stringify(manifestV1));
      if (url.includes('figure.png')) return new Response('image-bytes');
      return new Response(currentBody);
    });
    const manager = new OfflinePackageManager(storage, cache, fetcher, () => 100);

    await manager.refreshCatalog();
    await manager.install('enem-2024');
    expect([...cache.assets.keys()].some((url) => new URL(url).pathname === '/images/figure.png')).toBe(true);

    const reloadedOffline = new OfflinePackageManager(storage, cache, async () => {
      throw new Error('offline');
    }, () => 200);
    expect((await reloadedOffline.loadQuestions())[0]?.context).toBe('Versão inicial');

    await storage.putCatalog(manifestV2);
    expect((await manager.list(false))[0]?.state).toBe('update-available');
    currentBody = `${v2}invalid`;
    await expect(manager.install('enem-2024')).rejects.toThrow(/byte size|integrity/);
    expect((await reloadedOffline.loadQuestions())[0]?.context).toBe('Versão inicial');

    currentBody = v2;
    await manager.install('enem-2024');
    expect((await manager.loadQuestions())[0]?.context).toBe('Versão atualizada');
    expect(cache.packages.has(manifestV1.packages[0]!.sha256)).toBe(false);

    await manager.remove('enem-2024');
    expect(await manager.loadQuestions()).toEqual([]);
    expect(await storage.listDownloads()).toEqual([]);
  });

  it('does not install when capacity is insufficient and ignores a corrupted cache on reload', async () => {
    const body = JSON.stringify(packagePayload('Conteúdo íntegro'));
    const manifest = await catalog(body, 1);
    const storage = new MemoryOfflineStorage();
    const cache = new MemoryPackageCache();
    const manager = new OfflinePackageManager(
      storage,
      cache,
      async (input) => new Response(String(input).includes('manifest') ? JSON.stringify(manifest) : body),
      () => 100,
      async () => ({ available: body.length - 1 }),
    );
    await manager.refreshCatalog();
    await expect(manager.install('enem-2024')).rejects.toThrow(/Not enough storage/);
    expect(await storage.listDownloads()).toEqual([]);

    const enoughCapacity = new OfflinePackageManager(storage, cache, async () => new Response(body), () => 200, async () => ({ available: null }));
    await enoughCapacity.install('enem-2024');
    await cache.putPackage(manifest.packages[0]!, new Response('corrupted'));
    expect(await enoughCapacity.loadQuestions()).toEqual([]);
  });
});
