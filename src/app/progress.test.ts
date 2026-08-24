import { describe, expect, it } from 'vitest';

import type { ProgressEvent } from '../contracts';
import { calculateMetrics, calculateStats, localDay } from './progress';
import { demoQuestions } from './demoQuestions';

const base = { eventId: '00000000-0000-4000-8000-000000000001', deviceId: '00000000-0000-4000-8000-000000000002', questionId: 'q1', occurredAt: 1 };

describe('calculateMetrics', () => {
  it('deduplicates daily views and derives answer metrics', () => {
    const events: ProgressEvent[] = [
      { ...base, type: 'question_viewed', localDay: '2026-08-23' },
      { ...base, eventId: '00000000-0000-4000-8000-000000000003', type: 'question_viewed', localDay: '2026-08-23' },
      { ...base, eventId: '00000000-0000-4000-8000-000000000004', type: 'question_answered', selectedOptionId: 'a', elapsedMs: 42_000 },
    ];
    const metrics = calculateMetrics([
      { event: events[0]!, outcome: null }, { event: events[1]!, outcome: null }, { event: events[2]!, outcome: 'correct' },
    ]);
    expect(metrics).toMatchObject({ viewed: 1, answered: 1, correct: 1, accuracy: 1, averageTimeMs: 42_000 });
  });

  it('groups metrics by normalized subject and exam ids', () => {
    const answer: ProgressEvent = { ...base, questionId: demoQuestions[0]!.id, type: 'question_answered', selectedOptionId: 'c', elapsedMs: 10_000 };
    const stats = calculateStats([{ event: answer, outcome: 'correct' }], demoQuestions);
    expect(stats.bySubject).toEqual([{ subjectId: 'matematica', metrics: expect.objectContaining({ answered: 1, correct: 1 }) }]);
    expect(stats.byExam).toEqual([{ examId: 'enem', metrics: expect.objectContaining({ answered: 1 }) }]);
  });

  it('uses the calendar day in the local timezone', () => {
    expect(localDay(new Date(2026, 7, 23, 22).getTime())).toBe('2026-08-23');
  });
});
