import { describe, expect, it } from 'vitest';

import type { BluexBoard } from '../src/data/bluex-board';
import { comvestBoard, fuvestBoard } from '../src/data/bluex-board';
import { questionPackageSchema } from '../src/contracts/question';
import { bluexQuestionSchema, type BluexQuestion } from '../src/data/bluex-inventory';
import {
  createBluexPackages,
  normalizeBluexQuestion,
} from '../src/data/bluex-normalizer';
import {
  createFuvestPackages,
  fuvestAssetUrl,
  fuvestEditionId,
  fuvestExamId,
  fuvestInstitutionId,
  normalizeFuvestQuestion,
  toFuvestSourceImagePath,
} from '../src/data/fuvest-normalizer';

const sourceQuestion = (overrides: Partial<BluexQuestion> = {}): BluexQuestion => ({
  question: 'Enunciado da questão original.',
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

describe('Fuvest question normalization', () => {
  it('maps a five-alternative BLUEX question to the single-choice contract', () => {
    const result = normalizeFuvestQuestion('2024/1.json', sourceQuestion());
    if (!result.ok) throw new Error(result.rejection.reason);

    expect(result.value.question).toMatchObject({
      id: 'fuvest-fuvest-2024-USP_2024_1',
      institutionId: 'usp',
      examId: 'fuvest',
      editionId: 'fuvest-2024',
      year: 2024,
      subjectId: 'mathematics',
      language: null,
      kind: 'single-choice',
      context: 'Enunciado da questão original.',
      files: [],
      alternativesIntroduction: null,
      answer: { optionIds: ['b'] },
    });
    expect(result.value.question.alternatives.map(({ id }) => id)).toEqual([
      'a', 'b', 'c', 'd', 'e',
    ]);
    expect(fuvestInstitutionId).toBe('usp');
    expect(fuvestExamId).toBe('fuvest');
    expect(fuvestEditionId(2024, null)).toBe('fuvest-2024');
  });

  it('maps image alternatives to local assets and strips the markers', () => {
    const result = normalizeFuvestQuestion('2019/3.json', sourceQuestion({
      id: 'USP_2019_3',
      number: 3,
      answer: 'A',
      alternatives_type: 'images',
      associated_images: [
        'imgs/USP/2019/3/A.jpg',
        'imgs/USP/2019/3/B.jpg',
        'imgs/USP/2019/3/C.jpg',
        'imgs/USP/2019/3/D.jpg',
        'imgs/USP/2019/3/E.jpg',
      ],
      alternatives: ['a)[IMAGE 0]', 'b)[IMAGE 1]', 'c)[IMAGE 2]', 'd)[IMAGE 3]', 'e)[IMAGE 4]'],
    }));
    if (!result.ok) throw new Error(result.rejection.reason);

    expect(result.value.question.alternatives.map(({ file }) => file)).toEqual([
      '/data/fuvest/assets/2019/3/A.jpg',
      '/data/fuvest/assets/2019/3/B.jpg',
      '/data/fuvest/assets/2019/3/C.jpg',
      '/data/fuvest/assets/2019/3/D.jpg',
      '/data/fuvest/assets/2019/3/E.jpg',
    ]);
    expect(fuvestAssetUrl('imgs/USP/2021/25/0.png')).toBe('/data/fuvest/assets/2021/25/0.png');
    expect(toFuvestSourceImagePath('/data/fuvest/assets/2021/25/0.png')).toBe(
      'imgs/USP/2021/25/0.png',
    );
  });

  it('rejects an empty answer explicitly and never fabricates a value', () => {
    const result = normalizeFuvestQuestion('2022/54.json', sourceQuestion({
      id: 'USP_2022_54',
      number: 54,
      answer: null,
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection).toMatchObject({
      sourceId: 'USP_2022_54',
      reason: 'empty-answer',
      editionId: 'fuvest-2022',
    });
  });

  it('rejects a question whose answer matches no alternative', () => {
    const result = normalizeFuvestQuestion('2021/25.json', sourceQuestion({
      id: 'USP_2021_25',
      number: 25,
      answer: 'A',
      alternatives: [],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('unknown-answer');
  });

  it('rejects a marker that points to an associated image that does not exist', () => {
    const result = normalizeFuvestQuestion('2023/6.json', sourceQuestion({
      id: 'USP_2023_6',
      number: 6,
      alternatives_type: 'images',
      associated_images: ['imgs/USP/2023/6/5.jpg'],
      alternatives: ['a) [IMAGE 1]', 'b) [IMAGE 2]', 'c) [IMAGE 3]', 'd) [IMAGE 4]', 'e) [IMAGE 5]'],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('image-reference-missing');
  });

  it('rejects an associated image that is never referenced by a marker', () => {
    const result = normalizeFuvestQuestion('2022/73.json', sourceQuestion({
      id: 'USP_2022_73',
      number: 73,
      question: 'Veja [IMAGE 0].',
      associated_images: ['imgs/USP/2022/73/0.jpg', 'imgs/USP/2022/73/1.jpg'],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection).toMatchObject({
      reason: 'unreferenced-associated-image',
      sourceId: 'USP_2022_73',
    });
  });

  it('rejects an alternative that references more than one image', () => {
    const result = normalizeFuvestQuestion('2020/8.json', sourceQuestion({
      id: 'USP_2020_8',
      number: 8,
      answer: 'D',
      associated_images: ['imgs/USP/2020/8/1.jpg', 'imgs/USP/2020/8/2.jpg'],
      alternatives: ['a) [IMAGE 0] [IMAGE 1]', 'b) x', 'c) y', 'd) z', 'e) w'],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('alternative-image-count-unsupported');
  });

  it('keeps the first declared subject for a multidisciplinary question', () => {
    const result = normalizeFuvestQuestion('2022/1.json', sourceQuestion({
      id: 'USP_2022_1',
      subject: ['geography', 'history'],
    }));
    if (!result.ok) throw new Error(result.rejection.reason);
    expect(result.value.question.subjectId).toBe('geography');
  });
});

describe('BLUEX board parameterization', () => {
  const normalizeWith = (board: BluexBoard) =>
    normalizeBluexQuestion('2024/1.json', sourceQuestion({ id: 'BOARD_2024_1' }), board);

  it('produces board-specific identity from the same shared parser', () => {
    const fuvest = normalizeWith(fuvestBoard);
    const comvest = normalizeWith(comvestBoard);
    if (!fuvest.ok || !comvest.ok) throw new Error('expected both boards to normalize');

    expect(fuvest.value.question).toMatchObject({
      id: 'fuvest-fuvest-2024-BOARD_2024_1',
      institutionId: 'usp',
      examId: 'fuvest',
    });
    expect(comvest.value.question).toMatchObject({
      id: 'comvest-comvest-2024-BOARD_2024_1',
      institutionId: 'unicamp',
      examId: 'comvest',
    });
  });
});

describe('Fuvest package generation', () => {
  it('groups questions by edition, validates the package and keeps unique global ids', () => {
    const available = new Set([
      'imgs/USP/2019/3/A.jpg',
      'imgs/USP/2021/25/0.png',
    ]);
    const result = createFuvestPackages(
      [
        { file: '2019/3.json', raw: sourceQuestion({
          id: 'USP_2019_3',
          number: 3,
          answer: 'A',
          alternatives_type: 'images',
          associated_images: ['imgs/USP/2019/3/A.jpg'],
          alternatives: ['a) [IMAGE 0]', 'b) segunda', 'c) terceira', 'd) quarta', 'e) quinta'],
        }) },
        { file: '2022/54.json', raw: sourceQuestion({ id: 'USP_2022_54', number: 54, answer: null }) },
        { file: '2024/1.json', raw: sourceQuestion({ id: 'USP_2024_1', number: 1 }) },
      ],
      { availableImageFiles: available },
    );

    expect(result.packages.map(({ editionId, package: questionPackage }) => [
      editionId,
      questionPackage.questions.length,
    ])).toEqual([
      ['fuvest-2019', 1],
      ['fuvest-2024', 1],
    ]);
    for (const { package: questionPackage } of result.packages) {
      expect(() => questionPackageSchema.parse(questionPackage)).not.toThrow();
    }

    const ids = result.packages.flatMap(({ package: questionPackage }) =>
      questionPackage.questions.map(({ id }) => id),
    );
    expect(ids).toEqual(['fuvest-fuvest-2019-USP_2019_3', 'fuvest-fuvest-2024-USP_2024_1']);
    expect(result.rejections).toEqual([
      expect.objectContaining({ sourceId: 'USP_2022_54', reason: 'empty-answer' }),
    ]);
    expect(result.referencedAssets).toEqual(['/data/fuvest/assets/2019/3/A.jpg']);
    expect(result.ignoredAssets).toEqual([
      { path: 'imgs/USP/2021/25/0.png', reason: 'orphan-file' },
    ]);
  });

  it('rejects a duplicate global id instead of aborting the whole batch', () => {
    const result = createFuvestPackages([
      { file: '2024/1.json', raw: sourceQuestion({ id: 'USP_2024_1', number: 1 }) },
      { file: '2024/2.json', raw: sourceQuestion({ id: 'USP_2024_1', number: 2 }) },
    ]);

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]?.package.questions).toHaveLength(1);
    expect(result.rejections).toEqual([
      expect.objectContaining({
        reason: 'duplicate-question-id',
        sourceFile: '2024/2.json',
        sourceId: 'USP_2024_1',
      }),
    ]);
  });

  it('uses the shared generic entry point with the Fuvest board', () => {
    const result = createBluexPackages(
      [{ file: '2024/1.json', raw: sourceQuestion() }],
      fuvestBoard,
    );
    expect(result.packages[0]?.package.institutionId).toBe('usp');
    expect(result.packages[0]?.package.examId).toBe('fuvest');
    expect(result.packages[0]?.package.packageId).toBe('fuvest-2024');
  });
});

describe('BLUEX source schema', () => {
  it('accepts the documented Fuvest shape', () => {
    expect(bluexQuestionSchema.safeParse(sourceQuestion()).success).toBe(true);
  });
});
