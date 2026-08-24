import type { ProgressEvent, Question, Stats, StatsMetrics } from '../contracts';

export type LocalOutcome = 'correct' | 'incorrect' | 'timed_out';
export interface LocalRecord { event: ProgressEvent; outcome: LocalOutcome | null }

export const localDay = (timestamp: number) => {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export function emptyMetrics(): StatsMetrics {
  return { viewed: 0, answered: 0, correct: 0, incorrect: 0, timedOut: 0, accuracy: null, averageTimeMs: null, streakDays: 0 };
}

export function calculateMetrics(records: LocalRecord[]): StatsMetrics {
  const metrics = emptyMetrics();
  const viewed = new Set<string>();
  const elapsed: number[] = [];
  const days = new Set<string>();

  for (const { event, outcome } of records) {
    if (event.type === 'question_viewed') {
      viewed.add(`${event.questionId}:${event.localDay}`);
      days.add(event.localDay);
    } else {
      metrics.answered += event.type === 'question_answered' ? 1 : 0;
      metrics.timedOut += event.type === 'question_timed_out' ? 1 : 0;
      if (event.type === 'question_answered') elapsed.push(event.elapsedMs);
      if (outcome === 'correct') metrics.correct += 1;
      if (outcome === 'incorrect') metrics.incorrect += 1;
    }
  }
  metrics.viewed = viewed.size;
  const graded = metrics.correct + metrics.incorrect;
  metrics.accuracy = graded ? metrics.correct / graded : null;
  metrics.averageTimeMs = elapsed.length ? elapsed.reduce((a, b) => a + b, 0) / elapsed.length : null;
  metrics.streakDays = currentStreak(days);
  return metrics;
}

export function calculateStats(records: LocalRecord[], questions: Question[]): Stats {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const subjectIds = new Set<string>();
  const examIds = new Set<string>();
  for (const { event } of records) {
    const question = questionById.get(event.questionId);
    if (question) { subjectIds.add(question.subjectId); examIds.add(question.examId); }
  }
  const matching = (key: 'subjectId' | 'examId', value: string) =>
    records.filter(({ event }) => questionById.get(event.questionId)?.[key] === value);
  return {
    total: calculateMetrics(records),
    bySubject: [...subjectIds].sort().map((subjectId) => ({ subjectId, metrics: calculateMetrics(matching('subjectId', subjectId)) })),
    byExam: [...examIds].sort().map((examId) => ({ examId, metrics: calculateMetrics(matching('examId', examId)) })),
  };
}

function currentStreak(days: Set<string>) {
  if (!days.size) return 0;
  const ordered = [...days].sort().reverse();
  let streak = 1;
  let cursor = new Date(`${ordered[0]}T12:00:00`);
  for (const day of ordered.slice(1)) {
    cursor.setDate(cursor.getDate() - 1);
    if (localDay(cursor.getTime()) !== day) break;
    streak += 1;
  }
  return streak;
}

export const outcomeFor = (question: Question, selectedOptionId: string): LocalOutcome =>
  question.answer.optionIds?.includes(selectedOptionId) ? 'correct' : 'incorrect';

export const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`;
