import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import enemImportReportBody from '../docs/research/data/enem-import-report.json?raw';
import manifestBody from '../public/data/manifest.json?raw';

import { catalogManifestSchema } from '../src/contracts/catalog';
import { questionPackageSchema } from '../src/contracts/question';
import { packageDescriptor, serializePackage, upsertEnemManifest } from '../src/data/catalog-builder';
import { EnemApiClient, type EnemApiQuestion } from '../src/data/enem-api';
import {
  createEnemPackage,
  findMissingQuestionIndexes,
  isCompleteEnemQuestion,
  normalizeEnemQuestion,
  partitionEnemQuestions,
} from '../src/data/enem-normalizer';

const enemPackageBodies = import.meta.glob('../public/data/enem/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const comvestPackageBodies = import.meta.glob('../public/data/comvest/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fuvestPackageBodies = import.meta.glob('../public/data/fuvest/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sourceQuestion = (overrides: Partial<EnemApiQuestion> = {}): EnemApiQuestion => ({
  title: 'Questão 7 - ENEM 2024',
  index: 7,
  discipline: 'Ciências Humanas',
  language: null,
  year: 2024,
  context: 'Contexto',
  files: ['https://enem.dev/image.png'],
  correctAlternative: 'B',
  alternativesIntroduction: 'Assinale a opção correta.',
  alternatives: [
    { letter: 'A', text: 'Primeira', file: null, isCorrect: false },
    { letter: 'B', text: null, file: 'https://enem.dev/b.png', isCorrect: true },
    { letter: 'C', text: 'Terceira', file: null, isCorrect: false },
    { letter: 'D', text: 'Quarta', file: null, isCorrect: false },
  ],
  ...overrides,
});

