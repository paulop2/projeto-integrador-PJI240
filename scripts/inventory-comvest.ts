#!/usr/bin/env node
import { comvestBoard } from '../src/data/bluex-board';
import { runBluexInventoryCli } from './bluex-inventory';

export { parseBluexInventoryArgs as parseArgs } from './bluex-inventory';

await runBluexInventoryCli(comvestBoard, 'inventory-comvest.ts');
