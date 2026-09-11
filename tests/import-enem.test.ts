import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { catalogManifestSchema } from '../src/contracts/catalog';
import { parseArgs, run } from '../scripts/import-enem';

const YEARS = [2001, 2002, 2003];

const sourceQuestion = (year: number) => ({
  title: `Questão 1 - ENEM ${year}`,
  index: 1,
  discipline: 'Matemática',
  language: null,
  year,
  context: 'Contexto',
  files: [],
  correctAlternative: 'B',
  alternativesIntroduction: null,
  alternatives: [
    { letter: 'A', text: 'Errada', file: null, isCorrect: false },
    { letter: 'B', text: 'Certa', file: null, isCorrect: true },
  ],
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/exams') {
      response.end(
        JSON.stringify(YEARS.map((year) => ({ title: `ENEM ${year}`, year, disciplines: [], languages: [] }))),
      );
      return;
    }
    const match = url.pathname.match(/^\/exams\/(\d+)\/questions$/);
    if (match) {
      response.end(
        JSON.stringify({
          metadata: { limit: 50, offset: 0, total: 1, hasMore: false },
          questions: [sourceQuestion(Number(match[1]))],
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('import:enem CLI', () => {
  it('requires --year or --all and refuses to combine them', () => {
    expect(() => parseArgs([])).toThrow(/informe --year ou use --all/);
    expect(() => parseArgs(['--all', '--year', '2024'])).toThrow(/não pode ser combinado/);
    expect(() => parseArgs(['--all', '--desconhecida', 'x'])).toThrow(/opção desconhecida/);
    expect(parseArgs(['--all', '--force'])).toMatchObject({ all: true, year: null, force: true });
    expect(parseArgs(['--year', '2024', '--version', '2'])).toMatchObject({ all: false, year: 2024, version: 2 });
  });

  it('discovers every edition and writes one package and descriptor per edition', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'enem-all-'));
    try {
      const reportPath = join(outputRoot, 'report.json');
      await run({
        year: null,
        all: true,
        force: true,
        version: 1,
        pageSize: 50,
        outputRoot,
        apiBaseUrl: baseUrl,
        report: reportPath,
      });

      const manifest = catalogManifestSchema.parse(
        JSON.parse(await readFile(join(outputRoot, 'manifest.json'), 'utf8')),
      );
      expect(manifest.packages.map(({ id }) => id)).toEqual(['enem-2001', 'enem-2002', 'enem-2003']);
      for (const descriptor of manifest.packages) {
        const body = await readFile(join(outputRoot, 'enem', `${descriptor.id}.json`), 'utf8');
        expect(new TextEncoder().encode(body).byteLength).toBe(descriptor.byteSize);
      }

      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      expect(report.summary).toMatchObject({
        editionCount: 3,
        publishedCount: 3,
        skippedCount: 0,
        questionCount: 3,
      });
      expect(report.editions.map(({ year }: { year: number }) => year)).toEqual(YEARS);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('skips already published editions without --force and re-imports them with --force', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'enem-skip-'));
    try {
      const options = { year: null, all: true, version: 1, pageSize: 50, outputRoot, apiBaseUrl: baseUrl, report: null };
      await run({ ...options, force: true });

      const skippedReport = join(outputRoot, 'skipped.json');
      await run({ ...options, force: false, report: skippedReport });
      const skipped = JSON.parse(await readFile(skippedReport, 'utf8'));
      expect(skipped.summary).toMatchObject({ publishedCount: 0, skippedCount: 3 });

      await run({ ...options, force: true });
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
