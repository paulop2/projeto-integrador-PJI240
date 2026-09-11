import { z } from 'zod';

import { questionSchema } from '../contracts/question';
import type { BluexRejectionReason } from './bluex-normalizer';
import { bluexQuestionSchema } from './comvest-inventory';

/**
 * Versioned contracts for the Comvest golden corpus and its ingestion manifest.
 *
 * The corpus fixes selected Comvest/Unicamp cases from the pinned BLUEX snapshot
 * together with the field-by-field result the normalizer must produce. It is the
 * shared base for the bootstrap normalizer and for later PDF/OCR steps: the
 * committed inventory stays the authoritative metadata source, the corpus stores
 * only the selected cases and their expected outcome, and regression tests
 * replay both against the pure normalizer without needing the external dataset.
 */

const identifierSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use kebab-case identifiers');

export const bluexReferenceSchema = z.object({
  kind: z.literal('bluex-objective'),
  dataset: z.string().trim().min(1),
  uri: z.string().trim().min(1),
  revision: z.string().regex(/^[a-f0-9]{40}$/, 'a BLUEX revision is a 40-character commit sha'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'a BLUEX hash is a lowercase sha256 hex digest'),
});

export type BluexReference = z.infer<typeof bluexReferenceSchema>;

export const comvestIngestionEditionSchema = z.object({
  board: z.literal('comvest'),
  phase: z.literal(1),
  acceptedKind: z.literal('single-choice'),
  institutionId: z.literal('unicamp'),
  institutionName: z.string().trim().min(1),
  examId: z.literal('comvest'),
  examName: z.string().trim().min(1),
  editionId: z.string().regex(/^comvest-\d{4}(?:-day\d)?$/),
  editionLabel: z.string().trim().min(1),
  year: z.number().int().min(1900).max(3000),
  day: z.number().int().positive().nullable(),
  layoutProfile: z.object({
    id: z.string().trim().min(1),
    version: z.number().int().positive(),
  }),
  sourceQuestionsPath: z.string().trim().min(1),
});

export type ComvestIngestionEdition = z.infer<typeof comvestIngestionEditionSchema>;

export const comvestIngestionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  manifestId: z.string().trim().min(1),
  manifestVersion: z.number().int().positive(),
  generatedFrom: z.object({
    inventory: z.string().trim().min(1),
    importReport: z.string().trim().min(1),
    research: z.string().trim().min(1),
  }),
  reference: bluexReferenceSchema,
  editions: z.array(comvestIngestionEditionSchema).min(1),
});

export type ComvestIngestionManifest = z.infer<typeof comvestIngestionManifestSchema>;

const rejectionReasons = [
  'invalid-source-question',
  'missing-subject',
  'empty-answer',
  'unknown-answer',
  'alternative-without-label',
  'alternative-without-content',
  'alternative-image-count-unsupported',
  'image-reference-missing',
  'unreferenced-associated-image',
  'invalid-image-path',
  'duplicate-question-id',
  'contract-violation',
] as const;

export const goldenRejectionReasonSchema = z.enum(rejectionReasons);

type AssertTrue<T extends true> = T;
type GoldenRejectionReason = z.infer<typeof goldenRejectionReasonSchema>;
// Compile-time guard: the corpus enum must list exactly the normalizer's reasons.
type _AllReasonsCovered = AssertTrue<
  Exclude<BluexRejectionReason, GoldenRejectionReason> extends never ? true : false
>;
type _NoUnknownReasons = AssertTrue<
  Exclude<GoldenRejectionReason, BluexRejectionReason> extends never ? true : false
>;

const rejectionSchema = z.object({
  sourceId: z.string().min(1).nullable(),
  editionId: z.string().min(1).nullable(),
  reason: goldenRejectionReasonSchema,
  detail: z.string().nullable(),
});

export type GoldenRejection = z.infer<typeof rejectionSchema>;

const publishedExpectationSchema = z.object({
  status: z.literal('published'),
  rejection: z.null(),
  question: questionSchema,
  sourceSubjectIds: z.array(z.string().min(1)).min(1),
});

const rejectedExpectationSchema = z.object({
  status: z.literal('rejected'),
  question: z.null(),
  rejection: rejectionSchema,
  sourceSubjectIds: z.array(z.string().min(1)).min(1),
});

