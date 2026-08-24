import { z } from 'zod';

export const QUESTION_TIME_LIMIT_MS = 180_000 as const;

const eventBaseSchema = z.object({
  eventId: z.string().uuid(),
  deviceId: z.string().uuid(),
  questionId: z.string().trim().min(1),
  occurredAt: z.number().int().nonnegative(),
});

export const questionViewedEventSchema = eventBaseSchema.extend({
  type: z.literal('question_viewed'),
  localDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const questionAnsweredEventSchema = eventBaseSchema.extend({
  type: z.literal('question_answered'),
  selectedOptionId: z.string().trim().min(1),
  elapsedMs: z.number().int().min(0).max(QUESTION_TIME_LIMIT_MS),
});

export const questionTimedOutEventSchema = eventBaseSchema.extend({
  type: z.literal('question_timed_out'),
  elapsedMs: z.literal(QUESTION_TIME_LIMIT_MS),
});

export const progressEventSchema = z.discriminatedUnion('type', [
  questionViewedEventSchema,
  questionAnsweredEventSchema,
  questionTimedOutEventSchema,
]);

export type ProgressEvent = z.infer<typeof progressEventSchema>;

export const attemptOutcomeSchema = z.enum(['correct', 'incorrect', 'timed_out']);
export type AttemptOutcome = z.infer<typeof attemptOutcomeSchema>;

export const storedProgressChangeSchema = z.object({
  sequence: z.number().int().nonnegative(),
  event: progressEventSchema,
  outcome: attemptOutcomeSchema.nullable(),
  recordedAt: z.number().int().nonnegative(),
});

export type StoredProgressChange = z.infer<typeof storedProgressChangeSchema>;
