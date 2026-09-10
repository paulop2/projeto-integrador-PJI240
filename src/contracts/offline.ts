import { z } from 'zod';

import { foreignLanguageSchema } from './question';

export const downloadedPackageSchema = z.object({
  packageId: z.string().min(1),
  version: z.number().int().positive(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  downloadedAt: z.number().int().nonnegative(),
  lastVerifiedAt: z.number().int().nonnegative(),
});

export type DownloadedPackage = z.infer<typeof downloadedPackageSchema>;

export const activeExamSelectionSchema = z.object({
  packageId: z.string().min(1),
  editionId: z.string().min(1),
});

export type ActiveExamSelection = z.infer<typeof activeExamSelectionSchema>;

export const activeExamPreferenceSchema = z.discriminatedUnion('selectionRequired', [
  z.object({ selectionRequired: z.literal(false), selection: activeExamSelectionSchema }),
  z.object({ selectionRequired: z.literal(true), selection: z.null() }),
]);

export type ActiveExamPreference = z.infer<typeof activeExamPreferenceSchema>;

export const foreignLanguagePreferenceSchema = z.object({
  language: foreignLanguageSchema,
});

export type ForeignLanguagePreference = z.infer<typeof foreignLanguagePreferenceSchema>;

export const pendingSyncItemSchema = z.object({
  eventId: z.string().uuid(),
  attempt: z.number().int().nonnegative(),
  nextAttemptAt: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});

export type PendingSyncItem = z.infer<typeof pendingSyncItemSchema>;
