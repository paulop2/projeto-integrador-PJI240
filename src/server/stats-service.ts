import type { Stats, StatsMetrics } from '../contracts/sync';
import { statsQuerySchema } from '../contracts/sync';
import { HttpError } from './http';

export interface StatsFilter {
  examId?: string;
  subjectId?: string;
}

export interface AggregateCounts {
  groupId: string | null;
  viewed: number;
  answered: number;
  correct: number;
  incorrect: number;
  timedOut: number;
  averageTimeMs: number | null;
  activeDays: string[];
}

export interface StatsRepository {
  aggregate(
    userId: string,
    filter: StatsFilter,
    groupBy: 'total' | 'subject' | 'exam',
  ): Promise<AggregateCounts[]>;
}

export function calculateStreak(days: string[]): number {
  const unique = [...new Set(days)].sort().reverse();
  if (unique.length === 0) return 0;
  let streak = 1;
  let previous = Date.parse(`${unique[0]}T00:00:00Z`);
  for (const day of unique.slice(1)) {
    const current = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(current) || previous - current !== 86_400_000) break;
    streak += 1;
    previous = current;
  }
  return streak;
}

function metrics(counts?: AggregateCounts): StatsMetrics {
  const answered = counts?.answered ?? 0;
  return {
    viewed: counts?.viewed ?? 0,
    answered,
    correct: counts?.correct ?? 0,
    incorrect: counts?.incorrect ?? 0,
    timedOut: counts?.timedOut ?? 0,
    accuracy: answered === 0 ? null : (counts?.correct ?? 0) / answered,
    averageTimeMs: counts?.averageTimeMs ?? null,
    streakDays: calculateStreak(counts?.activeDays ?? []),
  };
}

export async function getStats(
  userId: string,
  rawFilter: unknown,
  repository: StatsRepository,
): Promise<Stats> {
  const parsed = statsQuerySchema.safeParse(rawFilter);
  if (!parsed.success) {
    throw new HttpError(400, 'Filtros de estatísticas inválidos.', 'invalid_stats_filter');
  }
  const filter: StatsFilter = {};
  if (parsed.data.examId !== undefined) filter.examId = parsed.data.examId;
  if (parsed.data.subjectId !== undefined) filter.subjectId = parsed.data.subjectId;

  const [totals, subjects, exams] = await Promise.all([
    repository.aggregate(userId, filter, 'total'),
    repository.aggregate(userId, filter, 'subject'),
    repository.aggregate(userId, filter, 'exam'),
  ]);
  return {
    total: metrics(totals[0]),
    bySubject: subjects.map((row) => ({ subjectId: row.groupId!, metrics: metrics(row) })),
    byExam: exams.map((row) => ({ examId: row.groupId!, metrics: metrics(row) })),
  };
}
