import { describe, expect, it } from 'vitest';

import {
  bluexQuestionSchema,
  buildComvestInventory,
  summarizeComvestInventory,
  toComvestInventoryRecord,
  type BluexQuestion,
} from '../src/data/comvest-inventory';

const sourceQuestion = (overrides: Partial<BluexQuestion> = {}): BluexQuestion => ({
  question: 'ENUNCIADO que não deve vazar para o inventário.',
  number: 1,
  id: 'UNICAMP_2024_1',
  alternatives: ['a) primeira', 'b) segunda', 'c) terceira', 'd) quarta'],
  associated_images: [],
  answer: 'B',
  has_associated_images: false,
  alternatives_type: 'string',
  subject: ['mathematics'],
  TU: true,
  IU: false,
  MR: false,
  ML: false,
  BK: false,
  PRK: false,
  ...overrides,
});

describe('Comvest inventory records', () => {
  it('keeps only metadata and provenance references, never the question text', () => {
    const record = toComvestInventoryRecord('2024/1.json', sourceQuestion());

    expect(record).toEqual({
      source: 'bluex',
      sourceFile: '2024/1.json',
      year: 2024,
      day: null,
      number: 1,
      sourceId: 'UNICAMP_2024_1',
      subjectIds: ['mathematics'],
      answer: 'B',
      alternativeCount: 4,
      alternativesType: 'string',
      hasImages: false,
      imageRefs: [],
      anomalies: [],
    });
    expect(record).not.toHaveProperty('question');
    expect(record).not.toHaveProperty('alternatives');
  });

  it('derives the day from the 2021 two-day layout and normalizes image paths', () => {
    const record = toComvestInventoryRecord('2021\\day2\\48.json', sourceQuestion({
      id: 'UNICAMP_2021_48',
      answer: '',
      has_associated_images: true,
      associated_images: ['imgs\\UNICAMP\\2021\\48\\0.jpg', 'imgs/UNICAMP/2021/48/1.png'],
    }));

    expect(record.year).toBe(2021);
    expect(record.day).toBe(2);
    expect(record.imageRefs).toEqual([
      'imgs/UNICAMP/2021/48/0.jpg',
      'imgs/UNICAMP/2021/48/1.png',
    ]);
    expect(record.answer).toBeNull();
    expect(record.anomalies).toContain('empty-answer');
  });

  it('flags a null answer without fabricating a value', () => {
    const record = toComvestInventoryRecord('2019/60.json', sourceQuestion({
      id: 'UNICAMP_2019_60',
      answer: null,
    }));

    expect(record.answer).toBeNull();
    expect(record.anomalies).toEqual(['empty-answer']);
  });

  it('flags a whitespace-only answer without fabricating a value', () => {
    const record = toComvestInventoryRecord('2021/day2/48.json', sourceQuestion({
      id: 'UNICAMP_2021_48',
      answer: '   ',
    }));

    expect(record.answer).toBeNull();
    expect(record.anomalies).toEqual(['empty-answer']);
  });

  it('flags a question that does not follow the four-alternative pattern', () => {
    const record = toComvestInventoryRecord('2019/53.json', sourceQuestion({
      id: 'UNICAMP_2019_53',
      answer: 'C',
      alternatives: ['a) primeira', 'b) segunda', 'c) terceira'],
    }));

    expect(record.alternativeCount).toBe(3);
    expect(record.anomalies).toContain('unexpected-alternative-count');
  });

  it('records invalid source files as parse errors instead of throwing', () => {
    const build = buildComvestInventory([
      { file: '2024/1.json', raw: sourceQuestion() },
      { file: '2024/2.json', raw: { number: 2 } },
    ]);

    expect(build.records).toHaveLength(1);
    expect(build.parseErrors).toHaveLength(1);
    expect(build.parseErrors[0]?.file).toBe('2024/2.json');
  });

  it('rejects a source file that is not organized under a year folder', () => {
    expect(() => toComvestInventoryRecord('questions/1.json', sourceQuestion())).toThrow(
      /year folder/,
    );
  });
});

