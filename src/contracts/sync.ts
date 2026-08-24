import { z } from 'zod';

import { progressEventSchema, storedProgressChangeSchema } from './progress';

export const SYNC_BATCH_SIZE = 100 as const;

export const syncRequestSchema = z.object({
  cursor: z.string().min(1).nullable(),
  events: z.array(progressEventSchema).max(SYNC_BATCH_SIZE),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const syncResponseSchema = z.object({
  acceptedEventIds: z.array(z.string().uuid()),
  changes: z.array(storedProgressChangeSchema),
  nextCursor: z.string().min(1),
  hasMore: z.boolean(),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;

export const statsQuerySchema = z.object({
  examId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
});

export const statsMetricsSchema = z.object({
  viewed: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  incorrect: z.number().int().nonnegative(),
  timedOut: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1).nullable(),
  averageTimeMs: z.number().nonnegative().nullable(),
  streakDays: z.number().int().nonnegative(),
});

export type StatsMetrics = z.infer<typeof statsMetricsSchema>;

export const statsSchema = z.object({
  total: statsMetricsSchema,
  bySubject: z.array(
    z.object({ subjectId: z.string().min(1), metrics: statsMetricsSchema }),
  ),
  byExam: z.array(
    z.object({ examId: z.string().min(1), metrics: statsMetricsSchema }),
  ),
});

export type Stats = z.infer<typeof statsSchema>;
