import { z } from 'zod';

/**
 * Versioned contracts for the ingestion artifact store and run-ledger.
 *
 * Artifacts are immutable and identified by the SHA-256 of their bytes; paths are
 * localizers, not identity. The run-ledger records the toolchain, configuration,
 * inputs and outputs of one ingestion run so a repeated execution can be audited
 * and resumed without re-deriving provenance. These contracts mirror the
 * conceptual types of `docs/architecture/vestibular-ingestion-pipeline.md`.
 */

export const sha256Schema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, 'use a lowercase sha256 digest prefixed with "sha256:"');

export type Sha256 = z.infer<typeof sha256Schema>;

export const artifactKindSchema = z.enum([
  'source-manifest',
  'source-snapshot',
  'page-evidence',
  'ocr-observations',
  'question-candidates',
  'validation-report',
  'review-bundle',
  'review-decisions',
  'approved-corpus',
  'question-package',
  'package-descriptor',
  'run-ledger',
]);

export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export const mediaTypeSchema = z
  .string()
  .trim()
  .regex(/^[\w.+-]+\/[\w.+-]+$/, 'use a media type such as application/json');

export const artifactRefSchema = z.object({
  kind: artifactKindSchema,
  sha256: sha256Schema,
  uri: z.string().trim().min(1),
  byteSize: z.number().int().nonnegative(),
  mediaType: mediaTypeSchema,
});

export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export const toolchainComponentSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
});

export type ToolchainComponent = z.infer<typeof toolchainComponentSchema>;

export const stageDispositionSchema = z.enum(['executed', 'reused']);

export type StageDisposition = z.infer<typeof stageDispositionSchema>;

export const ledgerStageSchema = z.object({
  id: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  cacheKey: sha256Schema,
  disposition: stageDispositionSchema,
  inputs: z.array(artifactRefSchema),
  outputs: z.array(artifactRefSchema),
});

export type LedgerStage = z.infer<typeof ledgerStageSchema>;

export const ledgerConfigSchema = z.record(
  z.string().trim().min(1),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export type LedgerConfig = z.infer<typeof ledgerConfigSchema>;

export const runLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: sha256Schema,
    toolchain: z.array(toolchainComponentSchema).min(1),
    config: ledgerConfigSchema,
    inputs: z.array(artifactRefSchema),
    outputs: z.array(artifactRefSchema),
    stages: z.array(ledgerStageSchema),
  })
  .superRefine((ledger, context) => {
    const stageIds = ledger.stages.map(({ id }) => id);
    if (new Set(stageIds).size !== stageIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stage ids must be unique',
      });
    }

    const cacheKeys = ledger.stages.map(({ cacheKey }) => cacheKey);
    if (new Set(cacheKeys).size !== cacheKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stage cache keys must be unique',
      });
    }

    const produced = new Set(
      ledger.stages.flatMap(({ outputs }) => outputs.map(({ sha256 }) => sha256)),
    );
    for (const output of ledger.outputs) {
      if (!produced.has(output.sha256)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ledger output ${output.sha256} was not produced by any stage`,
        });
      }
    }
  });

export type RunLedger = z.infer<typeof runLedgerSchema>;
