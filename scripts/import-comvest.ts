#!/usr/bin/env node
import { comvestBoard } from '../src/data/bluex-board';
import { runBluexImportCli } from './bluex-import';

export { parseBluexImportArgs as parseArgs } from './bluex-import';

await runBluexImportCli(comvestBoard, 'import-comvest.ts');
