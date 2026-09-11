import { fuvestBoard } from './bluex-board';
import {
  buildBluexInventory,
  summarizeBluexInventory,
  toBluexInventoryRecord,
  type BluexAnomaly,
  type BluexDuplicateId,
  type BluexInventoryBuild,
  type BluexInventoryRecord,
  type BluexInventorySourceEntry,
  type BluexInventorySummary,
  type BluexMissingImageReference,
  type BluexParseError,
  type BluexYearSummary,
  type SummarizeBluexOptions,
} from './bluex-inventory';

/**
 * Fuvest/USP first-phase binding of the shared BLUEX inventory. Uses the same
 * implementation as Comvest, differing only by the {@link fuvestBoard}
 * descriptor (university, exam id, asset prefix, expected alternative count).
 */

export {
  bluexQuestionSchema,
  normalizeSourcePath,
  type BluexQuestion,
} from './bluex-inventory';

export const fuvestFirstPhaseAlternatives = fuvestBoard.expectedAlternativeCount;

export type FuvestAnomaly = BluexAnomaly;
export type FuvestInventoryRecord = BluexInventoryRecord;
export type FuvestInventorySourceEntry = BluexInventorySourceEntry;
export type FuvestParseError = BluexParseError;
export type FuvestDuplicateId = BluexDuplicateId;
export type FuvestMissingImageReference = BluexMissingImageReference;
export type FuvestYearSummary = BluexYearSummary;
export type FuvestInventorySummary = BluexInventorySummary;
export type SummarizeFuvestOptions = SummarizeBluexOptions;
export type FuvestInventoryBuild = BluexInventoryBuild;

export const toFuvestInventoryRecord = (
  sourceFile: string,
  raw: unknown,
): FuvestInventoryRecord => toBluexInventoryRecord(sourceFile, raw, fuvestBoard);

export const buildFuvestInventory = (
  entries: readonly FuvestInventorySourceEntry[],
): FuvestInventoryBuild => buildBluexInventory(entries, fuvestBoard);

export const summarizeFuvestInventory = (
  build: FuvestInventoryBuild,
  options: SummarizeFuvestOptions = {},
): FuvestInventorySummary => summarizeBluexInventory(build, fuvestBoard, options);
