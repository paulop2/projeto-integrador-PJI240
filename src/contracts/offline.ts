import { z } from 'zod';

export const downloadedPackageSchema = z.object({
  packageId: z.string().min(1),
  version: z.number().int().positive(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  downloadedAt: z.number().int().nonnegative(),
  lastVerifiedAt: z.number().int().nonnegative(),
});

export type DownloadedPackage = z.infer<typeof downloadedPackageSchema>;

export const pendingSyncItemSchema = z.object({
  eventId: z.string().uuid(),
  attempt: z.number().int().nonnegative(),
  nextAttemptAt: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});

export type PendingSyncItem = z.infer<typeof pendingSyncItemSchema>;
