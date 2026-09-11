/**
 * Board descriptors for the BLUEX objective first-phase ingestion.
 *
 * Comvest and Fuvest share the same BLUEX source shape and the same runtime
 * contract; only the board identity, the asset path prefix and the expected
 * number of alternatives change. Every board-specific value lives here so the
 * inventory, the normalizer and the catalog builder stay parameterized instead
 * of forking the common logic.
 */

export type BluexBoardId = 'comvest' | 'fuvest';

export interface BluexBoard {
  readonly id: BluexBoardId;
  readonly university: 'unicamp' | 'usp';
  readonly institutionId: string;
  readonly institutionName: string;
  readonly examId: string;
  readonly examName: string;
  /** Directory under `questions/` and `imgs/` in the BLUEX snapshot. */
  readonly sourceUniversityDir: 'UNICAMP' | 'USP';
  readonly expectedAlternativeCount: number;
  readonly editionLabel: (year: number, day: number | null) => string;
}

export const comvestBoard: BluexBoard = {
  id: 'comvest',
  university: 'unicamp',
  institutionId: 'unicamp',
  institutionName: 'Universidade Estadual de Campinas (Comvest)',
  examId: 'comvest',
  examName: 'Comvest — Vestibular Unicamp',
  sourceUniversityDir: 'UNICAMP',
  expectedAlternativeCount: 4,
  editionLabel: (year, day) =>
    day === null
      ? `Vestibular Unicamp ${year}`
      : `Vestibular Unicamp ${year} — dia ${day}`,
};

export const fuvestBoard: BluexBoard = {
  id: 'fuvest',
  university: 'usp',
  institutionId: 'usp',
  institutionName: 'Universidade de São Paulo (Fuvest)',
  examId: 'fuvest',
  examName: 'Fuvest — Vestibular USP',
  sourceUniversityDir: 'USP',
  expectedAlternativeCount: 5,
  editionLabel: (year, day) =>
    day === null ? `Vestibular USP ${year}` : `Vestibular USP ${year} — dia ${day}`,
};

export const bluexBoards: Readonly<Record<BluexBoardId, BluexBoard>> = {
  comvest: comvestBoard,
  fuvest: fuvestBoard,
};

export const bluexBoardById = (id: string): BluexBoard => {
  const board = bluexBoards[id as BluexBoardId];
  if (board === undefined) throw new Error(`unknown BLUEX board "${id}"`);
  return board;
};
