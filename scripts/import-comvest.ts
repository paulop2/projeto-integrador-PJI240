#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { catalogManifestSchema, type CatalogManifest } from '../src/contracts/catalog';
import {
  packageDescriptor,
  serializePackage,
  upsertComvestManifest,
} from '../src/data/catalog-builder';
import {
  comvestExamId,
  createComvestPackages,
  toComvestSourceImagePath,
  type ComvestIgnoredAsset,
  type ComvestRejection,
} from '../src/data/comvest-normalizer';
import {
  collectAvailableImages,
  exists,
  readSourceEntries,
  sha256File,
} from './comvest-source';

interface CliOptions {
  source: string;
  outputRoot: string;
  imagesDir: string | null;
  zipPath: string | null;
  expectedZipSha256: string | null;
  commit: string | null;
  version: number;
  report: string | null;
}

const usage = `Uso: npm run import:comvest -- --source <raiz-extraida-do-BLUEX> [opções]

Opções:
  --source DIR                Raiz extraída do BLUEX (com questions/UNICAMP e imgs/UNICAMP). Obrigatório.
  --output DIR                Diretório público de dados (padrão: public/data).
  --images DIR                Diretório de imagens (padrão: <source>/imgs/UNICAMP).
  --zip ARQUIVO               ZIP de origem para conferir a proveniência.
  --expected-sha256 HEX       SHA-256 esperado do ZIP; exige --zip.
  --commit SHA                Commit de origem do dataset, registrado na proveniência.
  --version N                 Versão crescente dos pacotes (padrão: 1).
  --report ARQUIVO            Grava o relatório de importação (contagens, rejeições, assets ignorados).
`;

