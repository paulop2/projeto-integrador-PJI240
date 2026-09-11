import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ArtifactRef } from '../src/contracts/ingestion';
import { artifactRefSchema, runLedgerSchema } from '../src/contracts/ingestion';
import type { ArtifactStorage } from '../src/data/artifact-store';
import {
  ArtifactConflictError,
  ArtifactIntegrityError,
  ArtifactStore,
  MemoryArtifactStorage,
  artifactUriFor,
  canonicalJson,
  sha256Text,
} from '../src/data/artifact-store';
import { MemoryStageCache, RunLedgerRecorder } from '../src/data/run-ledger';
import { createFileArtifactStorage, createFileStageCache } from '../scripts/artifact-store-fs';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const decoder = new TextDecoder();

const snapshot = encode('BLUEX snapshot bytes');
const packageBody = '{"package":true}\n';

const runPipeline = async (
  store: ArtifactStore,
  cache: MemoryStageCache | ReturnType<typeof createFileStageCache>,
  config: Readonly<Record<string, string | number | boolean | null>> = {
    layoutProfile: 'comvest-bluex-objective',
    layoutVersion: 1,
    acceptedKind: 'single-choice',
  },
) => {
  const executions = { count: 0 };
  const sourceRef = await store.put({
    kind: 'source-snapshot',
    mediaType: 'application/zip',
    bytes: snapshot,
  });

  const recorder = new RunLedgerRecorder({
    store,
    cache,
    toolchain: [
      { name: 'bluex-bootstrap', version: '1.0.0' },
      { name: 'node', version: '24.14.1' },
    ],
    inputs: [sourceRef],
    config,
  });

  const stage = await recorder.stage({
    id: 'normalize',
    revision: '1',
    execute: async () => {
      executions.count += 1;
      const ref = await store.put({
        kind: 'question-package',
        mediaType: 'application/json',
        bytes: encode(packageBody),
      });
      return [ref];
    },
  });

  const ledgerRef = await recorder.finalize();
  return { executions, stage, ledgerRef, sourceRef };
};

const validArtifact = async (): Promise<ArtifactRef> => {
  const sha256 = await sha256Text('artifact');
  return {
    kind: 'source-snapshot',
    sha256,
    uri: artifactUriFor(sha256),
    byteSize: 8,
    mediaType: 'application/octet-stream',
  };
};

describe('ingestion artifact contract', () => {
  it('requires a content address in the sha256:<hex> shape', async () => {
    const ref = await validArtifact();
    expect(artifactRefSchema.parse(ref).sha256).toBe(ref.sha256);
    expect(() => artifactRefSchema.parse({ ...ref, sha256: 'deadbeef' })).toThrow();
  });

  it('rejects a negative byte size and an unknown artifact kind', async () => {
    const ref = await validArtifact();
    expect(() => artifactRefSchema.parse({ ...ref, byteSize: -1 })).toThrow();
    expect(() => artifactRefSchema.parse({ ...ref, kind: 'certificate' })).toThrow();
  });

  it('rejects a ledger output that no stage produced', async () => {
    const artifact = await validArtifact();
    const cacheKey = await sha256Text('cache');
    const ledger = {
      schemaVersion: 1,
      runId: await sha256Text('run'),
      toolchain: [{ name: 'bluex-bootstrap', version: '1.0.0' }],
      config: { layoutVersion: 1 },
      inputs: [artifact],
      outputs: [artifact],
      stages: [
        {
          id: 'normalize',
          revision: '1',
          cacheKey,
          disposition: 'executed',
          inputs: [artifact],
          outputs: [],
        },
      ],
    };
    expect(() => runLedgerSchema.parse(ledger)).toThrow(/was not produced/);
  });

  it('rejects duplicate stage ids even when their cache keys differ', async () => {
    const artifact = await validArtifact();
    const cacheKeyA = await sha256Text('cache-a');
    const cacheKeyB = await sha256Text('cache-b');
    const stage = (cacheKey: string) => ({
      id: 'normalize',
      revision: '1',
      cacheKey,
      disposition: 'reused' as const,
      inputs: [artifact],
      outputs: [artifact],
    });
    const base = {
      schemaVersion: 1,
      runId: await sha256Text('run'),
      toolchain: [{ name: 'bluex-bootstrap', version: '1.0.0' }],
      config: {},
      inputs: [artifact],
      outputs: [artifact],
    };
    expect(() =>
      runLedgerSchema.parse({ ...base, stages: [stage(cacheKeyA), stage(cacheKeyB)] }),
    ).toThrow(/stage ids must be unique/);
  });

  it('rejects duplicate cache keys even when their stage ids differ', async () => {
    const artifact = await validArtifact();
    const cacheKey = await sha256Text('cache');
    const stage = (id: string) => ({
      id,
      revision: '1',
      cacheKey,
      disposition: 'reused' as const,
      inputs: [artifact],
      outputs: [artifact],
    });
    const base = {
      schemaVersion: 1,
      runId: await sha256Text('run'),
      toolchain: [{ name: 'bluex-bootstrap', version: '1.0.0' }],
      config: {},
      inputs: [artifact],
      outputs: [artifact],
    };
    expect(() =>
      runLedgerSchema.parse({ ...base, stages: [stage('normalize'), stage('classify')] }),
    ).toThrow(/stage cache keys must be unique/);
  });
});

