import { describe, expect, it, vi } from 'vitest';

import package2022Body from '../public/data/enem/enem-2022.json?raw';
import package2023Body from '../public/data/enem/enem-2023.json?raw';
import manifestBody from '../public/data/manifest.json?raw';

import { catalogManifestSchema } from '../src/contracts/catalog';
import { questionPackageSchema } from '../src/contracts/question';
import { packageDescriptor, serializePackage, upsertEnemManifest } from '../src/data/catalog-builder';
import { EnemApiClient, type EnemApiQuestion } from '../src/data/enem-api';
import {
  createEnemPackage,
  isCompleteEnemQuestion,
  normalizeEnemQuestion,
} from '../src/data/enem-normalizer';

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

const publishedPackageBodies = new Map([
  ['enem-2022', package2022Body],
  ['enem-2023', package2023Body],
]);

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

  it('ships both real imported editions with valid manifest hashes, sizes, and counts', async () => {
    const manifest = catalogManifestSchema.parse(JSON.parse(manifestBody));
    expect(manifest.packages.map(({ id, questionCount }) => [id, questionCount])).toEqual([
      ['enem-2022', 185],
      ['enem-2023', 182],
    ]);

    for (const descriptor of manifest.packages) {
      const body = publishedPackageBodies.get(descriptor.id);
      if (body === undefined) throw new Error(`missing test fixture for ${descriptor.id}`);
      const questionPackage = questionPackageSchema.parse(JSON.parse(body));

      expect(questionPackage.packageId).toBe(descriptor.id);
      expect(questionPackage.institutionId).toBe(descriptor.institutionId);
      expect(questionPackage.examId).toBe(descriptor.examId);
      expect(questionPackage.editionId).toBe(descriptor.editionId);
      expect(descriptor.byteSize).toBe(new TextEncoder().encode(body).byteLength);
      expect(descriptor.sha256).toBe(`sha256:${await sha256(body)}`);
      expect(descriptor.questionCount).toBe(questionPackage.questions.length);
    }
  });

  it('keeps question ids unique across the published editions', () => {
    const questionIds = [...publishedPackageBodies.values()].flatMap((body) =>
      questionPackageSchema.parse(JSON.parse(body)).questions.map(({ id }) => id),
    );

    expect(questionIds).toHaveLength(367);
    expect(new Set(questionIds).size).toBe(questionIds.length);
  });

  it('publishes one common copy plus both language variants for positions 1-5', () => {
    for (const [packageId, body] of publishedPackageBodies) {
      const questions = questionPackageSchema.parse(JSON.parse(body)).questions;
      const languageQuestions = questions.filter(({ language }) => language !== null);
      expect(languageQuestions.filter(({ language }) => language === 'ingles')).toHaveLength(5);
      expect(languageQuestions.filter(({ language }) => language === 'espanhol')).toHaveLength(5);
      expect(questions.filter(({ language }) => language === null).map(({ id }) => id))
        .not.toContain(`${packageId.replace('enem-', 'enem-enem-')}-1`);
      expect(new Set(questions.map(({ id }) => id)).size).toBe(questions.length);
    }
  });
});