const positiveInteger = (raw: string | undefined, flag: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} exige um inteiro positivo`);
  return value;
};

const parseArgs = (args: readonly string[]): CliOptions => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag?.startsWith('--')) throw new Error(`argumento desconhecido: ${flag ?? ''}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} exige um valor`);
    values.set(flag, value);
    index += 1;
  }

  const source = values.get('--source');
  if (!source) throw new Error('--source é obrigatório');
  const known = new Set([
    '--source',
    '--output',
    '--images',
    '--zip',
    '--expected-sha256',
    '--commit',
    '--version',
    '--report',
  ]);
  for (const flag of values.keys()) if (!known.has(flag)) throw new Error(`opção desconhecida: ${flag}`);

  const zipPath = values.get('--zip') ?? null;
  const expectedZipSha256 = values.get('--expected-sha256') ?? null;
  if (expectedZipSha256 && !zipPath) throw new Error('--expected-sha256 exige --zip');

  return {
    source: resolve(source),
    outputRoot: resolve(values.get('--output') ?? 'public/data'),
    imagesDir: values.get('--images') ? resolve(values.get('--images') as string) : null,
    zipPath: zipPath ? resolve(zipPath) : null,
    expectedZipSha256: expectedZipSha256?.toLowerCase() ?? null,
    commit: values.get('--commit') ?? null,
    version: positiveInteger(values.get('--version') ?? '1', '--version'),
    report: values.get('--report') ? resolve(values.get('--report') as string) : null,
  };
};

const writeAtomic = async (path: string, body: string | Uint8Array): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, body);
  await rename(temporary, path);
};

interface ZipProvenance {
  readonly fileName: string;
  readonly sha256: string;
  readonly expected: string | null;
  readonly verified: boolean;
}

const verifyZip = async (options: CliOptions): Promise<ZipProvenance | null> => {
  if (!options.zipPath) return null;
  const sha256 = await sha256File(options.zipPath);
  const verified = options.expectedZipSha256 === null || sha256 === options.expectedZipSha256;
  if (!verified) {
    throw new Error(`SHA-256 do ZIP não confere: ${sha256} != ${options.expectedZipSha256}`);
  }
  return {
    fileName: basename(options.zipPath),
    sha256,
    expected: options.expectedZipSha256,
    verified,
  };
};

const assetDestination = (outputRoot: string, assetUrl: string): string =>
  join(outputRoot, assetUrl.replace(`/data/`, ''));

export interface ImportReport {
  readonly generatedBy: 'scripts/import-comvest.ts';
  readonly provenance: {
    readonly dataset: 'BLUEX';
    readonly institution: 'unicamp';
    readonly phase: 'first';
    readonly commit: string | null;
    readonly zip: ZipProvenance | null;
  };
  readonly summary: {
    readonly sourceQuestionCount: number;
    readonly publishedQuestionCount: number;
    readonly rejectedQuestionCount: number;
    readonly referencedAssetCount: number;
    readonly ignoredAssetCount: number;
    readonly editions: readonly {
      readonly editionId: string;
      readonly year: number;
      readonly day: number | null;
      readonly questionCount: number;
      readonly subjectIds: readonly string[];
    }[];
  };
  readonly rejections: readonly ComvestRejection[];
  readonly ignoredAssets: readonly ComvestIgnoredAsset[];
}

export const run = async (options: CliOptions): Promise<void> => {
  const questionsDir = join(options.source, 'questions', 'UNICAMP');
  if (!(await exists(questionsDir))) {
    throw new Error(`diretório de questões não encontrado: ${questionsDir}`);
  }

  const zipProvenance = await verifyZip(options);
  const imagesDir = options.imagesDir ?? join(options.source, 'imgs', 'UNICAMP');
  const availableImageFiles = await collectAvailableImages(imagesDir, options.source);
  const entries = await readSourceEntries(questionsDir);
  const result = createComvestPackages(entries, { availableImageFiles });
  if (result.packages.length === 0) {
    throw new Error('nenhuma edição pôde ser normalizada a partir do snapshot');
  }

  const referencedSourceImages = result.referencedAssets.map(toComvestSourceImagePath);
  const missingAssets = referencedSourceImages.filter((path) => !availableImageFiles.has(path));
  if (missingAssets.length > 0) {
    throw new Error(`assets referenciados ausentes no snapshot: ${missingAssets.join(', ')}`);
  }

  const manifestPath = join(options.outputRoot, 'manifest.json');
  let manifest: CatalogManifest | null = null;
  if (await exists(manifestPath)) {
    manifest = catalogManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  }

  for (const edition of result.packages) {
    const body = serializePackage(edition.package);
    const descriptor = await packageDescriptor(edition.package, body, options.version);
    const published = manifest?.packages.find(({ id }) => id === descriptor.id);
    if (published && options.version < published.version) {
      throw new Error(
        `a versão ${options.version} de ${descriptor.id} é menor que a publicada (${published.version})`,
      );
    }
    const packagePath = join(options.outputRoot, comvestExamId, `${edition.editionId}.json`);
    await writeAtomic(packagePath, body);
    manifest = upsertComvestManifest(manifest, descriptor, {
      year: edition.year,
      day: edition.day,
    });
  }

  for (const assetUrl of result.referencedAssets) {
    const sourcePath = join(options.source, toComvestSourceImagePath(assetUrl));
    const destination = assetDestination(options.outputRoot, assetUrl);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
  }

  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report: ImportReport = {
    generatedBy: 'scripts/import-comvest.ts',
    provenance: {
      dataset: 'BLUEX',
      institution: 'unicamp',
      phase: 'first',
      commit: options.commit,
      zip: zipProvenance,
    },
    summary: {
      sourceQuestionCount: entries.length,
      publishedQuestionCount: result.packages.reduce(
        (total, { package: questionPackage }) => total + questionPackage.questions.length,
        0,
      ),
      rejectedQuestionCount: result.rejections.length,
      referencedAssetCount: result.referencedAssets.length,
      ignoredAssetCount: result.ignoredAssets.length,
      editions: result.packages.map(({ editionId, year, day, package: questionPackage }) => ({
        editionId,
        year,
        day,
        questionCount: questionPackage.questions.length,
        subjectIds: [...new Set(questionPackage.questions.map(({ subjectId }) => subjectId))].sort(),
      })),
    },
    rejections: result.rejections,
    ignoredAssets: result.ignoredAssets,
  };

  if (options.report) await writeAtomic(options.report, `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(
    `Importadas ${report.summary.publishedQuestionCount} de ${report.summary.sourceQuestionCount} questões em ${result.packages.length} edição(ões); ` +
      `${report.summary.rejectedQuestionCount} rejeitada(s), ${report.summary.referencedAssetCount} asset(s) publicado(s), ` +
      `${report.summary.ignoredAssetCount} asset(s) ignorado(s).\n`,
  );
  for (const rejection of result.rejections) {
    process.stderr.write(
      `Rejeitada ${rejection.sourceId ?? rejection.sourceFile}: ${rejection.reason}${rejection.detail ? ` (${rejection.detail})` : ''}.\n`,
    );
  }
  for (const ignored of result.ignoredAssets) {
    process.stderr.write(`Asset ignorado ${ignored.path}: ${ignored.reason}.\n`);
  }
};

const invokedAsCli = process.argv.some((argument) =>
  argument.replaceAll('\\', '/').endsWith('/scripts/import-comvest.ts'),
);

if (invokedAsCli) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
    process.exitCode = 1;
  }
}
