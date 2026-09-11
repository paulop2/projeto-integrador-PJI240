import { comvestBoard } from './bluex-board';
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
 * Comvest/Unicamp first-phase binding of the shared BLUEX inventory. Kept as a
 * named module so existing callers and the import script stay board-specific
 * without duplicating the generic implementation in `bluex-inventory.ts`.
 */

export {
  bluexQuestionSchema,
  normalizeSourcePath,
  type BluexQuestion,
} from './bluex-inventory';

export const comvestFirstPhaseAlternatives = comvestBoard.expectedAlternativeCount;

export type ComvestAnomaly = BluexAnomaly;
export type ComvestInventoryRecord = BluexInventoryRecord;
export type ComvestInventorySourceEntry = BluexInventorySourceEntry;
export type ComvestParseError = BluexParseError;
export type ComvestDuplicateId = BluexDuplicateId;
export type ComvestMissingImageReference = BluexMissingImageReference;
export type ComvestYearSummary = BluexYearSummary;
export type ComvestInventorySummary = BluexInventorySummary;
export type SummarizeComvestOptions = SummarizeBluexOptions;
export type ComvestInventoryBuild = BluexInventoryBuild;

export const toComvestInventoryRecord = (
  sourceFile: string,
  raw: unknown,
): ComvestInventoryRecord => toBluexInventoryRecord(sourceFile, raw, comvestBoard);

export const buildComvestInventory = (
  entries: readonly ComvestInventorySourceEntry[],
): ComvestInventoryBuild => buildBluexInventory(entries, comvestBoard);

export const summarizeComvestInventory = (
  build: ComvestInventoryBuild,
  options: SummarizeComvestOptions = {},
): ComvestInventorySummary => summarizeBluexInventory(build, comvestBoard, options);
