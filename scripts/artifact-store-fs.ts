#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { ArtifactRef, Sha256 } from '../src/contracts/ingestion';
import type { ArtifactStorage } from '../src/data/artifact-store';
import type { StageCache } from '../src/data/run-ledger';

/**
 * Filesystem adapters for the ingestion artifact store and stage cache.
 *
 * Artifacts are written once with the exclusive `wx` flag, so an existing file is
 * never overwritten; a repeated write of the same bytes only verifies integrity.
 * The stage cache is a JSON index keyed by cache key and is written atomically.
 */

export interface FileArtifactStorage extends ArtifactStorage {
  readonly root: string;
}

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
};

export const createFileArtifactStorage = (root: string): FileArtifactStorage => {
  const base = resolve(root);

  const resolveUri = (uri: string): string => {
    const target = resolve(base, uri);
    if (target !== base && !target.startsWith(`${base}${sep}`)) {
      throw new Error(`artifact path escapes the store root: ${uri}`);
    }
    return target;
  };

  return {
    root: base,
    async has(uri) {
      return exists(resolveUri(uri));
    },
    async read(uri) {
      try {
        return new Uint8Array(await readFile(resolveUri(uri)));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async write(uri, bytes) {
      const path = resolveUri(uri);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx' });
    },
  };
};

const readIndex = async (path: string): Promise<Record<string, ArtifactRef[]>> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, ArtifactRef[]>;
  } catch (error) {
    if (isMissing(error)) return {};
    throw error;
  }
};

/**
 * Serializes read-modify-write cycles per resolved index path. Stages are expected
 * to run in parallel, so two `set()` calls on the same cache would otherwise
 * interleave their reads and writes and lose entries (or collide on the temporary
 * file used for the atomic rename). The queue lives in this process; it does not
 * coordinate across processes.
 */
const writeQueues = new Map<string, Promise<void>>();

const withWriteLock = <T>(path: string, task: () => Promise<T>): Promise<T> => {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  writeQueues.set(path, tail);
  void tail.then(() => {
    if (writeQueues.get(path) === tail) writeQueues.delete(path);
  });
  return run;
};

let temporaryCounter = 0;

export const createFileStageCache = (indexPath: string): StageCache => {
  const path = resolve(indexPath);

  return {
    async get(cacheKey: Sha256) {
      const index = await readIndex(path);
      return index[cacheKey] ?? null;
    },
    async set(cacheKey: Sha256, outputs: readonly ArtifactRef[]) {
      await withWriteLock(path, async () => {
        const index = await readIndex(path);
        if (index[cacheKey]) return;
        index[cacheKey] = [...outputs];
        await mkdir(dirname(path), { recursive: true });
        temporaryCounter += 1;
        const temporary = `${path}.tmp-${process.pid}-${temporaryCounter}-${randomUUID()}`;
        await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`);
        await rename(temporary, path);
      });
    },
  };
};