const sha256 = async (body: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const parsePublishedEnem = () =>
  [...Object.entries(enemPackageBodies)].map(([file, body]) => {
    const questionPackage = questionPackageSchema.parse(JSON.parse(body));
    return { file, body, questionPackage };
  });

const publishedPackageBodies = new Map(
  parsePublishedEnem().map(({ body, questionPackage }) => [questionPackage.packageId, body]),
);

describe('ENEM normalization', () => {
  it('normalizes source fields without assuming five alternatives', () => {
    const question = normalizeEnemQuestion(sourceQuestion());

    expect(question.id).toBe('enem-enem-2024-7');
    expect(question.subjectId).toBe('ciencias-humanas');
    expect(question.alternatives).toHaveLength(4);
    expect(question.answer.optionIds).toEqual(['b']);
    expect(question.language).toBeNull();
    expect(questionSchemaSafe(question)).toBe(true);
  });

  it('preserves legacy Spanish IDs and isolates English progress with a distinct ID', () => {
    expect(normalizeEnemQuestion(sourceQuestion({ index: 1, language: 'espanhol' })).id)
      .toBe('enem-enem-2024-1');
    expect(normalizeEnemQuestion(sourceQuestion({ index: 1, language: 'ingles' })).id)
      .toBe('enem-enem-2024-1-ingles');
  });

  it('rejects disagreement between answer fields', () => {
    expect(() => normalizeEnemQuestion(sourceQuestion({ correctAlternative: 'A' }))).toThrow(
      /inconsistent answer/,
    );
  });

  it('rejects questions from another year in a package', () => {
    expect(() => createEnemPackage(2024, [sourceQuestion({ year: 2023 })])).toThrow(
      /outside ENEM 2024/,
    );
  });

  it('identifies source questions whose alternatives have no usable content', () => {
    const incomplete = sourceQuestion({
      alternatives: [
        { letter: 'A', text: null, file: null, isCorrect: false },
        { letter: 'B', text: 'Conteúdo', file: null, isCorrect: true },
      ],
    });

    expect(isCompleteEnemQuestion(incomplete)).toBe(false);
    expect(() => normalizeEnemQuestion(incomplete)).toThrow(/without text or file/);
  });

  it('partitions importable questions from explicit rejections and reports gaps', () => {
    const importable = sourceQuestion({ index: 2 });
    const incomplete = sourceQuestion({
      index: 3,
      alternatives: [
        { letter: 'A', text: null, file: null, isCorrect: false },
        { letter: 'B', text: 'Conteúdo', file: null, isCorrect: true },
      ],
    });

    const result = partitionEnemQuestions([importable, incomplete]);

    expect(result.importable.map(({ index }) => index)).toEqual([2]);
    expect(result.rejections).toEqual([
      {
        index: 3,
        language: null,
        reason: 'incomplete-alternatives',
        detail: expect.stringContaining('without text or file'),
      },
    ]);
    expect(findMissingQuestionIndexes([sourceQuestion({ index: 1 }), sourceQuestion({ index: 3 })])).toEqual([2]);
    expect(findMissingQuestionIndexes([sourceQuestion({ index: 1 }), sourceQuestion({ index: 2 })])).toEqual([]);
  });
});

const questionSchemaSafe = (value: unknown) =>
  questionPackageSchema.safeParse({
    schemaVersion: 1,
    packageId: 'enem-2024',
    institutionId: 'inep',
    examId: 'enem',
    editionId: 'enem-2024',
    questions: [value],
  }).success;

describe('ENEM API client', () => {
  it('paginates using the returned item count and throttles to about one request per second', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          metadata: { limit: 1, offset: 0, total: 2, hasMore: true },
          questions: [sourceQuestion({ index: 1 })],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          metadata: { limit: 1, offset: 2, total: 2, hasMore: false },
          questions: [sourceQuestion({ index: 2 })],
        }),
      );
    const client = new EnemApiClient({
      fetch: fetchMock,
      minIntervalMs: 1_000,
      now: () => clock,
      sleep: async (delay) => {
        sleeps.push(delay);
        clock += delay;
      },
    });

    const questions = await client.listQuestions(2024, 1);

    expect(questions.map(({ index }) => index)).toEqual([1, 2]);
    expect(sleeps).toEqual([1_000]);
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('offset=2');
  });

  it('retries rate limits with exponential backoff and honors Retry-After milliseconds', async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 429, headers: { 'retry-after': '250' } }))
      .mockResolvedValueOnce(
        Response.json({
          metadata: { limit: 10, offset: 0, total: 1, hasMore: false },
          questions: [sourceQuestion()],
        }),
      );
    const client = new EnemApiClient({
      fetch: fetchMock,
      minIntervalMs: 1_000,
      initialRetryMs: 100,
      now: () => clock,
      sleep: async (delay) => {
        sleeps.push(delay);
        clock += delay;
      },
    });

    await expect(client.listQuestions(2024)).resolves.toHaveLength(1);
    expect(sleeps).toEqual([250, 750]);
  });

  it('hydrates incomplete list records from the official detail endpoint', async () => {
    const incomplete = sourceQuestion({
      index: 131,
      alternatives: [
        { letter: 'A', text: null, file: null, isCorrect: false },
        { letter: 'B', text: null, file: null, isCorrect: true },
      ],
    });
    const complete = sourceQuestion({ index: 131 });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          metadata: { limit: 50, offset: 0, total: 1, hasMore: false },
          questions: [incomplete],
        }),
      )
      .mockResolvedValueOnce(Response.json(complete));
    const client = new EnemApiClient({
      fetch: fetchMock,
      minIntervalMs: 0,
    });

    const questions = await client.listQuestions(2024);

    expect(questions).toEqual([complete]);
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('/questions/131');
  });

  it('loads both official variants only for foreign-language positions', async () => {
    const spanish = sourceQuestion({ index: 1, language: 'espanhol' });
    const english = sourceQuestion({ index: 1, language: 'ingles', correctAlternative: 'A', alternatives: [
      { letter: 'A', text: 'English answer', file: null, isCorrect: true },
      { letter: 'B', text: 'Other answer', file: null, isCorrect: false },
    ] });
    const common = sourceQuestion({ index: 6, language: null });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        metadata: { limit: 50, offset: 0, total: 2, hasMore: false },
        questions: [spanish, common],
      }))
      .mockResolvedValueOnce(Response.json(english))
      .mockResolvedValueOnce(Response.json(spanish));
    const client = new EnemApiClient({ fetch: fetchMock, minIntervalMs: 0 });

    const questions = await client.listQuestionsWithLanguageVariants(2024);

    expect(questions.map(({ index, language }) => [index, language])).toEqual([
      [1, 'ingles'], [1, 'espanhol'], [6, null],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('language=ingles');
    expect(fetchMock.mock.calls[2]?.[0].toString()).toContain('language=espanhol');
  });

  it('discovers every listed edition without a hardcoded year list', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json([
        { title: 'ENEM 2023', year: 2023, disciplines: [], languages: [] },
        { title: 'ENEM 2009', year: 2009, disciplines: [], languages: [] },
      ]),
    );
    const client = new EnemApiClient({ fetch: fetchMock, minIntervalMs: 0 });

    const exams = await client.listExams();

    expect(exams.map(({ year }) => year)).toEqual([2009, 2023]);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('/exams');
  });

  it('drops identical duplicate listing rows and rejects conflicting ones', async () => {
    const row = sourceQuestion({ index: 1, language: null });
    const duplicateMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        metadata: { limit: 50, offset: 0, total: 2, hasMore: false },
        questions: [row, row],
      }),
    );
    const duplicateClient = new EnemApiClient({ fetch: duplicateMock, minIntervalMs: 0 });
    await expect(duplicateClient.listQuestions(2024)).resolves.toEqual([row]);

    const conflictingMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        metadata: { limit: 50, offset: 0, total: 2, hasMore: false },
        questions: [row, sourceQuestion({ index: 1, language: null, title: 'Outro título' })],
      }),
    );
    const conflictingClient = new EnemApiClient({ fetch: conflictingMock, minIntervalMs: 0 });
    await expect(conflictingClient.listQuestions(2024)).rejects.toThrow(/conflicting duplicates/);
  });

  it('reports a missing language variant instead of aborting the edition', async () => {
    const spanish = sourceQuestion({ index: 1, language: 'espanhol' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        metadata: { limit: 50, offset: 0, total: 1, hasMore: false },
        questions: [spanish],
      }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(Response.json(spanish));
    const client = new EnemApiClient({ fetch: fetchMock, minIntervalMs: 0 });

    const listing = await client.listEdition(2024);

    expect(listing.questions.map(({ index, language }) => [index, language])).toEqual([[1, 'espanhol']]);
    expect(listing.missingLanguageVariants).toEqual([{ index: 1, language: 'ingles' }]);
  });
});

