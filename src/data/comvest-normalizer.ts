import type { Alternative, Question, QuestionPackage } from '../contracts/question';
import { questionPackageSchema, questionSchema } from '../contracts/question';
import {
  bluexQuestionSchema,
  normalizeSourcePath,
  toComvestInventoryRecord,
  type BluexQuestion,
  type ComvestInventoryRecord,
  type ComvestInventorySourceEntry,
} from './comvest-inventory';

/**
 * Normalizes the BLUEX snapshot of Comvest/Unicamp first-phase multiple-choice
 * questions into the runtime `single-choice` contract.
 *
 * The module is pure: it never touches the filesystem and never invents text,
 * subjects, answers or images. Every question and asset that cannot be
 * represented faithfully by the contract is rejected and reported explicitly.
 *
 * Subject mapping decision (the architecture lists this as an open decision):
 * the contract carries a single `subjectId`, so a multidisciplinary question
 * keeps only the first subject declared by BLUEX (`subject[0]`). The full list
 * stays available in the inventory metadata. Sorting the subjects would erase
 * the annotator's primary discipline, so the source order is preserved.
 */

export const comvestInstitutionId = 'unicamp';
export const comvestExamId = 'comvest';

const IMAGE_MARKER = /\[IMAGE (\d+)\]/g;
const ALTERNATIVE_LABEL = /^\s*([A-Za-z])\s*[)\].]/;

const normalizeIdentifier = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const comvestEditionId = (year: number, day: number | null): string =>
  day === null ? `${comvestExamId}-${year}` : `${comvestExamId}-${year}-day${day}`;

/** Public URL of an asset published under the app data layout. */
export const comvestAssetUrl = (sourceImagePath: string): string =>
  `/data/${comvestExamId}/assets/${normalizeSourcePath(sourceImagePath).replace(/^imgs\/UNICAMP\//, '')}`;

const isSafeDatasetPath = (path: string): boolean =>
  path.length > 0 &&
  !path.startsWith('/') &&
  !/^[A-Za-z]:/.test(path) &&
  !path.split('/').some((segment) => segment === '..');

/** Reverses {@link comvestAssetUrl} back to the BLUEX image path. */
export const toComvestSourceImagePath = (assetUrl: string): string =>
  `imgs/UNICAMP/${normalizeSourcePath(assetUrl).replace(`/data/${comvestExamId}/assets/`, '')}`;

export type ComvestRejectionReason =
  | 'invalid-source-question'
  | 'missing-subject'
  | 'empty-answer'
  | 'unknown-answer'
  | 'alternative-without-label'
  | 'alternative-without-content'
  | 'alternative-image-count-unsupported'
  | 'image-reference-missing'
  | 'unreferenced-associated-image'
  | 'invalid-image-path'
  | 'duplicate-question-id'
  | 'contract-violation';

export interface ComvestRejection {
  readonly sourceFile: string;
  readonly sourceId: string | null;
  readonly editionId: string | null;
  readonly reason: ComvestRejectionReason;
  readonly detail: string | null;
}

export type ComvestIgnoredAssetReason =
  | 'orphan-file'
  | 'unreferenced-associated-image'
  | 'rejected-question-image';

export interface ComvestIgnoredAsset {
  readonly path: string;
  readonly reason: ComvestIgnoredAssetReason;
}

export interface ComvestEditionPackage {
  readonly editionId: string;
  readonly year: number;
  readonly day: number | null;
  readonly package: QuestionPackage;
}

export interface ComvestNormalizationResult {
  readonly packages: readonly ComvestEditionPackage[];
  readonly rejections: readonly ComvestRejection[];
  /** Public URLs of every asset referenced by a published question. */
  readonly referencedAssets: readonly string[];
  /** Assets that exist in the snapshot but are not published, with the reason. */
  readonly ignoredAssets: readonly ComvestIgnoredAsset[];
}

export interface ComvestNormalizationOptions {
  /** BLUEX image paths (relative to the dataset root, forward slashes) on disk. */
  readonly availableImageFiles?: ReadonlySet<string>;
}

interface ParsedText {
  readonly text: string;
  readonly imageRefs: readonly string[];
  readonly invalidMarkerIndex: number | null;
}

const parseText = (
  input: string,
  associatedImages: readonly string[],
): ParsedText => {
  const imageRefs: string[] = [];
  let invalidMarkerIndex: number | null = null;
  const text = input.replace(IMAGE_MARKER, (_match, rawIndex: string) => {
    const index = Number(rawIndex);
    const image = associatedImages[index];
    if (image === undefined) {
      invalidMarkerIndex ??= index;
      return '';
    }
    const normalized = normalizeSourcePath(image);
    if (!imageRefs.includes(normalized)) imageRefs.push(normalized);
    return '';
  });
  return { text: text.trim(), imageRefs, invalidMarkerIndex };
};

