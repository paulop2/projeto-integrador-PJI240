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
    throw new Error(`question ${source.index}${source.language ? ` (${source.language})` : ''} has alternatives without text or file`);
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
      `question ${source.index}${source.language ? ` (${source.language})` : ''} has an inconsistent answer (correctAlternative/isCorrect)`,
    );
  }

  return {
    // The previously published questions 1-5 were the Spanish variant. Keep
    // those IDs so existing progress remains attached to the same content.
    id: `enem-enem-${source.year}-${source.index}${source.language === 'ingles' ? '-ingles' : ''}`,
    institutionId: 'inep',
    examId: 'enem',
    editionId: `enem-${source.year}`,
    year: source.year,
    subjectId: normalizeIdentifier(source.discipline),
    language: source.language ?? null,
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
    .map((source) => ({ source, question: normalizeEnemQuestion(source) }))
    .sort((left, right) => left.source.index - right.source.index
      || (left.source.language ?? '').localeCompare(right.source.language ?? ''))
    .map(({ question }) => question);

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