describe('package and catalog generation', () => {
  it('calculates hash and byte size from the exact serialized package', async () => {
    const questionPackage = createEnemPackage(2024, [sourceQuestion()]);
    const body = serializePackage(questionPackage);
    const descriptor = await packageDescriptor(questionPackage, body, 3);

    expect(descriptor.url).toBe('/data/enem/enem-2024.json');
    expect(descriptor.byteSize).toBe(new TextEncoder().encode(body).byteLength);
    expect(descriptor.sha256).toBe(`sha256:${await sha256(body)}`);
    expect(() => upsertEnemManifest(null, descriptor, 2024)).not.toThrow();
  });

  it('ships the fifteen ENEM editions with valid manifest hashes, sizes and counts', async () => {
    const manifest = catalogManifestSchema.parse(JSON.parse(manifestBody));
    const enemDescriptors = manifest.packages.filter(({ examId }) => examId === 'enem');
    const expectedCounts = new Map([
      ['enem-2009', 179],
      ['enem-2010', 185],
      ['enem-2011', 180],
      ['enem-2012', 184],
      ['enem-2013', 185],
      ['enem-2014', 185],
      ['enem-2015', 183],
      ['enem-2016', 184],
      ['enem-2017', 185],
      ['enem-2018', 184],
      ['enem-2019', 181],
      ['enem-2020', 181],
      ['enem-2021', 185],
      ['enem-2022', 185],
      ['enem-2023', 182],
    ]);

    expect(enemDescriptors.map(({ id, questionCount }) => [id, questionCount])).toEqual([
      ...expectedCounts.entries(),
    ]);

    for (const descriptor of enemDescriptors) {
      const body = publishedPackageBodies.get(descriptor.id);
      if (body === undefined) throw new Error(`missing published package ${descriptor.id}`);
      const questionPackage = questionPackageSchema.parse(JSON.parse(body));

      expect(questionPackage.packageId).toBe(descriptor.id);
      expect(questionPackage.institutionId).toBe('inep');
      expect(questionPackage.examId).toBe('enem');
      expect(questionPackage.editionId).toBe(descriptor.id);
      expect(descriptor.byteSize).toBe(new TextEncoder().encode(body).byteLength);
      expect(descriptor.sha256).toBe(`sha256:${await sha256(body)}`);
      expect(descriptor.questionCount).toBe(questionPackage.questions.length);
      expect(questionPackage.questions.every(({ kind }) => kind === 'single-choice')).toBe(true);
    }
  });

  it('keeps question ids unique across ENEM, Comvest and Fuvest', () => {
    const enemIds = parsePublishedEnem().flatMap(({ questionPackage }) =>
      questionPackage.questions.map(({ id }) => id),
    );
    const comvestIds = parsePublishedComvest().flatMap(({ questionPackage }) =>
      questionPackage.questions.map(({ id }) => id),
    );
    const fuvestIds = parsePublishedFuvest().flatMap(({ questionPackage }) =>
      questionPackage.questions.map(({ id }) => id),
    );
    const allIds = [...enemIds, ...comvestIds, ...fuvestIds];

    expect(enemIds).toHaveLength(2748);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('isolates English ids and preserves the legacy Spanish id for every language position', () => {
    for (const { questionPackage } of parsePublishedEnem()) {
      const english = questionPackage.questions.filter(({ language }) => language === 'ingles');
      const spanish = questionPackage.questions.filter(({ language }) => language === 'espanhol');

      expect(english.length).toBeLessThanOrEqual(spanish.length);
      for (const question of english) {
        expect(question.id).toMatch(/-ingles$/);
        const spanishId = question.id.replace(/-ingles$/, '');
        expect(spanish.some(({ id }) => id === spanishId)).toBe(true);
      }
      for (const question of spanish) expect(question.id.endsWith('-ingles')).toBe(false);
      expect(new Set(questionPackage.questions.map(({ id }) => id)).size)
        .toBe(questionPackage.questions.length);
    }
  });

  it('records source rejections, missing indexes and missing language variants per edition', () => {
    const manifest = catalogManifestSchema.parse(JSON.parse(manifestBody));
    const report = JSON.parse(enemImportReportBody) as {
      summary: Record<string, number>;
      editions: Array<{
        year: number;
        status: string;
        packageId: string;
        questionCount: number;
        byteSize: number;
        sha256: string;
        rejections: Array<{ index: number; language: string | null; reason: string }>;
        missingIndexes: number[];
        missingLanguageVariants: Array<{ index: number; language: string }>;
      }>;
    };

    expect(report.summary).toMatchObject({
      editionCount: 15,
      publishedCount: 15,
      skippedCount: 0,
      questionCount: 2748,
      rejectionCount: 1,
      missingIndexCount: 11,
      missingLanguageVariantCount: 1,
    });

    const edition = (year: number) => report.editions.find((item) => item.year === year)!;
    expect(edition(2023).rejections).toEqual([
      { index: 132, language: null, reason: 'incomplete-alternatives', detail: expect.any(String) },
    ]);
    expect(edition(2023).missingIndexes).toEqual([34, 174]);
    expect(edition(2019).missingIndexes).toEqual([98, 100, 128]);
    expect(edition(2019).missingLanguageVariants).toEqual([{ index: 5, language: 'ingles' }]);

    for (const item of report.editions) {
      const descriptor = manifest.packages.find(({ id }) => id === item.packageId);
      expect(descriptor).toBeDefined();
      expect(item.sha256).toBe(descriptor?.sha256);
      expect(item.byteSize).toBe(descriptor?.byteSize);
      expect(item.questionCount).toBe(descriptor?.questionCount);
    }
  });
});

const parsePublishedComvest = () =>
  [...Object.entries(comvestPackageBodies)].map(([file, body]) => {
    const questionPackage = questionPackageSchema.parse(JSON.parse(body));
    return { file, body, questionPackage };
  });

const listPublishedAssets = (root: string): string[] => {
  const assets: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) assets.push(...listPublishedAssets(full));
    else assets.push(full.replaceAll('\\', '/'));
  }
  return assets.sort();
};

