#!/usr/bin/env node
import { fuvestBoard } from '../src/data/bluex-board';
import { runBluexInventoryCli } from './bluex-inventory';

export { parseBluexInventoryArgs as parseArgs } from './bluex-inventory';

await runBluexInventoryCli(fuvestBoard, 'inventory-fuvest.ts');
