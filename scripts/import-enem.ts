#!/usr/bin/env node
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { catalogManifestSchema, type CatalogManifest } from '../src/contracts/catalog';
import {
  packageDescriptor,
  serializePackage,
  upsertEnemManifest,
} from '../src/data/catalog-builder';
import { EnemApiClient, type EnemMissingLanguageVariant } from '../src/data/enem-api';
import {
  createEnemPackage,
  findMissingQuestionIndexes,
  partitionEnemQuestions,
  type EnemRejection,
} from '../src/data/enem-normalizer';

const DEFAULT_API_BASE_URL = 'https://api.enem.dev/v1';

interface CliOptions {
  year: number | null;
  all: boolean;
  force: boolean;
  version: number;
  pageSize: number;
  outputRoot: string;
  apiBaseUrl?: string;
  report: string | null;
}

const usage = `Uso: npm run import:enem -- --all [opções]
      npm run import:enem -- --year 2024 [opções]

Modos:
  --all               Descobre todas as edições em ${DEFAULT_API_BASE_URL}/exams e importa cada uma.
  --year ANO          Importa uma única edição.

Opções:
  --version N         Versão crescente do pacote (padrão: 1; nunca reduz a versão publicada)
  --page-size N       Itens por página da API (padrão: 50)
  --output DIR        Diretório público de dados (padrão: public/data)
  --api-base-url URL  Endpoint alternativo, útil para self-hosting
  --report ARQUIVO    Grava o relatório por edição (publicadas, rejeições e lacunas)
  --force             Substitui pacotes já existentes
`;