export const goldenExpectationSchema = z.discriminatedUnion('status', [
  publishedExpectationSchema,
  rejectedExpectationSchema,
]);

export type GoldenExpectation = z.infer<typeof goldenExpectationSchema>;

export const goldenQuestionEntrySchema = z.object({
  sourceFile: z.string().min(1),
  sourceId: z.string().min(1),
  editionId: z.string().min(1),
  input: bluexQuestionSchema,
});

export type GoldenQuestionEntry = z.infer<typeof goldenQuestionEntrySchema>;

const ignoredAssetSchema = z.object({
  path: z.string().min(1),
  reason: z.enum(['orphan-file', 'unreferenced-associated-image', 'rejected-question-image']),
});

const questionCaseSchema = z.object({
  caseId: z.string().trim().min(1),
  kind: z.literal('question'),
  sourceFile: z.string().min(1),
  coverage: z.array(z.string().trim().min(1)).min(1),
  expected: goldenExpectationSchema,
});

const batchExpectationSchema = z.object({
  packages: z.array(
    z.object({
      editionId: z.string().min(1),
      questionIds: z.array(z.string().min(1)).min(1),
    }),
  ),
  rejections: z.array(rejectionSchema),
  referencedAssets: z.array(z.string().min(1)),
  ignoredAssets: z.array(ignoredAssetSchema),
});

export type GoldenBatchExpectation = z.infer<typeof batchExpectationSchema>;

const batchCaseSchema = z.object({
  caseId: z.string().trim().min(1),
  kind: z.literal('batch'),
  sourceFiles: z.array(z.string().min(1)).min(1),
  coverage: z.array(z.string().trim().min(1)).min(1),
  availableImageFiles: z.array(z.string().min(1)),
  expected: batchExpectationSchema,
});

export const goldenCaseSchema = z.discriminatedUnion('kind', [questionCaseSchema, batchCaseSchema]);

export type GoldenCase = z.infer<typeof goldenCaseSchema>;
export type GoldenQuestionCase = z.infer<typeof questionCaseSchema>;
export type GoldenBatchCase = z.infer<typeof batchCaseSchema>;

export const comvestGoldenCorpusSchema = z
  .object({
    schemaVersion: z.literal(1),
    corpusId: identifierSchema,
    corpusVersion: z.number().int().positive(),
    manifest: z.string().trim().min(1),
    reference: bluexReferenceSchema,
    coverage: z.record(z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)),
    deferred: z.array(
      z.object({
        category: z.string().trim().min(1),
        reason: z.string().trim().min(1),
      }),
    ),
    questions: z.array(goldenQuestionEntrySchema).min(1),
    cases: z.array(goldenCaseSchema).min(1),
  })
  .superRefine((corpus, context) => {
    const questionFiles = corpus.questions.map(({ sourceFile }) => sourceFile);
    if (new Set(questionFiles).size !== questionFiles.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'question sourceFiles must be unique' });
    }

    const caseIds = corpus.cases.map(({ caseId }) => caseId);
    if (new Set(caseIds).size !== caseIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'caseIds must be unique' });
    }

    const knownCases = new Set(caseIds);
    for (const [category, referenced] of Object.entries(corpus.coverage)) {
      for (const caseId of referenced) {
        if (!knownCases.has(caseId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `coverage "${category}" references unknown case "${caseId}"`,
          });
        }
      }
    }

    const knownFiles = new Set(questionFiles);
    for (const goldenCase of corpus.cases) {
      const referenced = goldenCase.kind === 'question' ? [goldenCase.sourceFile] : goldenCase.sourceFiles;
      for (const sourceFile of referenced) {
        if (!knownFiles.has(sourceFile)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `case "${goldenCase.caseId}" references unknown sourceFile "${sourceFile}"`,
          });
        }
      }
    }
  });

export type ComvestGoldenCorpus = z.infer<typeof comvestGoldenCorpusSchema>;

export const parseComvestIngestionManifest = (value: unknown): ComvestIngestionManifest =>
  comvestIngestionManifestSchema.parse(value);

export const parseComvestGoldenCorpus = (value: unknown): ComvestGoldenCorpus =>
  comvestGoldenCorpusSchema.parse(value);
