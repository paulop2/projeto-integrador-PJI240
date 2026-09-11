#!/usr/bin/env node
import { fuvestBoard } from '../src/data/bluex-board';
import { runBluexImportCli } from './bluex-import';

export { parseBluexImportArgs as parseArgs } from './bluex-import';

await runBluexImportCli(fuvestBoard, 'import-fuvest.ts');