describe('content-addressed artifact store', () => {
  it('addresses by content and reuses identical bytes without overwriting', async () => {
    const storage = new MemoryArtifactStorage();
    const store = new ArtifactStore(storage);

    const first = await store.put({
      kind: 'source-snapshot',
      mediaType: 'application/zip',
      bytes: snapshot,
    });
    const second = await store.put({
      kind: 'source-snapshot',
      mediaType: 'application/zip',
      bytes: snapshot,
    });
    const asAnotherKind = await store.put({
      kind: 'approved-corpus',
      mediaType: 'application/json',
      bytes: snapshot,
    });

    expect(second).toEqual(first);
    expect(asAnotherKind.sha256).toBe(first.sha256);
    expect(asAnotherKind.uri).toBe(first.uri);
    expect(storage.writes).toEqual([first.uri]);
    expect(storage.size).toBe(1);
    expect(decoder.decode((await store.read(first))!)).toBe('BLUEX snapshot bytes');
  });

  it('rejects an address whose stored bytes no longer match the hash', async () => {
    const sha256 = await sha256Text('original');
    const storage: ArtifactStorage = {
      async has() {
        return true;
      },
      async read() {
        return encode('tampered');
      },
      async write() {
        throw new Error('a reused artifact must not be written');
      },
    };
    const store = new ArtifactStore(storage);

    await expect(
      store.read({ sha256, uri: artifactUriFor(sha256) }),
    ).rejects.toThrow(ArtifactIntegrityError);
  });

  it('refuses to replace existing bytes at a content address', async () => {
    const sha256 = await sha256Text('original');
    const storage: ArtifactStorage = {
      async has() {
        return true;
      },
      async read() {
        return encode('different');
      },
      async write() {
        throw new Error('a reused artifact must not be written');
      },
    };
    const store = new ArtifactStore(storage);

    await expect(
      store.put({ kind: 'source-snapshot', mediaType: 'application/zip', bytes: encode('original') }),
    ).rejects.toThrow(ArtifactConflictError);
  });

  it('serializes configuration deterministically regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: true, c: null } })).toBe(
      canonicalJson({ a: { c: null, d: true }, b: 1 }),
    );
  });
});

