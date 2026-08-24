import { describe, expect, it, vi } from 'vitest';

import type { ProgressEvent, StoredProgressChange } from '../src/contracts/progress';
import { buildBetterAuthOptions, requireUser } from '../src/server/auth';
import type { BackendEnv } from '../src/server/cloudflare';
import { decodeCursor, encodeCursor } from '../src/server/cursor';
import { HttpError } from '../src/server/http';
import {
  calculateStreak,
  getStats,
  type AggregateCounts,
  type StatsRepository,
} from '../src/server/stats-service';
import {
  synchronize,
  type EventToStore,
  type ServerQuestion,
  type SyncRepository,
} from '../src/server/sync-service';

const userId = 'server-session-user';
const deviceId = '859ec10d-5c5e-4fd3-9364-77863329a64c';
const question: ServerQuestion = {
  id: 'enem-enem-2024-1',
  kind: 'single-choice',
  correctOptionId: 'B',
};

class MemorySyncRepository implements SyncRepository {
  readonly rows: StoredProgressChange[] = [];
  readonly users: string[] = [];
  private readonly seenEvents = new Set<string>();
  private readonly seenViews = new Set<string>();

  async findQuestions(ids: string[]) {
    return new Map(ids.filter((id) => id === question.id).map((id) => [id, question]));
  }

  async append(currentUserId: string, values: EventToStore[]) {
    this.users.push(currentUserId);
    for (const value of values) {
      const eventKey = `${currentUserId}:${value.event.eventId}`;
      const viewKey =
        value.event.type === 'question_viewed'
          ? `${currentUserId}:${value.event.questionId}:${value.event.localDay}`
          : null;
      if (this.seenEvents.has(eventKey) || (viewKey && this.seenViews.has(viewKey))) continue;
      this.seenEvents.add(eventKey);
      if (viewKey) this.seenViews.add(viewKey);
      this.rows.push({
        sequence: this.rows.length + 1,
        event: value.event,
        outcome: value.outcome,
        recordedAt: value.recordedAt,
      });
    }
  }

  async changesAfter(currentUserId: string, sequence: number, limit: number) {
    if (currentUserId !== userId) return [];
    return this.rows.filter((row) => row.sequence > sequence).slice(0, limit);
  }
}

function answeredEvent(overrides: Partial<ProgressEvent> = {}) {
  return {
    type: 'question_answered' as const,
    eventId: 'd9374fd0-b204-471e-8ec8-d3deaa319485',
    deviceId,
    questionId: question.id,
    occurredAt: 1_700_000_000_000,
    selectedOptionId: 'B',
    elapsedMs: 12_000,
    ...overrides,
  };
}

describe('backend sync', () => {
  it('derives ownership externally and recalculates correctness from the server key', async () => {
    const repository = new MemorySyncRepository();
    const event = { ...answeredEvent(), correct: false, userId: 'attacker' };
    const response = await synchronize(
      userId,
      { cursor: null, events: [event], userId: 'attacker' },
      repository,
      1_700_000_001_000,
    );

    expect(repository.users).toEqual([userId]);
    expect(response.changes[0]?.outcome).toBe('correct');
    expect(response.changes[0]?.event).not.toHaveProperty('correct');
    expect(response.changes[0]?.event).not.toHaveProperty('userId');
  });

  it('is idempotent for event UUID and for one daily view', async () => {
    const repository = new MemorySyncRepository();
    const event = answeredEvent();
    await synchronize(userId, { cursor: null, events: [event] }, repository);
    const replay = await synchronize(userId, { cursor: null, events: [event] }, repository);
    expect(replay.acceptedEventIds).toEqual([event.eventId]);
    expect(repository.rows).toHaveLength(1);

    const firstView = {
      type: 'question_viewed' as const,
      eventId: 'da34d9b8-c327-42e5-b9e2-33adf40bbdf4',
      deviceId,
      questionId: question.id,
      occurredAt: 1_700_000_000_000,
      localDay: '2026-08-23',
    };
    const secondView = {
      ...firstView,
      eventId: '23f8a775-891a-446d-85c6-fd18dcc2fe4a',
    };
    await synchronize(userId, { cursor: null, events: [firstView, secondView] }, repository);
    expect(repository.rows.filter(({ event: row }) => row.type === 'question_viewed')).toHaveLength(1);
  });

  it('validates all question IDs before writing', async () => {
    const repository = new MemorySyncRepository();
    await expect(
      synchronize(userId, {
        cursor: null,
        events: [answeredEvent({ questionId: 'unknown-question' })],
      }, repository),
    ).rejects.toMatchObject({ status: 422, code: 'unknown_question' });
    expect(repository.rows).toHaveLength(0);
  });

  it('uses opaque, validated cursor tokens', () => {
    expect(decodeCursor(encodeCursor(12345))).toBe(12345);
    expect(() => decodeCursor('12345')).toThrow(HttpError);
  });
});

class MemoryStatsRepository implements StatsRepository {
  constructor(private readonly values: Record<string, AggregateCounts[]>) {}
  async aggregate(
    _userId: string,
    _filter: unknown,
    groupBy: 'total' | 'subject' | 'exam',
  ) {
    return this.values[groupBy] ?? [];
  }
}

describe('backend stats', () => {
  it('calculates metrics, grouping, and consecutive activity days', async () => {
    const base: AggregateCounts = {
      groupId: null,
      viewed: 4,
      answered: 3,
      correct: 2,
      incorrect: 1,
      timedOut: 1,
      averageTimeMs: 42_000,
      activeDays: ['2026-08-23', '2026-08-22', '2026-08-21', '2026-08-19'],
    };
    const repository = new MemoryStatsRepository({
      total: [base],
      subject: [{ ...base, groupId: 'matematica' }],
      exam: [{ ...base, groupId: 'enem' }],
    });
    const stats = await getStats(userId, {}, repository);
    expect(stats.total).toMatchObject({ accuracy: 2 / 3, streakDays: 3 });
    expect(stats.bySubject[0]?.subjectId).toBe('matematica');
    expect(stats.byExam[0]?.examId).toBe('enem');
  });

  it('returns null rates for an empty account', async () => {
    const stats = await getStats(userId, {}, new MemoryStatsRepository({}));
    expect(stats.total).toMatchObject({ answered: 0, accuracy: null, averageTimeMs: null });
    expect(calculateStreak([])).toBe(0);
  });
});

describe('backend auth boundary', () => {
  it('rejects missing sessions', async () => {
    await expect(
      requireUser(new Request('https://example.test/api/sync'), {
        handler: vi.fn(),
        getSession: vi.fn().mockResolvedValue(null),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('configures D1, Google, password auth, verification and reset callbacks', () => {
    const db = {} as BackendEnv['DB'];
    const options = buildBetterAuthOptions({
      DB: db,
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      BETTER_AUTH_URL: 'https://questions.example',
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Questões <login@example.test>',
    });
    expect(options.database).toBe(db);
    expect(options.socialProviders).toMatchObject({ google: { clientId: 'google-id' } });
    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: expect.any(Function),
    });
    expect(options.emailVerification).toMatchObject({
      sendOnSignUp: true,
      sendVerificationEmail: expect.any(Function),
    });
  });
});
