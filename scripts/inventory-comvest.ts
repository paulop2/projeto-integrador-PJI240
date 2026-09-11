#!/usr/bin/env node
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import {
  buildComvestInventory,
  summarizeComvestInventory,
} from '../src/data/comvest-inventory';
import {
  collectAvailableImages,
  exists,
  readSourceEntries,
  sha256File,
} from './comvest-source';

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