describe('run-ledger determinism', () => {
  it('reuses the same output hashes on a repeated run and never recomputes or overwrites', async () => {
    const storage = new MemoryArtifactStorage();
    const store = new ArtifactStore(storage);
    const cache = new MemoryStageCache();

    const first = await runPipeline(store, cache);
    expect(first.stage.disposition).toBe('executed');
    expect(first.executions.count).toBe(1);
    const output = first.stage.outputs[0]!;
    const filesAfterFirst = storage.size;
    const writesAfterFirst = [...storage.writes];

    const second = await runPipeline(store, cache);
    expect(second.stage.disposition).toBe('reused');
    expect(second.executions.count).toBe(0);
    expect(second.stage.outputs).toEqual(first.stage.outputs);
    expect(second.sourceRef).toEqual(first.sourceRef);

    const newWrites = storage.writes.filter((uri) => !writesAfterFirst.includes(uri));
    expect(newWrites).not.toContain(output.uri);
    expect(decoder.decode((await store.read(output))!)).toBe(packageBody);
    expect(storage.size).toBeGreaterThanOrEqual(filesAfterFirst);

    const firstLedger = runLedgerSchema.parse(
      JSON.parse(decoder.decode((await store.read(first.ledgerRef))!)),
    );
    const secondLedger = runLedgerSchema.parse(
      JSON.parse(decoder.decode((await store.read(second.ledgerRef))!)),
    );
    expect(firstLedger.runId).toBe(secondLedger.runId);
    expect(firstLedger.stages[0]?.disposition).toBe('executed');
    expect(secondLedger.stages[0]?.disposition).toBe('reused');
    expect(secondLedger.outputs).toEqual(firstLedger.outputs);
    expect(secondLedger.stages[0]?.inputs).toEqual([first.sourceRef]);
  });

  it('treats a different configuration as another lineage', async () => {
    const storage = new MemoryArtifactStorage();
    const store = new ArtifactStore(storage);
    const cache = new MemoryStageCache();

    const base = await runPipeline(store, cache);
    const changedConfig = await runPipeline(store, cache, {
      layoutProfile: 'comvest-bluex-objective',
      layoutVersion: 2,
      acceptedKind: 'single-choice',
    });

    expect(base.executions.count).toBe(1);
    expect(changedConfig.executions.count).toBe(1);
    expect(changedConfig.stage.disposition).toBe('executed');
    expect(changedConfig.stage.outputs[0]?.sha256).toBe(base.stage.outputs[0]?.sha256);

    const baseLedger = runLedgerSchema.parse(
      JSON.parse(decoder.decode((await store.read(base.ledgerRef))!)),
    );
    const changedLedger = runLedgerSchema.parse(
      JSON.parse(decoder.decode((await store.read(changedConfig.ledgerRef))!)),
    );
    expect(changedLedger.runId).not.toBe(baseLedger.runId);
  });
});

