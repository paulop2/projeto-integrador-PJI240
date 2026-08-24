import type { Question, QuestionPackage } from '../contracts/question';
import { questionPackageSchema } from '../contracts/question';
import type { EnemApiQuestion } from './enem-api';
import { enemApiQuestionSchema } from './enem-api';

const normalizeIdentifier = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const isCompleteEnemQuestion = (question: EnemApiQuestion): boolean =>
  question.alternatives.every(({ text, file }) => text !== null || file !== null);

export const normalizeEnemQuestion = (input: EnemApiQuestion): Question => {
  const source = enemApiQuestionSchema.parse(input);
  if (!isCompleteEnemQuestion(source)) {
    throw new Error(`question ${source.index} has alternatives without text or file`);
  }
  const alternatives = source.alternatives.map((alternative) => ({
    id: normalizeIdentifier(alternative.letter),
    label: alternative.letter.trim().toUpperCase(),
    text: alternative.text,
    file: alternative.file,
  }));
  const declaredAnswer = normalizeIdentifier(source.correctAlternative);
  const flaggedAnswers = source.alternatives
    .filter(({ isCorrect }) => isCorrect)
    .map(({ letter }) => normalizeIdentifier(letter));

  if (flaggedAnswers.length !== 1 || flaggedAnswers[0] !== declaredAnswer) {
    throw new Error(
      `question ${source.index} has an inconsistent answer (correctAlternative/isCorrect)`,
    );
  }

  return {
    id: `enem-enem-${source.year}-${source.index}`,
    institutionId: 'inep',
    examId: 'enem',
    editionId: `enem-${source.year}`,
    year: source.year,
    subjectId: normalizeIdentifier(source.discipline),
    kind: 'single-choice',
    context: source.context,
    files: source.files,
    alternativesIntroduction: source.alternativesIntroduction,
    alternatives,
    answer: { optionIds: [declaredAnswer] },
  };
};

export const createEnemPackage = (
  year: number,
  sourceQuestions: readonly EnemApiQuestion[],
): QuestionPackage => {
  const questions = sourceQuestions
    .map(normalizeEnemQuestion)
    .sort((left, right) => Number(left.id.split('-').at(-1)) - Number(right.id.split('-').at(-1)));

  if (questions.some((question) => question.year !== year)) {
    throw new Error(`source contains a question outside ENEM ${year}`);
  }

  return questionPackageSchema.parse({
    schemaVersion: 1,
    packageId: `enem-${year}`,
    institutionId: 'inep',
    examId: 'enem',
    editionId: `enem-${year}`,
    questions,
  });
};
