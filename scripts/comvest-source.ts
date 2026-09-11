#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  normalizeSourcePath,
  type ComvestInventorySourceEntry,
} from '../src/data/comvest-inventory';

export const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

export const sha256File = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
};

export const listFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  await walk(root);
  return files.sort();
};

export const readSourceEntries = async (
  questionsDir: string,
): Promise<ComvestInventorySourceEntry[]> => {
  const files = (await listFiles(questionsDir)).filter((file) =>
    file.toLowerCase().endsWith('.json'),
  );
  const entries: ComvestInventorySourceEntry[] = [];
  for (const file of files) {
    const relativeFile = normalizeSourcePath(relative(questionsDir, file));
    const body = await readFile(file, 'utf8');
    try {
      entries.push({ file: relativeFile, raw: JSON.parse(body) });
    } catch (error) {
      throw new Error(
        `JSON inválido em ${relativeFile}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return entries;
};

export const collectAvailableImages = async (
  imagesDir: string,
  sourceRoot: string,
): Promise<Set<string>> => {
  if (!(await exists(imagesDir))) return new Set();
  const files = await listFiles(imagesDir);
  return new Set(files.map((file) => normalizeSourcePath(relative(sourceRoot, file))));
};
