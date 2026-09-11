#!/usr/bin/env node
/**
 * Backwards-compatible alias for the shared BLUEX source helpers. New code
 * should import from `bluex-source.ts`; the Comvest CLI keeps this path so the
 * board-specific entry points stay readable.
 */
export {
  collectAvailableImages,
  exists,
  listFiles,
  readSourceEntries,
  sha256File,
} from './bluex-source';
