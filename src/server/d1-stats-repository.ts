import type { D1Database } from './cloudflare';
import type {
  AggregateCounts,
  StatsFilter,
  StatsRepository,
} from './stats-service';

interface AggregateRow {
  group_id: string | null;
  viewed: number;
  answered: number;
  correct_count: number;
  incorrect_count: number;
  timed_out: number;
  average_time_ms: number | null;
}

interface DayRow {
  group_id: string | null;
  active_day: string;
}

function queryParts(
  userId: string,
  filter: StatsFilter,
  groupBy: 'total' | 'subject' | 'exam',
): { groupExpression: string; where: string; values: unknown[] } {
  const groupExpression =
    groupBy === 'subject' ? 'q.subject_id' : groupBy === 'exam' ? 'q.exam_id' : 'NULL';
  const clauses = ['e.user_id = ?'];
  const values: unknown[] = [userId];
  if (filter.examId !== undefined) {
    clauses.push('q.exam_id = ?');
    values.push(filter.examId);
  }
  if (filter.subjectId !== undefined) {
    clauses.push('q.subject_id = ?');
    values.push(filter.subjectId);
  }
  return { groupExpression, where: clauses.join(' AND '), values };
}

export class D1StatsRepository implements StatsRepository {
  constructor(private readonly db: D1Database) {}

  async aggregate(
    userId: string,
    filter: StatsFilter,
    groupBy: 'total' | 'subject' | 'exam',
  ): Promise<AggregateCounts[]> {
    const { groupExpression, where, values } = queryParts(userId, filter, groupBy);
    const groupClause = groupBy === 'total' ? '' : ` GROUP BY ${groupExpression}`;
    const aggregates = await this.db
      .prepare(`SELECT ${groupExpression} AS group_id,
        SUM(CASE WHEN e.type = 'question_viewed' THEN 1 ELSE 0 END) AS viewed,
        SUM(CASE WHEN e.type = 'question_answered' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN e.outcome = 'correct' THEN 1 ELSE 0 END) AS correct_count,
        SUM(CASE WHEN e.outcome = 'incorrect' THEN 1 ELSE 0 END) AS incorrect_count,
        SUM(CASE WHEN e.outcome = 'timed_out' THEN 1 ELSE 0 END) AS timed_out,
        AVG(CASE WHEN e.type IN ('question_answered', 'question_timed_out')
          THEN e.elapsed_ms ELSE NULL END) AS average_time_ms
        FROM progress_event e
        JOIN question_answer_key q ON q.question_id = e.question_id
        WHERE ${where}${groupClause}
        ORDER BY group_id`)
      .bind(...values)
      .all<AggregateRow>();
    const days = await this.db
      .prepare(`SELECT DISTINCT ${groupExpression} AS group_id,
        COALESCE(e.local_day, date(e.occurred_at / 1000, 'unixepoch')) AS active_day
        FROM progress_event e
        JOIN question_answer_key q ON q.question_id = e.question_id
        WHERE ${where}
        ORDER BY active_day DESC`)
      .bind(...values)
      .all<DayRow>();

    const daysByGroup = new Map<string, string[]>();
    for (const row of days.results ?? []) {
      const key = row.group_id ?? '';
      const groupDays = daysByGroup.get(key) ?? [];
      groupDays.push(row.active_day);
      daysByGroup.set(key, groupDays);
    }
    return (aggregates.results ?? []).map((row) => ({
      groupId: row.group_id,
      viewed: Number(row.viewed),
      answered: Number(row.answered),
      correct: Number(row.correct_count),
      incorrect: Number(row.incorrect_count),
      timedOut: Number(row.timed_out),
      averageTimeMs: row.average_time_ms === null ? null : Number(row.average_time_ms),
      activeDays: daysByGroup.get(row.group_id ?? '') ?? [],
    }));
  }
}