describe('filesystem artifact storage', () => {
  it('writes once, resumes from the ledger cache and preserves the original bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'artifact-store-'));
    try {
      const storage = createFileArtifactStorage(root);
      const store = new ArtifactStore(storage);
      const cache = createFileStageCache(join(root, 'stage-cache.json'));

      const first = await runPipeline(store, cache);
      const output = first.stage.outputs[0]!;
      const outputPath = join(root, output.uri);
      const original = await readFile(outputPath);

      const second = await runPipeline(store, cache);
      expect(second.stage.disposition).toBe('reused');
      expect(second.executions.count).toBe(0);
      expect(second.stage.outputs).toEqual(first.stage.outputs);
      expect(await readFile(outputPath)).toEqual(original);

      const index = JSON.parse(await readFile(join(root, 'stage-cache.json'), 'utf8'));
      expect(Object.keys(index)).toHaveLength(1);

      await writeFile(outputPath, encode('corrupted'));
      await expect(store.read(output)).rejects.toThrow(ArtifactIntegrityError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces a stage-cache entry with the most recent outputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stage-cache-'));
    try {
      const cache = createFileStageCache(join(root, 'cache.json'));
      const artifact = await validArtifact();
      const cacheKey = await sha256Text('cache');
      await cache.set(cacheKey, [artifact]);
      await cache.set(cacheKey, []);
      expect(await cache.get(cacheKey)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists every entry when stages write the cache concurrently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stage-cache-concurrent-'));
    try {
      const storage = createFileArtifactStorage(root);
      const store = new ArtifactStore(storage);
      const cache = createFileStageCache(join(root, 'cache.json'));

      const recorder = new RunLedgerRecorder({
        store,
        cache,
        toolchain: [{ name: 'bluex-bootstrap', version: '1.0.0' }],
        config: { layoutProfile: 'comvest-bluex-objective', layoutVersion: 1 },
      });

      const runStage = (id: string, body: string) =>
        recorder.stage({
          id,
          revision: '1',
          execute: async () => [
            await store.put({
              kind: 'question-package',
              mediaType: 'application/json',
              bytes: encode(body),
            }),
          ],
        });

      const results = await Promise.all([
        runStage('normalize-a', '{"stage":"a"}\n'),
        runStage('normalize-b', '{"stage":"b"}\n'),
        runStage('normalize-c', '{"stage":"c"}\n'),
      ]);
      expect(results.map(({ disposition }) => disposition)).toEqual([
        'executed',
        'executed',
        'executed',
      ]);

      const index = JSON.parse(await readFile(join(root, 'cache.json'), 'utf8'));
      expect(Object.keys(index)).toHaveLength(3);

      const ledgerRef = await recorder.finalize();
      const ledger = runLedgerSchema.parse(
        JSON.parse(decoder.decode((await store.read(ledgerRef))!)),
      );
      expect(ledger.stages.map(({ id }) => id)).toEqual(['normalize-a', 'normalize-b', 'normalize-c']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('re-executes a stage when a cached output is missing from the store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stage-cache-missing-'));
    try {
      const storage = createFileArtifactStorage(root);
      const store = new ArtifactStore(storage);
      const cache = createFileStageCache(join(root, 'cache.json'));

      const first = await runPipeline(store, cache);
      expect(first.stage.disposition).toBe('executed');
      const output = first.stage.outputs[0]!;

      await rm(join(root, output.uri), { force: true });

      const second = await runPipeline(store, cache);
      expect(second.stage.disposition).toBe('executed');
      expect(second.executions.count).toBe(1);
      expect(second.stage.outputs).toEqual(first.stage.outputs);
      expect(await store.has(output.sha256)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces an obsolete cache entry after a missing output is re-executed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stage-cache-replace-'));
    try {
      const storage = createFileArtifactStorage(root);
      const store = new ArtifactStore(storage);
      const cache = createFileStageCache(join(root, 'cache.json'));
      const toolchain = [{ name: 'bluex-bootstrap', version: '1.0.0' }];
      let body = '{"version":1}\n';

      const runStage = () => {
        const recorder = new RunLedgerRecorder({ store, cache, toolchain });
        return recorder.stage({
          id: 'normalize',
          revision: '1',
          execute: async () => [
            await store.put({
              kind: 'question-package',
              mediaType: 'application/json',
              bytes: encode(body),
            }),
          ],
        });
      };

      const first = await runStage();
      expect(first.disposition).toBe('executed');
      const firstRef = first.outputs[0]!;

      await rm(join(root, firstRef.uri), { force: true });

      body = '{"version":2}\n';
      const second = await runStage();
      expect(second.disposition).toBe('executed');
      const secondRef = second.outputs[0]!;
      expect(secondRef.sha256).not.toBe(firstRef.sha256);
      expect(await store.has(secondRef.sha256)).toBe(true);

      const third = await runStage();
      expect(third.disposition).toBe('reused');
      expect(third.outputs).toEqual([secondRef]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stores identical bytes concurrently without spurious conflicts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'artifact-store-concurrent-'));
    try {
      const storage = createFileArtifactStorage(root);
      const store = new ArtifactStore(storage);

      for (let round = 0; round < 30; round += 1) {
        const bytes = new Uint8Array(2 * 1024 * 1024);
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = (index + round) % 251;
        }

        const refs = await Promise.all(
          Array.from({ length: 8 }, () =>
            store.put({ kind: 'source-snapshot', mediaType: 'application/zip', bytes }),
          ),
        );
        for (const ref of refs) {
          expect(ref).toEqual(refs[0]);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('still rejects divergent bytes at an existing content address', async () => {
    const root = await mkdtemp(join(tmpdir(), 'artifact-store-conflict-'));
    try {
      const storage = createFileArtifactStorage(root);
      const store = new ArtifactStore(storage);
      const bytes = encode('original bytes');
      const ref = await store.put({
        kind: 'source-snapshot',
        mediaType: 'application/zip',
        bytes,
      });

      await writeFile(join(root, ref.uri), encode('tampered bytes'));

      await expect(
        store.put({ kind: 'source-snapshot', mediaType: 'application/zip', bytes }),
      ).rejects.toThrow(ArtifactConflictError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
