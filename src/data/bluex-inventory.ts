import { z } from 'zod';

import type { BluexBoard } from './bluex-board';

/**
 * Inventory of the multiple-choice questions from a BLUEX first-phase snapshot.
 * The module is intentionally read-only and metadata-only: it never carries the
 * question text, the alternatives text or the image bytes, only the references
 * needed to plan and verify an import. It is parameterized by {@link BluexBoard}
 * so Comvest and Fuvest share one implementation.
 */

export const bluexQuestionSchema = z.object({
  question: z.string(),
  number: z.number().int().positive(),
  id: z.string().trim().min(1),
  alternatives: z.array(z.string()),
  associated_images: z.array(z.string()),
  answer: z.string().nullable(),
  has_associated_images: z.boolean(),
  alternatives_type: z.string().trim().min(1),
  subject: z.array(z.string().trim().min(1)),
  TU: z.boolean(),
  IU: z.boolean(),
  MR: z.boolean(),
  ML: z.boolean(),
  BK: z.boolean(),
  PRK: z.boolean(),
});

export type BluexQuestion = z.infer<typeof bluexQuestionSchema>;

export const bluexAnomalySchema = z.enum([
  'empty-answer',
  'unexpected-alternative-count',
  'image-reference-missing',
]);

export type BluexAnomaly = z.infer<typeof bluexAnomalySchema>;

export interface BluexInventoryRecord {
  readonly source: 'bluex';
  readonly sourceFile: string;
  readonly year: number;
  readonly day: number | null;
  readonly number: number;
  readonly sourceId: string;
  readonly subjectIds: readonly string[];
  readonly answer: string | null;
  readonly alternativeCount: number;
  readonly alternativesType: string;
  readonly hasImages: boolean;
  readonly imageRefs: readonly string[];
  readonly anomalies: readonly BluexAnomaly[];
}

export interface BluexInventorySourceEntry {
  readonly file: string;
  readonly raw: unknown;
}

export interface BluexParseError {
  readonly file: string;
  readonly message: string;
}

export interface BluexDuplicateId {
  readonly id: string;
  readonly files: readonly string[];
}

export interface BluexMissingImageReference {
  readonly sourceId: string;
  readonly file: string;
  readonly imageRef: string;
}

export interface BluexYearSummary {
  readonly year: number;
  readonly days: readonly { readonly day: number | null; readonly questions: number }[];
  readonly questions: number;
}

export interface BluexInventorySummary {
  readonly source: 'bluex';
  readonly university: BluexBoard['university'];
  readonly phase: 'first';
  readonly questionCount: number;
  readonly parseErrorCount: number;
  readonly parseErrors: readonly BluexParseError[];
  readonly byYear: readonly BluexYearSummary[];
  readonly subjectCounts: Readonly<Record<string, number>>;
  readonly alternativeCountDistribution: readonly {
    readonly alternativeCount: number;
    readonly questions: number;
  }[];
  readonly questionsWithImages: number;
  readonly imageReferenceCount: number;
  readonly distinctImageReferenceCount: number;
  readonly missingImageReferences: readonly BluexMissingImageReference[];
  readonly orphanImageFiles: readonly string[];
  readonly duplicateIds: readonly BluexDuplicateId[];
  readonly emptyAnswers: readonly { readonly sourceId: string; readonly file: string }[];
  readonly unexpectedAlternativeCounts: readonly {
    readonly sourceId: string;
    readonly file: string;
    readonly alternativeCount: number;
  }[];
}

export interface SummarizeBluexOptions {
  /** Image paths (relative to the dataset root, forward slashes) that exist on disk. */
  readonly availableImageFiles?: ReadonlySet<string>;
}

export const normalizeSourcePath = (path: string): string => path.replaceAll('\\', '/');

const deriveEdition = (sourceFile: string): { year: number; day: number | null } => {
  const segments = normalizeSourcePath(sourceFile).split('/');
  const year = Number(segments[0]);
  if (!Number.isInteger(year)) {
    throw new Error(`source file "${sourceFile}" does not start with a year folder`);
  }
  const dayMatch = segments[1]?.match(/^day(\d+)$/);
  return { year, day: dayMatch ? Number(dayMatch[1]) : null };
};

export const toBluexInventoryRecord = (
  sourceFile: string,
  raw: unknown,
  board: BluexBoard,
): BluexInventoryRecord => {
  const question = bluexQuestionSchema.parse(raw);
  const { year, day } = deriveEdition(sourceFile);
  const answer = (question.answer ?? '').trim();
  const anomalies: BluexAnomaly[] = [];
  if (answer.length === 0) anomalies.push('empty-answer');
  if (question.alternatives.length !== board.expectedAlternativeCount) {
    anomalies.push('unexpected-alternative-count');
  }

  return {
    source: 'bluex',
    sourceFile: normalizeSourcePath(sourceFile),
    year,
    day,
    number: question.number,
    sourceId: question.id,
    subjectIds: [...question.subject].sort(),
    answer: answer.length === 0 ? null : answer,
    alternativeCount: question.alternatives.length,
    alternativesType: question.alternatives_type,
    hasImages: question.has_associated_images,
    imageRefs: question.associated_images.map(normalizeSourcePath),
    anomalies,
  };
};

