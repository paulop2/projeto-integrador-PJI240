#!/usr/bin/env node
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { catalogManifestSchema, type CatalogManifest } from '../src/contracts/catalog';
import {
  packageDescriptor,
  serializePackage,
  upsertEnemManifest,
} from '../src/data/catalog-builder';
import { EnemApiClient } from '../src/data/enem-api';
import { createEnemPackage, isCompleteEnemQuestion } from '../src/data/enem-normalizer';

interface CliOptions {
  year: number;
  force: boolean;
  version: number;
  pageSize: number;
  outputRoot: string;
  apiBaseUrl?: string;
}

const usage = `Uso: npm run import:enem -- --year 2024 [opções]

Opções:
  --year ANO          Edição do ENEM (obrigatório)
  --version N         Versão crescente do pacote (padrão: 1)
  --page-size N       Itens por página da API (padrão: 50)
  --output DIR        Diretório público de dados (padrão: public/data)
  --api-base-url URL  Endpoint alternativo, útil para self-hosting
  --force             Substitui um pacote já existente
`;

const positiveInteger = (raw: string | undefined, flag: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} exige um inteiro positivo`);
  return value;
};

export const parseArgs = (args: readonly string[]): CliOptions => {
  const values = new Map<string, string>();
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--force') {
      force = true;
      continue;
    }
    if (!flag?.startsWith('--')) throw new Error(`argumento desconhecido: ${flag ?? ''}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} exige um valor`);
    values.set(flag, value);
    index += 1;
  }

  const year = positiveInteger(values.get('--year'), '--year');
  if (year < 1998 || year > 3000) throw new Error('--year deve estar entre 1998 e 3000');
  const known = new Set(['--year', '--version', '--page-size', '--output', '--api-base-url']);
  for (const flag of values.keys()) if (!known.has(flag)) throw new Error(`opção desconhecida: ${flag}`);

  const apiBaseUrl = values.get('--api-base-url');
  return {
    year,
    force,
    version: positiveInteger(values.get('--version') ?? '1', '--version'),
    pageSize: positiveInteger(values.get('--page-size') ?? '50', '--page-size'),
    outputRoot: resolve(values.get('--output') ?? 'public/data'),
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
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

const writeAtomic = async (path: string, body: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, body, 'utf8');
  await rename(temporary, path);
};

export const run = async (options: CliOptions): Promise<void> => {
  const packagePath = join(options.outputRoot, 'enem', `enem-${options.year}.json`);
  const manifestPath = join(options.outputRoot, 'manifest.json');
  if (!options.force && (await exists(packagePath))) {
    throw new Error(`${packagePath} já existe; use --force para substituir`);
  }

  const client = new EnemApiClient({
    ...(options.apiBaseUrl ? { baseUrl: options.apiBaseUrl } : {}),
  });
  const sourceQuestions = await client.listQuestions(options.year, options.pageSize);
  if (sourceQuestions.length === 0) throw new Error(`a API não retornou questões para ${options.year}`);

  const incomplete = sourceQuestions.filter((question) => !isCompleteEnemQuestion(question));
  const importable = sourceQuestions.filter(isCompleteEnemQuestion);
  if (incomplete.length > 0) {
    process.stderr.write(
      `Ignoradas questões incompletas na fonte enem.dev: ${incomplete.map(({ index }) => index).join(', ')}.\n`,
    );
  }

  const questionPackage = createEnemPackage(options.year, importable);
  const packageBody = serializePackage(questionPackage);
  const descriptor = await packageDescriptor(questionPackage, packageBody, options.version);

  let currentManifest: CatalogManifest | null = null;
  if (await exists(manifestPath)) {
    currentManifest = catalogManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
    const currentDescriptor = currentManifest.packages.find(({ id }) => id === descriptor.id);
    if (currentDescriptor && options.version < currentDescriptor.version) {
      throw new Error(`a versão ${options.version} é menor que a publicada (${currentDescriptor.version})`);
    }
  }
  const manifest = upsertEnemManifest(currentManifest, descriptor, options.year);

  await writeAtomic(packagePath, packageBody);
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Importadas ${descriptor.questionCount} questões em ${packagePath} (${descriptor.sha256}).\n`,
  );
};

const invokedAsCli = process.argv.some((argument) =>
  argument.replaceAll('\\', '/').endsWith('/scripts/import-enem.ts'),
);

if (invokedAsCli) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
    process.exitCode = 1;
  }
}