const positiveInteger = (raw: string | undefined, flag: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} exige um inteiro positivo`);
  return value;
};

export const parseArgs = (args: readonly string[]): CliOptions => {
  const values = new Map<string, string>();
  let force = false;
  let all = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--force') {
      force = true;
      continue;
    }
    if (flag === '--all') {
      all = true;
      continue;
    }
    if (!flag?.startsWith('--')) throw new Error(`argumento desconhecido: ${flag ?? ''}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} exige um valor`);
    values.set(flag, value);
    index += 1;
  }

  const known = new Set(['--year', '--version', '--page-size', '--output', '--api-base-url', '--report']);
  for (const flag of values.keys()) if (!known.has(flag)) throw new Error(`opção desconhecida: ${flag}`);

  const rawYear = values.get('--year');
  if (all && rawYear) throw new Error('--all não pode ser combinado com --year');
  if (!all && !rawYear) throw new Error('informe --year ou use --all');

  let year: number | null = null;
  if (rawYear) {
    year = positiveInteger(rawYear, '--year');
    if (year < 1998 || year > 3000) throw new Error('--year deve estar entre 1998 e 3000');
  }

  const apiBaseUrl = values.get('--api-base-url');
  const report = values.get('--report');
  return {
    year,
    all,
    force,
    version: positiveInteger(values.get('--version') ?? '1', '--version'),
    pageSize: positiveInteger(values.get('--page-size') ?? '50', '--page-size'),
    outputRoot: resolve(values.get('--output') ?? 'public/data'),
    report: report ? resolve(report) : null,
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

export interface EnemEditionReport {
  readonly year: number;
  readonly status: 'published' | 'skipped';
  readonly packageId: string;
  readonly questionCount: number;
  readonly byteSize: number;
  readonly sha256: string;
  readonly rejections: readonly EnemRejection[];
  readonly missingIndexes: readonly number[];
  readonly missingLanguageVariants: readonly EnemMissingLanguageVariant[];
}

export interface EnemImportReport {
  readonly source: string;
  readonly generatedBy: string;
  readonly summary: {
    readonly editionCount: number;
    readonly publishedCount: number;
    readonly skippedCount: number;
    readonly questionCount: number;
    readonly rejectionCount: number;
    readonly missingIndexCount: number;
    readonly missingLanguageVariantCount: number;
  };
  readonly editions: readonly EnemEditionReport[];
}

const importYear = async (
  client: EnemApiClient,
  options: CliOptions,
  year: number,
  currentManifest: CatalogManifest | null,
): Promise<{ manifest: CatalogManifest; report: EnemEditionReport }> => {
  const packageId = `enem-${year}`;
  const listing = await client.listEdition(year, options.pageSize);
  if (listing.questions.length === 0) throw new Error(`a API não retornou questões para ${year}`);

  const { importable, rejections } = partitionEnemQuestions(listing.questions);
  if (importable.length === 0) throw new Error(`nenhuma questão de ${year} pôde ser importada`);

  const questionPackage = createEnemPackage(year, importable);
  const body = serializePackage(questionPackage);
  const published = currentManifest?.packages.find(({ id }) => id === packageId);
  const version = Math.max(options.version, published?.version ?? 0);
  const descriptor = await packageDescriptor(questionPackage, body, version);
  const manifest = upsertEnemManifest(currentManifest, descriptor, year);

  const packagePath = join(options.outputRoot, 'enem', `${packageId}.json`);
  await writeAtomic(packagePath, body);
  process.stdout.write(
    `Publicadas ${descriptor.questionCount} questões de ${year} em ${packagePath} (${descriptor.sha256}).\n`,
  );
  for (const rejection of rejections) {
    process.stderr.write(
      `Rejeitada ${year}/${rejection.index}${rejection.language ? ` (${rejection.language})` : ''}: ${rejection.reason} (${rejection.detail}).\n`,
    );
  }

  return {
    manifest,
    report: {
      year,
      status: 'published',
      packageId,
      questionCount: descriptor.questionCount,
      byteSize: descriptor.byteSize,
      sha256: descriptor.sha256,
      rejections,
      missingIndexes: findMissingQuestionIndexes(listing.questions),
      missingLanguageVariants: listing.missingLanguageVariants,
    },
  };
};

const readManifest = async (manifestPath: string): Promise<CatalogManifest | null> => {
  if (!(await exists(manifestPath))) return null;
  return catalogManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
};

export const run = async (options: CliOptions): Promise<void> => {
  const manifestPath = join(options.outputRoot, 'manifest.json');
  const client = new EnemApiClient({
    ...(options.apiBaseUrl ? { baseUrl: options.apiBaseUrl } : {}),
  });

  let currentManifest = await readManifest(manifestPath);
  const years = options.all
    ? (await client.listExams()).map(({ year }) => year)
    : [options.year as number];
  if (years.length === 0) throw new Error('a API não listou nenhuma edição');

  const editions: EnemEditionReport[] = [];
  for (const year of years) {
    const packageId = `enem-${year}`;
    const packagePath = join(options.outputRoot, 'enem', `${packageId}.json`);
    const published = currentManifest?.packages.find(({ id }) => id === packageId);
    if (!options.force && published !== undefined && (await exists(packagePath))) {
      editions.push({
        year,
        status: 'skipped',
        packageId,
        questionCount: published?.questionCount ?? 0,
        byteSize: published?.byteSize ?? 0,
        sha256: published?.sha256 ?? '',
        rejections: [],
        missingIndexes: [],
        missingLanguageVariants: [],
      });
      process.stdout.write(`Ignorada ${year}: pacote já existe (use --force para substituir).\n`);
      continue;
    }

    const result = await importYear(client, options, year, currentManifest);
    currentManifest = result.manifest;
    editions.push(result.report);
  }

  if (editions.some(({ status }) => status === 'published')) {
    await writeAtomic(manifestPath, `${JSON.stringify(currentManifest, null, 2)}\n`);
  }

  const report: EnemImportReport = {
    source: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    generatedBy: 'scripts/import-enem.ts',
    summary: {
      editionCount: editions.length,
      publishedCount: editions.filter(({ status }) => status === 'published').length,
      skippedCount: editions.filter(({ status }) => status === 'skipped').length,
      questionCount: editions.reduce((total, { questionCount }) => total + questionCount, 0),
      rejectionCount: editions.reduce((total, { rejections }) => total + rejections.length, 0),
      missingIndexCount: editions.reduce((total, { missingIndexes }) => total + missingIndexes.length, 0),
      missingLanguageVariantCount: editions.reduce(
        (total, { missingLanguageVariants }) => total + missingLanguageVariants.length,
        0,
      ),
    },
    editions,
  };

  if (options.report) await writeAtomic(options.report, `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(
    `ENEM: ${report.summary.publishedCount} edição(ões) publicada(s), ` +
      `${report.summary.skippedCount} ignorada(s), ${report.summary.questionCount} questão(ões); ` +
      `${report.summary.rejectionCount} rejeitada(s), ${report.summary.missingIndexCount} lacuna(s) ` +
      `e ${report.summary.missingLanguageVariantCount} variante(s) de idioma ausente(s).\n`,
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
