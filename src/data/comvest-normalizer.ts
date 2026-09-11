import type { BluexBoard } from './bluex-board';
import { comvestBoard } from './bluex-board';
import {
  bluexAssetUrl,
  bluexEditionId,
  createBluexPackages,
  normalizeBluexQuestion,
  toBluexSourceImagePath,
  type BluexEditionPackage,
  type BluexIgnoredAsset,
  type BluexIgnoredAssetReason,
  type BluexNormalizationOptions,
  type BluexNormalizationResult,
  type BluexQuestionResult,
  type BluexRejection,
  type BluexRejectionReason,
  type NormalizedBluexQuestion,
} from './bluex-normalizer';

/**
 * Comvest/Unicamp binding of the shared BLUEX normalizer. The
 * {@link comvestBoard} descriptor supplies the identity, edition key and asset
 * prefix; the parsing logic lives in `bluex-normalizer.ts`.
 */

export const comvestBoardRef: BluexBoard = comvestBoard;
export const comvestInstitutionId = comvestBoard.institutionId;
export const comvestExamId = comvestBoard.examId;

export type ComvestRejectionReason = BluexRejectionReason;
export type ComvestRejection = BluexRejection;
export type ComvestIgnoredAssetReason = BluexIgnoredAssetReason;
export type ComvestIgnoredAsset = BluexIgnoredAsset;
export type ComvestEditionPackage = BluexEditionPackage;
export type ComvestNormalizationResult = BluexNormalizationResult;
export type ComvestNormalizationOptions = BluexNormalizationOptions;
export type NormalizedComvestQuestion = NormalizedBluexQuestion;
export type ComvestQuestionResult = BluexQuestionResult;

export const comvestEditionId = (year: number, day: number | null): string =>
  bluexEditionId(comvestBoard, year, day);

export const comvestAssetUrl = (sourceImagePath: string): string =>
  bluexAssetUrl(comvestBoard, sourceImagePath);

export const toComvestSourceImagePath = (assetUrl: string): string =>
  toBluexSourceImagePath(comvestBoard, assetUrl);

export const normalizeComvestQuestion = (
  sourceFile: string,
  raw: unknown,
): ComvestQuestionResult => normalizeBluexQuestion(sourceFile, raw, comvestBoard);

export const createComvestPackages = (
  entries: Parameters<typeof createBluexPackages>[0],
  options: ComvestNormalizationOptions = {},
): ComvestNormalizationResult => createBluexPackages(entries, comvestBoard, options);