describe('Comvest published package', () => {
  it('ships the eight Comvest editions with valid manifest hashes, sizes and counts', async () => {
    const manifest = catalogManifestSchema.parse(JSON.parse(manifestBody));
    const descriptors = manifest.packages.filter(({ examId }) => examId === 'comvest');
    const expectedCounts = new Map([
      ['comvest-2018', 90],
      ['comvest-2019', 89],
      ['comvest-2020', 90],
      ['comvest-2021-day1', 71],
      ['comvest-2021-day2', 70],
      ['comvest-2022', 72],
      ['comvest-2023', 72],
      ['comvest-2024', 72],
    ]);

    expect(descriptors).toHaveLength(8);
    expect(descriptors.map(({ id, questionCount }) => [id, questionCount])).toEqual([
      ...expectedCounts.entries(),
    ]);

    for (const descriptor of descriptors) {
      const body = comvestPackageBodies[`../public/data/comvest/${descriptor.id}.json`];
      if (body === undefined) throw new Error(`missing published package ${descriptor.id}`);
      const questionPackage = questionPackageSchema.parse(JSON.parse(body));

      expect(questionPackage.packageId).toBe(descriptor.id);
      expect(questionPackage.institutionId).toBe('unicamp');
      expect(questionPackage.examId).toBe('comvest');
      expect(questionPackage.editionId).toBe(descriptor.id);
      expect(descriptor.byteSize).toBe(new TextEncoder().encode(body).byteLength);
      expect(descriptor.sha256).toBe(`sha256:${await sha256(body)}`);
      expect(descriptor.questionCount).toBe(questionPackage.questions.length);
      expect(questionPackage.questions.every(({ kind }) => kind === 'single-choice')).toBe(true);
    }
  });

  it('keeps the 2021 day editions distinct and never collides with ENEM or within Comvest', () => {
    const comvestQuestions = parsePublishedComvest().flatMap(({ questionPackage }) =>
      questionPackage.questions,
    );
    const comvestIds = comvestQuestions.map(({ id }) => id);
    const enemIds = [...publishedPackageBodies.values()].flatMap((body) =>
      questionPackageSchema.parse(JSON.parse(body)).questions.map(({ id }) => id),
    );

    expect(comvestQuestions).toHaveLength(626);
    expect(new Set(comvestIds).size).toBe(comvestIds.length);
    expect(new Set([...comvestIds, ...enemIds]).size).toBe(comvestIds.length + enemIds.length);
    expect(comvestIds).toContain('comvest-comvest-2021-day1-UNICAMP_2021_1');
    expect(comvestIds).toContain('comvest-comvest-2021-day2-UNICAMP_2021_1');
    expect(comvestIds).toContain('comvest-comvest-2019-UNICAMP_2019_53');
    expect(comvestIds).not.toContain('comvest-comvest-2021-day2-UNICAMP_2021_68');
  });

  it('publishes every referenced asset locally, leaves no image marker and no orphan asset', () => {
    const questions = parsePublishedComvest().flatMap(({ questionPackage }) =>
      questionPackage.questions,
    );
    const referenced = new Set<string>();
    for (const question of questions) {
      for (const file of question.files) referenced.add(file);
      for (const { file } of question.alternatives) if (file) referenced.add(file);
      const texts = [question.context ?? '', ...question.alternatives.map(({ text }) => text ?? '')];
      expect(texts.join('\n')).not.toContain('[IMAGE');
    }

    for (const file of referenced) {
      expect(file.startsWith('/data/comvest/assets/')).toBe(true);
      expect(existsSync(join('public', file))).toBe(true);
    }

    const publishedAssets = listPublishedAssets(join('public', 'data', 'comvest', 'assets')).map(
      (file) => file.replace(/^public/, ''),
    );
    expect(publishedAssets).toHaveLength(referenced.size);
    expect(publishedAssets.every((file) => referenced.has(file))).toBe(true);
  });
});

