#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import {
  buildComvestInventory,
  normalizeSourcePath,
  summarizeComvestInventory,
  type ComvestInventorySourceEntry,
} from '../src/data/comvest-inventory';

interface CliOptions {
  source: string;
  output: string | null;
  pretty: boolean;
  imagesDir: string | null;
  zipPath: string | null;
  expectedZipSha256: string | null;
  commit: string | null;
}

const usage = `Uso: npm run inventory:comvest -- --source <raiz-extraida-do-BLUEX> [opções]

Opções:
  --source DIR                Raiz extraída do BLUEX (com questions/UNICAMP e imgs/UNICAMP).
  --out ARQUIVO               Grava o inventário JSON no arquivo (padrão: stdout).
  --images DIR                Diretório de imagens (padrão: <source>/imgs/UNICAMP).
  --zip ARQUIVO               ZIP de origem para conferir a proveniência.
  --expected-sha256 HEX       SHA-256 esperado do ZIP; exige --zip.
  --commit SHA                Commit de origem do dataset, registrado na proveniência.
  --pretty                    Formata o JSON com indentação.
`;

const parseArgs = (args: readonly string[]): CliOptions => {
  const values = new Map<string, string>();
  let pretty = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--pretty') {
      pretty = true;
      continue;
    }
    if (!flag?.startsWith('--')) throw new Error(`argumento desconhecido: ${flag ?? ''}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} exige um valor`);
    values.set(flag, value);
    index += 1;
  }

  const source = values.get('--source');
  if (!source) throw new Error('--source é obrigatório');
  const known = new Set(['--source', '--out', '--images', '--zip', '--expected-sha256', '--commit']);
  for (const flag of values.keys()) if (!known.has(flag)) throw new Error(`opção desconhecida: ${flag}`);

  const zipPath = values.get('--zip') ?? null;
  const expectedZipSha256 = values.get('--expected-sha256') ?? null;
  if (expectedZipSha256 && !zipPath) throw new Error('--expected-sha256 exige --zip');

  return {
    source: resolve(source),
    output: values.get('--out') ? resolve(values.get('--out') as string) : null,
    pretty,
    imagesDir: values.get('--images') ? resolve(values.get('--images') as string) : null,
    zipPath: zipPath ? resolve(zipPath) : null,
    expectedZipSha256: expectedZipSha256?.toLowerCase() ?? null,
    commit: values.get('--commit') ?? null,
  };
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

const sha256File = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
};

const listFiles = async (root: string): Promise<string[]> => {
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

const readSourceEntries = async (questionsDir: string): Promise<ComvestInventorySourceEntry[]> => {
  const files = (await listFiles(questionsDir)).filter((file) => file.toLowerCase().endsWith('.json'));
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

const collectAvailableImages = async (
  imagesDir: string,
  sourceRoot: string,
): Promise<Set<string>> => {
  if (!(await exists(imagesDir))) return new Set();
  const files = await listFiles(imagesDir);
  return new Set(files.map((file) => normalizeSourcePath(relative(sourceRoot, file))));
};

const writeAtomic = async (path: string, body: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, body, 'utf8');
  await rename(temporary, path);
};

export const run = async (options: CliOptions): Promise<void> => {
  const questionsDir = join(options.source, 'questions', 'UNICAMP');
  if (!(await exists(questionsDir))) {
    throw new Error(`diretório de questões não encontrado: ${questionsDir}`);
  }

  let zipProvenance: { fileName: string; sha256: string; expected: string | null; verified: boolean } | null = null;
  if (options.zipPath) {
    const sha256 = await sha256File(options.zipPath);
    const verified = options.expectedZipSha256 === null || sha256 === options.expectedZipSha256;
    if (!verified) {
      throw new Error(`SHA-256 do ZIP não confere: ${sha256} != ${options.expectedZipSha256}`);
    }
    zipProvenance = {
      fileName: basename(options.zipPath),
      sha256,
      expected: options.expectedZipSha256,
      verified,
    };
  }

  const imagesDir = options.imagesDir ?? join(options.source, 'imgs', 'UNICAMP');
  const availableImageFiles = await collectAvailableImages(imagesDir, options.source);
  const entries = await readSourceEntries(questionsDir);
  const build = buildComvestInventory(entries);
  const summary = summarizeComvestInventory(build, { availableImageFiles });

  const payload = {
    generatedBy: 'scripts/inventory-comvest.ts',
    provenance: {
      dataset: 'BLUEX',
      institution: 'unicamp',
      phase: 'first',
      commit: options.commit,
      zip: zipProvenance,
    },
    summary,
    records: build.records,
  };

  const body = `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`;
  if (options.output) {
    await writeAtomic(options.output, body);
    process.stdout.write(
      `Inventariadas ${summary.questionCount} questões de ${summary.byYear.length} ano(s) em ${options.output}.\n`,
    );
  } else {
    process.stdout.write(body);
  }
};

const invokedAsCli = process.argv.some((argument) =>
  argument.replaceAll('\\', '/').endsWith('/scripts/inventory-comvest.ts'),
);

if (invokedAsCli) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
    process.exitCode = 1;
  }
}