interface ParsedAlternative {
  readonly alternative: Alternative;
  readonly imageRefs: readonly string[];
}

type AlternativeResult =
  | { readonly ok: true; readonly value: ParsedAlternative }
  | { readonly ok: false; readonly reason: ComvestRejectionReason; readonly detail: string };

const parseAlternative = (
  raw: string,
  associatedImages: readonly string[],
): AlternativeResult => {
  const labelMatch = ALTERNATIVE_LABEL.exec(raw);
  const letter = labelMatch?.[1];
  if (!labelMatch || letter === undefined) {
    return { ok: false, reason: 'alternative-without-label', detail: raw.slice(0, 60) };
  }

  const body = raw.slice(labelMatch[0].length);
  const parsed = parseText(body, associatedImages);
  if (parsed.invalidMarkerIndex !== null) {
    return {
      ok: false,
      reason: 'image-reference-missing',
      detail: `[IMAGE ${parsed.invalidMarkerIndex}] has no associated image`,
    };
  }
  if (parsed.imageRefs.length > 1) {
    return {
      ok: false,
      reason: 'alternative-image-count-unsupported',
      detail: `alternative "${letter}" references ${parsed.imageRefs.length} images`,
    };
  }

  const file = parsed.imageRefs[0] !== undefined ? comvestAssetUrl(parsed.imageRefs[0]) : null;
  const text = parsed.text.length > 0 ? parsed.text : null;
  if (text === null && file === null) {
    return { ok: false, reason: 'alternative-without-content', detail: `alternative "${letter}"` };
  }

  return {
    ok: true,
    value: {
      alternative: {
        id: normalizeIdentifier(letter),
        label: letter.toUpperCase(),
        text,
        file,
      },
      imageRefs: parsed.imageRefs,
    },
  };
};

export interface NormalizedComvestQuestion {
  readonly question: Question;
  readonly sourceFile: string;
  readonly sourceId: string;
  readonly number: number;
  readonly editionId: string;
  readonly year: number;
  readonly day: number | null;
  /** BLUEX-relative image paths referenced anywhere in the question. */
  readonly referencedImages: readonly string[];
  /** BLUEX-relative image paths listed in `associated_images`. */
  readonly associatedImages: readonly string[];
}

export type ComvestQuestionResult =
  | { readonly ok: true; readonly value: NormalizedComvestQuestion }
  | { readonly ok: false; readonly rejection: ComvestRejection };