export interface BluexInventoryBuild {
  readonly records: readonly BluexInventoryRecord[];
  readonly parseErrors: readonly BluexParseError[];
}

export const buildBluexInventory = (
  entries: readonly BluexInventorySourceEntry[],
  board: BluexBoard,
): BluexInventoryBuild => {
  const records: BluexInventoryRecord[] = [];
  const parseErrors: BluexParseError[] = [];

  for (const entry of entries) {
    try {
      records.push(toBluexInventoryRecord(entry.file, entry.raw, board));
    } catch (error) {
      parseErrors.push({
        file: normalizeSourcePath(entry.file),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { records, parseErrors };
};

const countByYears = (
  records: readonly BluexInventoryRecord[],
): readonly BluexYearSummary[] => {
  const byYear = new Map<number, Map<number | null, number>>();
  for (const record of records) {
    const days = byYear.get(record.year) ?? new Map<number | null, number>();
    days.set(record.day, (days.get(record.day) ?? 0) + 1);
    byYear.set(record.year, days);
  }

  return [...byYear.entries()]
    .sort(([left], [right]) => left - right)
    .map(([year, days]) => {
      const orderedDays = [...days.entries()]
        .sort(([left], [right]) => (left ?? -1) - (right ?? -1))
        .map(([day, questions]) => ({ day, questions }));
      return {
        year,
        days: orderedDays,
        questions: orderedDays.reduce((total, entry) => total + entry.questions, 0),
      };
    });
};

const countSubjects = (
  records: readonly BluexInventoryRecord[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const record of records) {
    for (const subjectId of record.subjectIds) {
      counts[subjectId] = (counts[subjectId] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};

const countAlternativeCounts = (
  records: readonly BluexInventoryRecord[],
): BluexInventorySummary['alternativeCountDistribution'] => {
  const distribution = new Map<number, number>();
  for (const record of records) {
    distribution.set(record.alternativeCount, (distribution.get(record.alternativeCount) ?? 0) + 1);
  }
  return [...distribution.entries()]
    .sort(([left], [right]) => left - right)
    .map(([alternativeCount, questions]) => ({ alternativeCount, questions }));
};

const collectDuplicateIds = (
  records: readonly BluexInventoryRecord[],
): BluexDuplicateId[] => {
  const filesById = new Map<string, string[]>();
  for (const record of records) {
    filesById.set(record.sourceId, [...(filesById.get(record.sourceId) ?? []), record.sourceFile]);
  }
  return [...filesById.entries()]
    .filter(([, files]) => files.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, files]) => ({ id, files: files.sort() }));
};

export const summarizeBluexInventory = (
  build: BluexInventoryBuild,
  board: BluexBoard,
  options: SummarizeBluexOptions = {},
): BluexInventorySummary => {
  const { records, parseErrors } = build;
  const referenced = new Set<string>();
  const missingImageReferences: BluexMissingImageReference[] = [];

  for (const record of records) {
    for (const imageRef of record.imageRefs) {
      if (referenced.has(imageRef)) continue;
      referenced.add(imageRef);
      if (options.availableImageFiles && !options.availableImageFiles.has(imageRef)) {
        missingImageReferences.push({
          sourceId: record.sourceId,
          file: record.sourceFile,
          imageRef,
        });
      }
    }
  }

  const orphanImageFiles = options.availableImageFiles
    ? [...options.availableImageFiles].filter((path) => !referenced.has(path)).sort()
    : [];

  return {
    source: 'bluex',
    university: board.university,
    phase: 'first',
    questionCount: records.length,
    parseErrorCount: parseErrors.length,
    parseErrors: [...parseErrors],
    byYear: countByYears(records),
    subjectCounts: countSubjects(records),
    alternativeCountDistribution: countAlternativeCounts(records),
    questionsWithImages: records.filter(({ hasImages }) => hasImages).length,
    imageReferenceCount: records.reduce((total, record) => total + record.imageRefs.length, 0),
    distinctImageReferenceCount: referenced.size,
    missingImageReferences,
    orphanImageFiles,
    duplicateIds: collectDuplicateIds(records),
    emptyAnswers: records
      .filter(({ answer }) => answer === null)
      .map(({ sourceId, sourceFile }) => ({ sourceId, file: sourceFile }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    unexpectedAlternativeCounts: records
      .filter(({ alternativeCount }) => alternativeCount !== board.expectedAlternativeCount)
      .map(({ sourceId, sourceFile, alternativeCount }) => ({
        sourceId,
        file: sourceFile,
        alternativeCount,
      }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  };
};
