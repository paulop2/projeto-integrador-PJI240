import { describe, expect, it } from 'vitest';

import { bluexQuestionSchema, type BluexQuestion } from '../src/data/bluex-inventory';
import { toComvestInventoryRecord } from '../src/data/comvest-inventory';
import {
  buildFuvestInventory,
  fuvestFirstPhaseAlternatives,
  summarizeFuvestInventory,
  toFuvestInventoryRecord,
} from '../src/data/fuvest-inventory';

const sourceQuestion = (overrides: Partial<BluexQuestion> = {}): BluexQuestion => ({
  question: 'ENUNCIADO que não deve vazar para o inventário.',
  number: 1,
  id: 'USP_2024_1',
  alternatives: ['a) primeira', 'b) segunda', 'c) terceira', 'd) quarta', 'e) quinta'],
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

describe('Fuvest inventory records', () => {
  it('keeps only metadata and provenance references, never the question text', () => {
    const record = toFuvestInventoryRecord('2024/1.json', sourceQuestion());

    expect(record).toEqual({
      source: 'bluex',
      sourceFile: '2024/1.json',
      year: 2024,
      day: null,
      number: 1,
      sourceId: 'USP_2024_1',
      subjectIds: ['mathematics'],
      answer: 'B',
      alternativeCount: 5,
      alternativesType: 'string',
      hasImages: false,
      imageRefs: [],
      anomalies: [],
    });
    expect(record).not.toHaveProperty('question');
    expect(record).not.toHaveProperty('alternatives');
  });

  it('expects five alternatives for Fuvest and flags a different count', () => {
    expect(fuvestFirstPhaseAlternatives).toBe(5);

    const five = toFuvestInventoryRecord('2024/1.json', sourceQuestion());
    expect(five.anomalies).not.toContain('unexpected-alternative-count');

    const four = toFuvestInventoryRecord('2024/2.json', sourceQuestion({
      id: 'USP_2024_2',
      number: 2,
      alternatives: ['a) primeira', 'b) segunda', 'c) terceira', 'd) quarta'],
    }));
    expect(four.anomalies).toContain('unexpected-alternative-count');
  });

  it('shares the parsing logic but applies each board expected alternative count', () => {
    const fuvest = toFuvestInventoryRecord('2024/1.json', sourceQuestion());
    const comvest = toComvestInventoryRecord('2024/1.json', sourceQuestion({
      id: 'UNICAMP_2024_1',
      alternatives: ['a) primeira', 'b) segunda', 'c) terceira', 'd) quarta'],
    }));

    // A four-alternative Comvest record is normal; the same five-alternative
    // Fuvest record is normal too. The difference is the board configuration.
    expect(comvest.alternativeCount).toBe(4);
    expect(fuvest.alternativeCount).toBe(5);
    expect(toComvestInventoryRecord('2024/1.json', sourceQuestion({
      id: 'UNICAMP_2024_1',
      alternatives: ['a) primeira', 'b) segunda', 'c) terceira'],
    }))).toMatchObject({ alternativeCount: 3, anomalies: ['unexpected-alternative-count'] });
  });

  it('flags a null answer without fabricating a value', () => {
    const record = toFuvestInventoryRecord('2022/54.json', sourceQuestion({
      id: 'USP_2022_54',
      number: 54,
      answer: null,
    }));

    expect(record.answer).toBeNull();
    expect(record.anomalies).toEqual(['empty-answer']);
  });

  it('records invalid source files as parse errors instead of throwing', () => {
    const build = buildFuvestInventory([
      { file: '2024/1.json', raw: sourceQuestion() },
      { file: '2024/2.json', raw: { number: 2 } },
    ]);

    expect(build.records).toHaveLength(1);
    expect(build.parseErrors).toHaveLength(1);
    expect(build.parseErrors[0]?.file).toBe('2024/2.json');
  });
});

describe('Fuvest inventory summary', () => {
  const build = buildFuvestInventory([
    { file: '2018/15.json', raw: sourceQuestion({ id: 'USP_2018_15', number: 15, subject: ['biology'] }) },
    { file: '2021/1.json', raw: sourceQuestion({ id: 'USP_2021_1', number: 1, subject: ['history'] }) },
    { file: '2022/54.json', raw: sourceQuestion({ id: 'USP_2022_54', number: 54, answer: null }) },
    { file: '2024/3.json', raw: { id: 'broken' } },
  ]);

  it('labels the summary with the Fuvest university and aggregates counts', () => {
    const summary = summarizeFuvestInventory(build);

    expect(summary.university).toBe('usp');
    expect(summary.phase).toBe('first');
    expect(summary.questionCount).toBe(3);
    expect(summary.parseErrorCount).toBe(1);
    expect(summary.byYear).toEqual([
      { year: 2018, days: [{ day: null, questions: 1 }], questions: 1 },
      { year: 2021, days: [{ day: null, questions: 1 }], questions: 1 },
      { year: 2022, days: [{ day: null, questions: 1 }], questions: 1 },
    ]);
    expect(summary.emptyAnswers).toEqual([
      { sourceId: 'USP_2022_54', file: '2022/54.json' },
    ]);
  });

  it('detects missing and orphan image references against the files on disk', () => {
    const withImages = buildFuvestInventory([
      { file: '2018/15.json', raw: sourceQuestion({
        id: 'USP_2018_15',
        has_associated_images: true,
        associated_images: ['imgs/USP/2018/15/0.jpg', 'imgs/USP/2018/15/9.jpg'],
      }) },
    ]);
    const available = new Set([
      'imgs/USP/2018/15/0.jpg',
      'imgs/USP/2018/15/orphan.jpg',
    ]);

    const summary = summarizeFuvestInventory(withImages, { availableImageFiles: available });

    expect(summary.missingImageReferences).toEqual([
      { sourceId: 'USP_2018_15', file: '2018/15.json', imageRef: 'imgs/USP/2018/15/9.jpg' },
    ]);
    expect(summary.orphanImageFiles).toEqual(['imgs/USP/2018/15/orphan.jpg']);
  });
});

describe('BLUEX source schema', () => {
  it('accepts the documented shape with five alternatives', () => {
    expect(bluexQuestionSchema.safeParse(sourceQuestion()).success).toBe(true);
  });
});