const parsePublishedFuvest = () =>
  [...Object.entries(fuvestPackageBodies)].map(([file, body]) => {
    const questionPackage = questionPackageSchema.parse(JSON.parse(body));
    return { file, body, questionPackage };
  });

describe('Fuvest published package', () => {
  it('ships the seven Fuvest editions with valid manifest hashes, sizes and counts', async () => {
    const manifest = catalogManifestSchema.parse(JSON.parse(manifestBody));
    const descriptors = manifest.packages.filter(({ examId }) => examId === 'fuvest');
    const expectedCounts = new Map([
      ['fuvest-2018', 87],
      ['fuvest-2019', 90],
      ['fuvest-2020', 89],
      ['fuvest-2021', 89],
      ['fuvest-2022', 88],
      ['fuvest-2023', 87],
      ['fuvest-2024', 90],
    ]);

    expect(descriptors).toHaveLength(7);
    expect(descriptors.map(({ id, questionCount }) => [id, questionCount])).toEqual([
      ...expectedCounts.entries(),
    ]);

    for (const descriptor of descriptors) {
      const body = fuvestPackageBodies[`../public/data/fuvest/${descriptor.id}.json`];
      if (body === undefined) throw new Error(`missing published package ${descriptor.id}`);
      const questionPackage = questionPackageSchema.parse(JSON.parse(body));

      expect(questionPackage.packageId).toBe(descriptor.id);
      expect(questionPackage.institutionId).toBe('usp');
      expect(questionPackage.examId).toBe('fuvest');
      expect(questionPackage.editionId).toBe(descriptor.id);
      expect(descriptor.byteSize).toBe(new TextEncoder().encode(body).byteLength);
      expect(descriptor.sha256).toBe(`sha256:${await sha256(body)}`);
      expect(descriptor.questionCount).toBe(questionPackage.questions.length);
      expect(questionPackage.questions.every(({ kind }) => kind === 'single-choice')).toBe(true);
    }
  });

  it('keeps Fuvest ids unique and never collides with ENEM, Comvest or within Fuvest', () => {
    const fuvestIds = parsePublishedFuvest().flatMap(({ questionPackage }) =>
      questionPackage.questions.map(({ id }) => id),
    );
    const comvestIds = parsePublishedComvest().flatMap(({ questionPackage }) =>
      questionPackage.questions.map(({ id }) => id),
    );
    const enemIds = [...publishedPackageBodies.values()].flatMap((body) =>
      questionPackageSchema.parse(JSON.parse(body)).questions.map(({ id }) => id),
    );

    expect(fuvestIds).toHaveLength(620);
    expect(new Set(fuvestIds).size).toBe(fuvestIds.length);
    expect(new Set([...fuvestIds, ...comvestIds, ...enemIds]).size).toBe(
      fuvestIds.length + comvestIds.length + enemIds.length,
    );
    expect(fuvestIds).toContain('fuvest-fuvest-2018-USP_2018_1');
    expect(fuvestIds).not.toContain('fuvest-fuvest-2022-USP_2022_54');
    expect(fuvestIds).not.toContain('fuvest-fuvest-2021-USP_2021_25');
  });

  it('publishes image alternatives, every referenced asset locally and no orphan asset', () => {
    const questions = parsePublishedFuvest().flatMap(({ questionPackage }) =>
      questionPackage.questions,
    );
    const referenced = new Set<string>();
    let imageAlternatives = 0;
    for (const question of questions) {
      for (const file of question.files) referenced.add(file);
      for (const { text, file } of question.alternatives) {
        if (file) {
          referenced.add(file);
          if (text === null) imageAlternatives += 1;
        }
      }
      const texts = [question.context ?? '', ...question.alternatives.map(({ text }) => text ?? '')];
      expect(texts.join('\n')).not.toContain('[IMAGE');
    }

    expect(imageAlternatives).toBeGreaterThan(0);
    for (const file of referenced) {
      expect(file.startsWith('/data/fuvest/assets/')).toBe(true);
      expect(existsSync(join('public', file))).toBe(true);
    }

    const publishedAssets = listPublishedAssets(join('public', 'data', 'fuvest', 'assets')).map(
      (file) => file.replace(/^public/, ''),
    );
    expect(publishedAssets).toHaveLength(referenced.size);
    expect(publishedAssets.every((file) => referenced.has(file))).toBe(true);
  });
});