describe('Comvest inventory summary', () => {
  const build = buildComvestInventory([
    { file: '2018/15.json', raw: sourceQuestion({ id: 'UNICAMP_2018_15', number: 15, subject: ['biology'] }) },
    { file: '2021/day1/1.json', raw: sourceQuestion({ id: 'UNICAMP_2021_1', number: 1, subject: ['history'] }) },
    { file: '2021/day2/1.json', raw: sourceQuestion({ id: 'UNICAMP_2021_1', number: 1, subject: ['history', 'geography'] }) },
    { file: '2024/2.json', raw: sourceQuestion({
      id: 'UNICAMP_2024_2',
      number: 2,
      answer: '',
      alternatives: ['a) primeira', 'b) segunda', 'c) terceira'],
    }) },
    { file: '2024/3.json', raw: { id: 'broken' } },
  ]);

  it('aggregates years, days, subjects and alternative counts', () => {
    const summary = summarizeComvestInventory(build);

    expect(summary.questionCount).toBe(4);
    expect(summary.parseErrorCount).toBe(1);
    expect(summary.byYear).toEqual([
      { year: 2018, days: [{ day: null, questions: 1 }], questions: 1 },
      {
        year: 2021,
        days: [{ day: 1, questions: 1 }, { day: 2, questions: 1 }],
        questions: 2,
      },
      { year: 2024, days: [{ day: null, questions: 1 }], questions: 1 },
    ]);
    expect(summary.subjectCounts).toEqual({ biology: 1, geography: 1, history: 2, mathematics: 1 });
    expect(summary.alternativeCountDistribution).toEqual([
      { alternativeCount: 3, questions: 1 },
      { alternativeCount: 4, questions: 3 },
    ]);
  });

  it('reports duplicate ids, empty answers and unexpected alternative counts explicitly', () => {
    const summary = summarizeComvestInventory(build);

    expect(summary.duplicateIds).toEqual([
      {
        id: 'UNICAMP_2021_1',
        files: ['2021/day1/1.json', '2021/day2/1.json'],
      },
    ]);
    expect(summary.emptyAnswers).toEqual([
      { sourceId: 'UNICAMP_2024_2', file: '2024/2.json' },
    ]);
    expect(summary.unexpectedAlternativeCounts).toEqual([
      { sourceId: 'UNICAMP_2024_2', file: '2024/2.json', alternativeCount: 3 },
    ]);
  });

  it('detects missing and orphan image references against the files on disk', () => {
    const withImages = buildComvestInventory([
      { file: '2018/15.json', raw: sourceQuestion({
        id: 'UNICAMP_2018_15',
        has_associated_images: true,
        associated_images: ['imgs/UNICAMP/2018/15/0.jpg', 'imgs/UNICAMP/2018/15/9.jpg'],
      }) },
    ]);
    const available = new Set([
      'imgs/UNICAMP/2018/15/0.jpg',
      'imgs/UNICAMP/2018/15/orphan.jpg',
    ]);

    const summary = summarizeComvestInventory(withImages, { availableImageFiles: available });

    expect(summary.questionsWithImages).toBe(1);
    expect(summary.imageReferenceCount).toBe(2);
    expect(summary.distinctImageReferenceCount).toBe(2);
    expect(summary.missingImageReferences).toEqual([
      { sourceId: 'UNICAMP_2018_15', file: '2018/15.json', imageRef: 'imgs/UNICAMP/2018/15/9.jpg' },
    ]);
    expect(summary.orphanImageFiles).toEqual(['imgs/UNICAMP/2018/15/orphan.jpg']);
  });
});

describe('BLUEX source schema', () => {
  it('accepts the documented shape', () => {
    expect(bluexQuestionSchema.safeParse(sourceQuestion()).success).toBe(true);
  });

  it('rejects a record missing the answer field', () => {
    const { answer: _answer, ...withoutAnswer } = sourceQuestion();
    expect(bluexQuestionSchema.safeParse(withoutAnswer).success).toBe(false);
  });
});
