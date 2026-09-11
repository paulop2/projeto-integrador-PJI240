import type { BluexBoard } from './bluex-board';
import { fuvestBoard } from './bluex-board';
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
 * Fuvest/USP binding of the shared BLUEX normalizer. Uses the same parsing and
 * validation logic as Comvest; only the {@link fuvestBoard} descriptor changes.
 */

export const fuvestBoardRef: BluexBoard = fuvestBoard;
export const fuvestInstitutionId = fuvestBoard.institutionId;
export const fuvestExamId = fuvestBoard.examId;

export type FuvestRejectionReason = BluexRejectionReason;
export type FuvestRejection = BluexRejection;
export type FuvestIgnoredAssetReason = BluexIgnoredAssetReason;
export type FuvestIgnoredAsset = BluexIgnoredAsset;
export type FuvestEditionPackage = BluexEditionPackage;
export type FuvestNormalizationResult = BluexNormalizationResult;
export type FuvestNormalizationOptions = BluexNormalizationOptions;
export type NormalizedFuvestQuestion = NormalizedBluexQuestion;
export type FuvestQuestionResult = BluexQuestionResult;

export const fuvestEditionId = (year: number, day: number | null): string =>
  bluexEditionId(fuvestBoard, year, day);

export const fuvestAssetUrl = (sourceImagePath: string): string =>
  bluexAssetUrl(fuvestBoard, sourceImagePath);

export const toFuvestSourceImagePath = (assetUrl: string): string =>
  toBluexSourceImagePath(fuvestBoard, assetUrl);

export const normalizeFuvestQuestion = (
  sourceFile: string,
  raw: unknown,
): FuvestQuestionResult => normalizeBluexQuestion(sourceFile, raw, fuvestBoard);

export const createFuvestPackages = (
  entries: Parameters<typeof createBluexPackages>[0],
  options: FuvestNormalizationOptions = {},
): FuvestNormalizationResult => createBluexPackages(entries, fuvestBoard, options);