export const normalizeComvestQuestion = (
  sourceFile: string,
  raw: unknown,
): ComvestQuestionResult => {
  const normalizedFile = normalizeSourcePath(sourceFile);

  let source: BluexQuestion;
  let record: ComvestInventoryRecord;
  try {
    source = bluexQuestionSchema.parse(raw);
    record = toComvestInventoryRecord(normalizedFile, raw);
  } catch (error) {
    return {
      ok: false,
      rejection: {
        sourceFile: normalizedFile,
        sourceId: null,
        editionId: null,
        reason: 'invalid-source-question',
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const editionId = comvestEditionId(record.year, record.day);
  const reject = (reason: ComvestRejectionReason, detail: string): ComvestQuestionResult => ({
    ok: false,
    rejection: {
      sourceFile: normalizedFile,
      sourceId: record.sourceId,
      editionId,
      reason,
      detail,
    },
  });

  const primarySubject = source.subject[0];
  if (primarySubject === undefined) return reject('missing-subject', source.id);

  if (record.answer === null) {
    return reject('empty-answer', 'the source question has an empty answer');
  }

  const associatedImages = source.associated_images.map(normalizeSourcePath);
  const unsafeImage = associatedImages.find((image) => !isSafeDatasetPath(image));
  if (unsafeImage !== undefined) {
    return reject('invalid-image-path', `unsafe associated image path "${unsafeImage}"`);
  }

  const questionText = parseText(source.question, associatedImages);
  if (questionText.invalidMarkerIndex !== null) {
    return reject(
      'image-reference-missing',
      `[IMAGE ${questionText.invalidMarkerIndex}] in the question has no associated image`,
    );
  }

  const alternatives: Alternative[] = [];
  const referencedImages = [...questionText.imageRefs];
  for (const rawAlternative of source.alternatives) {
    const parsed = parseAlternative(rawAlternative, associatedImages);
    if (!parsed.ok) return reject(parsed.reason, parsed.detail);
    alternatives.push(parsed.value.alternative);
    referencedImages.push(...parsed.value.imageRefs);
  }

  const referencedSet = new Set(referencedImages);
  const unreferenced = associatedImages.filter((image) => !referencedSet.has(image));
  if (unreferenced.length > 0) {
    return reject(
      'unreferenced-associated-image',
      `associated image not referenced by any [IMAGE n]: ${unreferenced.join(', ')}`,
    );
  }

  const answerId = normalizeIdentifier(record.answer);
  if (!alternatives.some(({ id }) => id === answerId)) {
    return reject('unknown-answer', `answer "${record.answer}" does not match any alternative`);
  }

  const question: Question = {
    id: `${comvestExamId}-${editionId}-${record.sourceId}`,
    institutionId: comvestInstitutionId,
    examId: comvestExamId,
    editionId,
    year: record.year,
    subjectId: normalizeIdentifier(primarySubject),
    language: null,
    kind: 'single-choice',
    context: questionText.text.length > 0 ? questionText.text : null,
    files: [...questionText.imageRefs].map(comvestAssetUrl),
    alternativesIntroduction: null,
    alternatives,
    answer: { optionIds: [answerId] },
  };

  const validated = questionSchema.safeParse(question);
  if (!validated.success) {
    return reject(
      'contract-violation',
      validated.error.issues.map(({ message }) => message).join('; '),
    );
  }

  return {
    ok: true,
    value: {
      question: validated.data,
      sourceFile: normalizedFile,
      sourceId: record.sourceId,
      number: record.number,
      editionId,
      year: record.year,
      day: record.day,
      referencedImages,
      associatedImages,
    },
  };
};

const sortQuestions = (
  left: NormalizedComvestQuestion,
  right: NormalizedComvestQuestion,
): number =>
  left.number - right.number ||
  left.sourceId.localeCompare(right.sourceId) ||
  left.question.id.localeCompare(right.question.id);

const unique = (values: readonly string[]): string[] => [...new Set(values)].sort();

export const createComvestPackages = (
  entries: readonly ComvestInventorySourceEntry[],
  options: ComvestNormalizationOptions = {},
): ComvestNormalizationResult => {
  const rejections: ComvestRejection[] = [];
  const accepted: NormalizedComvestQuestion[] = [];
  const seenIds = new Map<string, string>();

  for (const entry of entries) {
    const result = normalizeComvestQuestion(entry.file, entry.raw);
    if (!result.ok) {
      rejections.push(result.rejection);
      continue;
    }
    const { question, sourceFile, sourceId, editionId } = result.value;
    const prior = seenIds.get(question.id);
    if (prior !== undefined) {
      rejections.push({
        sourceFile,
        sourceId,
        editionId,
        reason: 'duplicate-question-id',
        detail: `duplicate of ${prior}`,
      });
      continue;
    }
    seenIds.set(question.id, sourceFile);
    accepted.push(result.value);
  }

  const byEdition = new Map<string, NormalizedComvestQuestion[]>();
  for (const normalizing of accepted) {
    const list = byEdition.get(normalizing.editionId) ?? [];
    list.push(normalizing);
    byEdition.set(normalizing.editionId, list);
  }

  const packages: ComvestEditionPackage[] = [...byEdition.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([editionId, questions]) => {
      const ordered = [...questions].sort(sortQuestions);
      const first = ordered[0];
      if (first === undefined) throw new Error(`edition ${editionId} has no questions`);
      return {
        editionId,
        year: first.year,
        day: first.day,
        package: questionPackageSchema.parse({
          schemaVersion: 1,
          packageId: editionId,
          institutionId: comvestInstitutionId,
          examId: comvestExamId,
          editionId,
          questions: ordered.map(({ question }) => question),
        }),
      };
    });

  const publishedReferenced = new Set<string>();
  const publishedAssociated = new Set<string>();
  for (const { referencedImages, associatedImages } of accepted) {
    for (const image of referencedImages) publishedReferenced.add(image);
    for (const image of associatedImages) publishedAssociated.add(image);
  }

  const rejectedFiles = new Set(rejections.map(({ sourceFile }) => sourceFile));
  const rejectedAssociated = new Set<string>();
  for (const entry of entries) {
    if (!rejectedFiles.has(normalizeSourcePath(entry.file))) continue;
    const parsed = bluexQuestionSchema.safeParse(entry.raw);
    if (parsed.success) {
      for (const image of parsed.data.associated_images) {
        rejectedAssociated.add(normalizeSourcePath(image));
      }
    }
  }

  const ignoredAssets: ComvestIgnoredAsset[] = options.availableImageFiles
    ? [...options.availableImageFiles]
        .filter((path) => !publishedReferenced.has(path))
        .sort()
        .map((path) => ({
          path,
          reason: publishedAssociated.has(path)
            ? 'unreferenced-associated-image'
            : rejectedAssociated.has(path)
              ? 'rejected-question-image'
              : 'orphan-file',
        }))
    : [];

  return {
    packages,
    rejections: [...rejections].sort((left, right) =>
      left.sourceFile.localeCompare(right.sourceFile)),
    referencedAssets: unique(
      accepted.flatMap(({ referencedImages }) => referencedImages.map(comvestAssetUrl)),
    ),
    ignoredAssets,
  };
};
