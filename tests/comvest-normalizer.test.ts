import { describe, expect, it } from 'vitest';

import { questionPackageSchema } from '../src/contracts/question';
import type { BluexQuestion } from '../src/data/comvest-inventory';
import {
  comvestAssetUrl,
  comvestEditionId,
  createComvestPackages,
  normalizeComvestQuestion,
  toComvestSourceImagePath,
} from '../src/data/comvest-normalizer';

const sourceQuestion = (overrides: Partial<BluexQuestion> = {}): BluexQuestion => ({
  question: 'Enunciado da questão original.',
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

const normalize = (file: string, question: Partial<BluexQuestion> = {}) =>
  normalizeComvestQuestion(file, sourceQuestion(question));

describe('Comvest question normalization', () => {
  it('maps a BLUEX question to the single-choice contract without inventing content', () => {
    const result = normalize('2024/1.json');
    if (!result.ok) throw new Error(result.rejection.reason);

    expect(result.value.question).toMatchObject({
      id: 'comvest-comvest-2024-UNICAMP_2024_1',
      institutionId: 'unicamp',
      examId: 'comvest',
      editionId: 'comvest-2024',
      year: 2024,
      subjectId: 'mathematics',
      language: null,
      kind: 'single-choice',
      context: 'Enunciado da questão original.',
      files: [],
      alternativesIntroduction: null,
      answer: { optionIds: ['b'] },
    });
    expect(result.value.question.alternatives.map(({ id, label, text, file }) => [id, label, text, file])).toEqual([
      ['a', 'A', 'primeira', null],
      ['b', 'B', 'segunda', null],
      ['c', 'C', 'terceira', null],
      ['d', 'D', 'quarta', null],
    ]);
  });

  it('resolves the 2021 day collision through the edition key', () => {
    const day1 = normalize('2021/day1/1.json', { id: 'UNICAMP_2021_1' });
    const day2 = normalize('2021/day2/1.json', { id: 'UNICAMP_2021_1' });
    if (!day1.ok || !day2.ok) throw new Error('expected both days to normalize');

    expect(comvestEditionId(2021, 1)).toBe('comvest-2021-day1');
    expect(comvestEditionId(2021, null)).toBe('comvest-2021');
    expect(day1.value.question.id).toBe('comvest-comvest-2021-day1-UNICAMP_2021_1');
    expect(day2.value.question.id).toBe('comvest-comvest-2021-day2-UNICAMP_2021_1');
    expect(day1.value.question.id).not.toBe(day2.value.question.id);
  });

  it('rejects an empty answer explicitly and never fabricates a value', () => {
    const result = normalize('2019/60.json', { id: 'UNICAMP_2019_60', answer: null });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection).toMatchObject({
      sourceId: 'UNICAMP_2019_60',
      reason: 'empty-answer',
      editionId: 'comvest-2019',
    });
  });

  it('publishes a three-alternative question through the contract rule instead of a fixed pattern', () => {
    const result = normalize('2019/53.json', {
      id: 'UNICAMP_2019_53',
      answer: 'C',
      alternatives: ['a) primeira', 'b) segunda', 'c) terceira'],
    });
    if (!result.ok) throw new Error(result.rejection.reason);

    expect(result.value.question.alternatives).toHaveLength(3);
    expect(result.value.question.answer.optionIds).toEqual(['c']);
  });

  it('preserves the source label order even when the alternatives are out of order', () => {
    const result = normalize('2021/day1/40.json', {
      id: 'UNICAMP_2021_40',
      answer: 'D',
      alternatives: ['a) 3,2', 'c) 6,2', 'b) 5,2', 'd) 7,5'],
    });
    if (!result.ok) throw new Error(result.rejection.reason);

    expect(result.value.question.alternatives.map(({ id }) => id)).toEqual(['a', 'c', 'b', 'd']);
    expect(result.value.question.answer.optionIds).toEqual(['d']);
  });

  it('maps associated images to local assets and strips the markers from the text', () => {
    const result = normalize('2019/53.json', {
      id: 'UNICAMP_2019_53',
      answer: 'A',
      question: 'Observe a figura.\n[IMAGE 0]\nEscolha a alternativa correta.',
      associated_images: ['imgs/UNICAMP/2019/53/1.jpg'],
      alternatives: ['a) [IMAGE 0]', 'b) segunda', 'c) terceira', 'd) quarta'],
    });
    if (!result.ok) throw new Error(result.rejection.reason);

    expect(result.value.question.context).not.toContain('[IMAGE');
    expect(result.value.question.files).toEqual(['/data/comvest/assets/2019/53/1.jpg']);
    expect(result.value.question.alternatives[0]).toEqual({
      id: 'a',
      label: 'A',
      text: null,
      file: '/data/comvest/assets/2019/53/1.jpg',
    });
    expect(comvestAssetUrl('imgs/UNICAMP/2021/day1/12/1.jpg')).toBe(
      '/data/comvest/assets/2021/day1/12/1.jpg',
    );
    expect(toComvestSourceImagePath('/data/comvest/assets/2021/day1/12/1.jpg')).toBe(
      'imgs/UNICAMP/2021/day1/12/1.jpg',
    );
  });

  it('rejects an alternative that references more than one image', () => {
    const result = normalize('2021/day1/41.json', {
      id: 'UNICAMP_2021_41',
      answer: 'D',
      associated_images: ['imgs/UNICAMP/2021/day1/41/1.jpg', 'imgs/UNICAMP/2021/day1/41/2.jpg'],
      alternatives: ['a) [IMAGE 0] [IMAGE 1]', 'b) x', 'c) y', 'd) z'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('alternative-image-count-unsupported');
    expect(result.rejection.sourceId).toBe('UNICAMP_2021_41');
  });

  it('rejects a marker that points to an associated image that does not exist', () => {
    const result = normalize('2019/53.json', {
      id: 'UNICAMP_2019_53',
      question: 'Veja [IMAGE 3].',
      associated_images: ['imgs/UNICAMP/2019/53/1.jpg'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('image-reference-missing');
  });

  it('keeps the first declared subject for a multidisciplinary question', () => {
    const result = normalize('2021/day1/1.json', {
      id: 'UNICAMP_2021_1',
      subject: ['geography', 'history'],
    });
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(result.value.question.subjectId).toBe('geography');
  });

  it('rejects a malformed source record instead of throwing', () => {
    const result = normalizeComvestQuestion('2024/1.json', { id: 'broken' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('invalid-source-question');
  });

  it('rejects a question whose associated image is never referenced by a marker', () => {
    const result = normalize('2021/day2/68.json', {
      id: 'UNICAMP_2021_68',
      question: 'Cana-de-açúcar [IMAGE 0]. Manga [IMAGE 0].',
      associated_images: [
        'imgs/UNICAMP/2021/day2/68/1.jpg',
        'imgs/UNICAMP/2021/day2/68/2.jpg',
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection).toMatchObject({
      reason: 'unreferenced-associated-image',
      sourceId: 'UNICAMP_2021_68',
    });
  });

  it('rejects an associated image path that escapes the dataset root', () => {
    const result = normalize('2019/53.json', {
      id: 'UNICAMP_2019_53',
      question: 'Veja [IMAGE 0].',
      associated_images: ['imgs/UNICAMP/../../../../evil.jpg'],
      alternatives: ['a) [IMAGE 0]', 'b) segunda'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('invalid-image-path');
  });
});

describe('Comvest package generation', () => {
  it('groups questions by edition, validates the package and keeps unique global ids', () => {
    const available = new Set([
      'imgs/UNICAMP/2019/53/1.jpg',
      'imgs/UNICAMP/2021/day1/33/0.jpg',
    ]);
    const result = createComvestPackages(
      [
        { file: '2019/53.json', raw: sourceQuestion({
          id: 'UNICAMP_2019_53',
          number: 53,
          answer: 'C',
          alternatives: ['a) [IMAGE 0]', 'b) segunda', 'c) terceira'],
          associated_images: ['imgs/UNICAMP/2019/53/1.jpg'],
        }) },
        { file: '2019/60.json', raw: sourceQuestion({ id: 'UNICAMP_2019_60', number: 60, answer: null }) },
        { file: '2021/day1/1.json', raw: sourceQuestion({ id: 'UNICAMP_2021_1', number: 1 }) },
        { file: '2021/day2/1.json', raw: sourceQuestion({ id: 'UNICAMP_2021_1', number: 1 }) },
      ],
      { availableImageFiles: available },
    );

    expect(result.packages.map(({ editionId, package: questionPackage }) => [
      editionId,
      questionPackage.questions.length,
    ])).toEqual([
      ['comvest-2019', 1],
      ['comvest-2021-day1', 1],
      ['comvest-2021-day2', 1],
    ]);
    for (const { package: questionPackage } of result.packages) {
      expect(() => questionPackageSchema.parse(questionPackage)).not.toThrow();
    }

    const ids = result.packages.flatMap(({ package: questionPackage }) =>
      questionPackage.questions.map(({ id }) => id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('comvest-comvest-2021-day1-UNICAMP_2021_1');
    expect(ids).toContain('comvest-comvest-2021-day2-UNICAMP_2021_1');

    expect(result.rejections).toEqual([
      expect.objectContaining({ sourceId: 'UNICAMP_2019_60', reason: 'empty-answer' }),
    ]);
    expect(result.referencedAssets).toEqual(['/data/comvest/assets/2019/53/1.jpg']);
    expect(result.ignoredAssets).toEqual([
      { path: 'imgs/UNICAMP/2021/day1/33/0.jpg', reason: 'orphan-file' },
    ]);
  });

  it('rejects a duplicate global id instead of aborting the whole batch', () => {
    const result = createComvestPackages([
      { file: '2024/1.json', raw: sourceQuestion({ id: 'UNICAMP_2024_1', number: 1 }) },
      { file: '2024/2.json', raw: sourceQuestion({ id: 'UNICAMP_2024_1', number: 2 }) },
    ]);

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]?.package.questions).toHaveLength(1);
    expect(result.rejections).toEqual([
      expect.objectContaining({
        reason: 'duplicate-question-id',
        sourceFile: '2024/2.json',
        sourceId: 'UNICAMP_2024_1',
      }),
    ]);
  });
});
