#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { catalogManifestSchema, type CatalogManifest } from '../src/contracts/catalog';
import type { BluexBoard } from '../src/data/bluex-board';
import {
  createBluexPackages,
  toBluexSourceImagePath,
  type BluexIgnoredAsset,
  type BluexRejection,
} from '../src/data/bluex-normalizer';
import { packageDescriptor, serializePackage, upsertBluexManifest } from '../src/data/catalog-builder';
import {
  collectAvailableImages,
  exists,
  readSourceEntries,
  sha256File,
} from './bluex-source';

export interface BluexImportOptions {
  source: string;
  outputRoot: string;
  imagesDir: string | null;
  zipPath: string | null;
  expectedZipSha256: string | null;
  commit: string | null;
  version: number;
  report: string | null;
}

const positiveInteger = (raw: string | undefined, flag: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} exige um inteiro positivo`);
  return value;
};

const KNOWN_FLAGS = new Set([
  '--source',
  '--output',
  '--images',
  '--zip',
  '--expected-sha256',
  '--commit',
  '--version',
  '--report',
]);

export const parseBluexImportArgs = (args: readonly string[]): BluexImportOptions => {
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
  for (const flag of values.keys()) if (!KNOWN_FLAGS.has(flag)) throw new Error(`opção desconhecida: ${flag}`);

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

export const bluexImportUsage = (
  command: string,
  board: BluexBoard,
): string => `Uso: npm run import:${board.id} -- --source <raiz-extraida-do-BLUEX> [opções]

${command}

Opções:
  --source DIR                Raiz extraída do BLUEX (com questions/${board.sourceUniversityDir} e imgs/${board.sourceUniversityDir}). Obrigatório.
  --output DIR                Diretório público de dados (padrão: public/data).
  --images DIR                Diretório de imagens (padrão: <source>/imgs/${board.sourceUniversityDir}).
  --zip ARQUIVO               ZIP de origem para conferir a proveniência.
  --expected-sha256 HEX       SHA-256 esperado do ZIP; exige --zip.
  --commit SHA                Commit de origem do dataset, registrado na proveniência.
  --version N                 Versão crescente dos pacotes (padrão: 1).
  --report ARQUIVO            Grava o relatório de importação (contagens, rejeições, assets ignorados).
`;

const writeAtomic = async (path: string, body: string | Uint8Array): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, body);
  await rename(temporary, path);
};

export interface ZipProvenance {
  readonly fileName: string;
  readonly sha256: string;
  readonly expected: string | null;
  readonly verified: boolean;
}

const verifyZip = async (options: BluexImportOptions): Promise<ZipProvenance | null> => {
  if (!options.zipPath) return null;
  const sha256 = await sha256File(options.zipPath);
  const expected = options.expectedZipSha256;
  if (expected !== null && sha256 !== expected) {
    throw new Error(`SHA-256 do ZIP não confere: ${sha256} != ${expected}`);
  }
  return {
    fileName: basename(options.zipPath),
    sha256,
    expected,
    verified: expected !== null,
  };
};

const resolveInside = (root: string, relativePath: string): string => {
  const base = resolve(root);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error(`caminho fora do diretório de dados: ${relativePath}`);
  }
  return target;
};

const assetDestination = (outputRoot: string, assetUrl: string): string =>
  resolveInside(outputRoot, assetUrl.replace(/^\/data\//, ''));

export interface BluexImportReport {
  readonly generatedBy: string;
  readonly board: BluexBoard['id'];
  readonly provenance: {
    readonly dataset: 'BLUEX';
    readonly institution: BluexBoard['university'];
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
  readonly rejections: readonly BluexRejection[];
  readonly ignoredAssets: readonly BluexIgnoredAsset[];
}

export const runBluexImport = async (
  board: BluexBoard,
  options: BluexImportOptions,
  generatedBy: string,
): Promise<void> => {
  const questionsDir = join(options.source, 'questions', board.sourceUniversityDir);
  if (!(await exists(questionsDir))) {
    throw new Error(`diretório de questões não encontrado: ${questionsDir}`);
  }

  const zipProvenance = await verifyZip(options);
  const imagesDir = options.imagesDir ?? join(options.source, 'imgs', board.sourceUniversityDir);
  const availableImageFiles = await collectAvailableImages(imagesDir, options.source);
  const entries = await readSourceEntries(questionsDir);
  const result = createBluexPackages(entries, board, { availableImageFiles });
  if (result.packages.length === 0) {
    throw new Error('nenhuma edição pôde ser normalizada a partir do snapshot');
  }

  const referencedSourceImages = result.referencedAssets.map((assetUrl) =>
    toBluexSourceImagePath(board, assetUrl),
  );
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
    const packagePath = join(options.outputRoot, board.examId, `${edition.editionId}.json`);
    await writeAtomic(packagePath, body);
    manifest = upsertBluexManifest(manifest, descriptor, board, {
      year: edition.year,
      day: edition.day,
    });
  }

  for (const assetUrl of result.referencedAssets) {
    const sourcePath = resolveInside(options.source, toBluexSourceImagePath(board, assetUrl));
    const destination = assetDestination(options.outputRoot, assetUrl);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
  }

  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report: BluexImportReport = {
    generatedBy,
    board: board.id,
    provenance: {
      dataset: 'BLUEX',
      institution: board.university,
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
    `Importadas ${report.summary.publishedQuestionCount} de ${report.summary.sourceQuestionCount} questões de ${board.university} em ${result.packages.length} edição(ões); ` +
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

export const runBluexImportCli = async (
  board: BluexBoard,
  scriptFileName: string,
): Promise<void> => {
  const invokedAsCli = process.argv.some((argument) =>
    argument.replaceAll('\\', '/').endsWith(`/scripts/${scriptFileName}`),
  );
  if (!invokedAsCli) return;

  try {
    await runBluexImport(
      board,
      parseBluexImportArgs(process.argv.slice(2)),
      `scripts/${scriptFileName}`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${bluexImportUsage(`Importa as questões objetivas da ${board.examName}.`, board)}`,
    );
    process.exitCode = 1;
  }
};
