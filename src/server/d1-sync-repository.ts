import type { ProgressEvent, StoredProgressChange } from '../contracts/progress';
import { storedProgressChangeSchema } from '../contracts/progress';
import type { D1Database } from './cloudflare';
import type { EventToStore, ServerQuestion, SyncRepository } from './sync-service';

interface QuestionRow {
  question_id: string;
  kind: string;
  correct_option_id: string;
}

interface ChangeRow {
  sequence: number;
  event_json: string;
  outcome: StoredProgressChange['outcome'];
  recorded_at: number;
}

function placeholders(length: number): string {
  return Array.from({ length }, () => '?').join(', ');
}

function localDay(event: ProgressEvent): string | null {
  return event.type === 'question_viewed' ? event.localDay : null;
}

function elapsedMs(event: ProgressEvent): number | null {
  return event.type === 'question_viewed' ? null : event.elapsedMs;
}

function selectedOptionId(event: ProgressEvent): string | null {
  return event.type === 'question_answered' ? event.selectedOptionId : null;
}

export class D1SyncRepository implements SyncRepository {
  constructor(private readonly db: D1Database) {}

  async findQuestions(questionIds: string[]): Promise<Map<string, ServerQuestion>> {
    if (questionIds.length === 0) return new Map();
    const query = `SELECT question_id, kind, correct_option_id
      FROM question_answer_key WHERE question_id IN (${placeholders(questionIds.length)})`;
    const result = await this.db.prepare(query).bind(...questionIds).all<QuestionRow>();
    return new Map(
      (result.results ?? []).map((row) => [
        row.question_id,
        { id: row.question_id, kind: row.kind, correctOptionId: row.correct_option_id },
      ]),
    );
  }

  async append(userId: string, events: EventToStore[]): Promise<void> {
    if (events.length === 0) return;
    const sql = `INSERT OR IGNORE INTO progress_event
      (user_id, event_id, device_id, question_id, type, local_day,
       selected_option_id, elapsed_ms, outcome, event_json, occurred_at, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const statements = events.map(({ event, outcome, recordedAt }) =>
      this.db.prepare(sql).bind(
        userId,
        event.eventId,
        event.deviceId,
        event.questionId,
        event.type,
        localDay(event),
        selectedOptionId(event),
        elapsedMs(event),
        outcome,
        JSON.stringify(event),
        event.occurredAt,
        recordedAt,
      ),
    );
    await this.db.batch(statements);
  }

  async changesAfter(
    userId: string,
    sequence: number,
    limit: number,
  ): Promise<StoredProgressChange[]> {
    const result = await this.db
      .prepare(`SELECT sequence, event_json, outcome, recorded_at
        FROM progress_event
        WHERE user_id = ? AND sequence > ?
        ORDER BY sequence ASC LIMIT ?`)
      .bind(userId, sequence, limit)
      .all<ChangeRow>();
    return (result.results ?? []).map((row) =>
      storedProgressChangeSchema.parse({
        sequence: row.sequence,
        event: JSON.parse(row.event_json) as unknown,
        outcome: row.outcome,
        recordedAt: row.recorded_at,
      }),
    );
  }
}
