import { describe, expect, it } from 'vitest';

import corpusBody from '../docs/research/data/comvest-golden-corpus.json?raw';
import inventoryBody from '../docs/research/data/comvest-unicamp-bluex-inventory.json?raw';
import reportBody from '../docs/research/data/comvest-unicamp-import-report.json?raw';
import manifestBody from '../docs/research/data/comvest-ingestion-manifest.json?raw';

import type { GoldenBatchCase, GoldenQuestionCase } from '../src/data/comvest-golden-corpus';
import {
  parseComvestGoldenCorpus,
  parseComvestIngestionManifest,
} from '../src/data/comvest-golden-corpus';
import { toComvestInventoryRecord } from '../src/data/comvest-inventory';
import {
  comvestEditionId,
  createComvestPackages,
  normalizeComvestQuestion,
} from '../src/data/comvest-normalizer';

const manifest = parseComvestIngestionManifest(JSON.parse(manifestBody));
const corpus = parseComvestGoldenCorpus(JSON.parse(corpusBody));
const inventory = JSON.parse(inventoryBody);
const report = JSON.parse(reportBody);

const inventoryByFile = new Map<string, any>(inventory.records.map((record: any) => [record.sourceFile, record]));
const questionByFile = new Map(corpus.questions.map((entry) => [entry.sourceFile, entry]));

const expectedPackageShape = (result: ReturnType<typeof createComvestPackages>) => ({
  packages: result.packages.map(({ editionId, package: questionPackage }) => ({
    editionId,
    questionIds: questionPackage.questions.map(({ id }) => id),
  })),
  rejections: result.rejections.map(({ sourceId, editionId, reason, detail }) => ({
    sourceId,
    editionId,
    reason,
    detail,
  })),
  referencedAssets: result.referencedAssets,
  ignoredAssets: result.ignoredAssets,
});

const runBatch = (goldenCase: GoldenBatchCase) => {
  const entries = goldenCase.sourceFiles.map((sourceFile) => {
    const entry = questionByFile.get(sourceFile);
    if (!entry) throw new Error(`missing golden question ${sourceFile}`);
    return { file: sourceFile, raw: entry.input };
  });
  return expectedPackageShape(
    createComvestPackages(entries, {
      availableImageFiles: new Set(goldenCase.availableImageFiles),
    }),
  );
};

describe('Comvest ingestion manifest', () => {
  it('pins the BLUEX snapshot shared by the committed inventory and import report', () => {
    expect(manifest.reference.revision).toBe(inventory.provenance.commit);
    expect(manifest.reference.sha256).toBe(inventory.provenance.zip.sha256);
    expect(manifest.reference.sha256).toBe(report.provenance.zip.sha256);
    expect(manifest.reference).toEqual(corpus.reference);
  });

  it('declares every Comvest edition with the accepted single-choice contract', () => {
    const reported = report.summary.editions.map(({ editionId, year, day }: any) => ({ editionId, year, day }));

    expect(manifest.editions.map(({ editionId, year, day }) => ({ editionId, year, day }))).toEqual(
      reported,
    );
    for (const edition of manifest.editions) {
      expect(edition).toMatchObject({
        board: 'comvest',
        phase: 1,
        acceptedKind: 'single-choice',
        institutionId: 'unicamp',
        examId: 'comvest',
      });
      expect(edition.sourceQuestionsPath).toBe(
        edition.day === null
          ? `questions/UNICAMP/${edition.year}`
          : `questions/UNICAMP/${edition.year}/day${edition.day}`,
      );
    }
  });
});

describe('Comvest golden corpus against the pinned inventory', () => {
  it('covers every category of the architecture test strategy or defers it explicitly', () => {
    for (const category of [
      'simple-text',
      'formula',
      'table',
      'image-in-prompt',
      'image-as-alternative',
      'multidisciplinary',
      'empty-answer',
      'hyphenation',
      'problematic-characters',
    ]) {
      expect(corpus.coverage[category]?.length ?? 0).toBeGreaterThan(0);
    }

    expect(corpus.deferred.map(({ category }) => category)).toEqual([
      'two-columns',
      'page-break',
      'page-evidence',
      'human-approval',
    ]);
    expect(corpus.deferred.every(({ reason }) => reason.length > 0)).toBe(true);
  });

  it('references only cases declared in the corpus', () => {
    const caseIds = new Set(corpus.cases.map(({ caseId }) => caseId));
    for (const referenced of Object.values(corpus.coverage)) {
      for (const caseId of referenced) expect(caseIds.has(caseId)).toBe(true);
    }
    for (const { caseId } of corpus.cases) {
      const covered = Object.values(corpus.coverage).some((referenced) => referenced.includes(caseId));
      expect(covered).toBe(true);
    }
  });

  it('keeps every selected case byte-identical to its authoritative inventory metadata', () => {
    expect(corpus.questions.length).toBeGreaterThan(0);
    for (const entry of corpus.questions) {
      const committed = inventoryByFile.get(entry.sourceFile);
      if (!committed) throw new Error(`inventory has no record for ${entry.sourceFile}`);

      const recomputed = toComvestInventoryRecord(entry.sourceFile, entry.input);
      expect({
        sourceId: recomputed.sourceId,
        number: recomputed.number,
        year: recomputed.year,
        day: recomputed.day,
        answer: recomputed.answer,
        alternativeCount: recomputed.alternativeCount,
        subjectIds: recomputed.subjectIds,
        imageRefs: recomputed.imageRefs,
        hasImages: recomputed.hasImages,
      }).toEqual({
        sourceId: committed.sourceId,
        number: committed.number,
        year: committed.year,
        day: committed.day,
        answer: committed.answer,
        alternativeCount: committed.alternativeCount,
        subjectIds: committed.subjectIds,
        imageRefs: committed.imageRefs,
        hasImages: committed.hasImages,
      });

      expect(entry.sourceId).toBe(committed.sourceId);
      expect(entry.editionId).toBe(comvestEditionId(recomputed.year, recomputed.day));
    }
  });

  it('selects only cases that exist in the committed inventory and import report', () => {
    const reportedRejections = new Set(
      report.rejections.map(({ sourceFile }: any) => sourceFile),
    );
    const selectedRejections = corpus.cases
      .filter((goldenCase): goldenCase is GoldenQuestionCase => goldenCase.kind === 'question')
      .filter((goldenCase) => goldenCase.expected.status === 'rejected')
      .map(({ sourceFile }) => sourceFile);

    for (const sourceFile of selectedRejections) {
      expect(reportedRejections.has(sourceFile)).toBe(true);
    }
  });

  it('selects exactly the anomaly source files recorded in the inventory summary', () => {
    const emptyAnswers = inventory.summary.emptyAnswers
      .map((entry: any) => entry.file)
      .sort();
    const selectedEmptyAnswers = corpus.cases
      .filter((goldenCase): goldenCase is GoldenQuestionCase => goldenCase.kind === 'question')
      .filter(
        (goldenCase) =>
          goldenCase.expected.status === 'rejected' &&
          goldenCase.expected.rejection.reason === 'empty-answer',
      )
      .map(({ sourceFile }) => sourceFile)
      .sort();
    expect(selectedEmptyAnswers).toEqual(emptyAnswers);

    const unexpected = inventory.summary.unexpectedAlternativeCounts
      .map((entry: any) => entry.file)
      .sort();
    const unexpectedCases = corpus.cases
      .filter(
        (goldenCase): goldenCase is GoldenQuestionCase =>
          goldenCase.kind === 'question' &&
          goldenCase.coverage.includes('unexpected-alternative-count'),
      )
      .map(({ sourceFile }) => sourceFile)
      .sort();
    expect(unexpectedCases).toEqual(unexpected);

    const collision = corpus.cases.find(({ caseId }) => caseId === 'id-collision-2021');
    if (!collision || collision.kind !== 'batch') throw new Error('missing collision batch');
    const duplicatePair = inventory.summary.duplicateIds.find(
      (entry: any) => entry.id === 'UNICAMP_2021_1',
    );
    expect(duplicatePair?.files.slice().sort()).toEqual(collision.sourceFiles.slice().sort());

    const orphanBatch = corpus.cases.find(({ caseId }) => caseId === 'orphan-assets');
    if (!orphanBatch || orphanBatch.kind !== 'batch') throw new Error('missing orphan batch');
    expect(orphanBatch.availableImageFiles.slice().sort()).toEqual(
      inventory.summary.orphanImageFiles.slice().sort(),
    );
  });
});

describe('Comvest golden corpus replays through the normalizer', () => {
  it('reproduces the expected field-by-field result for every question case', () => {
    const questionCases = corpus.cases.filter(
      (goldenCase): goldenCase is GoldenQuestionCase => goldenCase.kind === 'question',
    );
    expect(questionCases.length).toBeGreaterThan(0);

    for (const goldenCase of questionCases) {
      const entry = questionByFile.get(goldenCase.sourceFile);
      if (!entry) throw new Error(`missing golden question ${goldenCase.sourceFile}`);
      const result = normalizeComvestQuestion(goldenCase.sourceFile, entry.input);

      expect(goldenCase.expected.sourceSubjectIds).toEqual(entry.input.subject);

      if (goldenCase.expected.status === 'published') {
        if (!result.ok) throw new Error(`${goldenCase.caseId}: ${result.rejection.reason}`);
        expect(result.value.question).toEqual(goldenCase.expected.question);
      } else {
        if (result.ok) throw new Error(`${goldenCase.caseId}: expected a rejection`);
        expect(result.rejection).toEqual({
          sourceFile: goldenCase.sourceFile,
          ...goldenCase.expected.rejection,
        });
      }
    }
  });

  it('resolves the 2021 collision into two distinct editions and never duplicates a global id', () => {
    const collision = corpus.cases.find(({ caseId }) => caseId === 'id-collision-2021');
    if (!collision || collision.kind !== 'batch') throw new Error('missing collision batch');
    const result = runBatch(collision);

    expect(result).toEqual(collision.expected);
    expect(result.rejections).toEqual([]);

    const ids = result.packages.flatMap(({ questionIds }) => questionIds);
    expect(ids).toContain('comvest-comvest-2021-day1-UNICAMP_2021_1');
    expect(ids).toContain('comvest-comvest-2021-day2-UNICAMP_2021_1');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists the six orphan 2021 assets explicitly and never publishes them', () => {
    const orphans = corpus.cases.find(({ caseId }) => caseId === 'orphan-assets');
    if (!orphans || orphans.kind !== 'batch') throw new Error('missing orphan batch');
    const result = runBatch(orphans);

    expect(result).toEqual(orphans.expected);
    expect(result.ignoredAssets).toHaveLength(6);
    expect(result.ignoredAssets.every(({ reason }) => reason === 'orphan-file')).toBe(true);
    expect(result.referencedAssets).toEqual([]);
  });

  it('assigns a distinct global id to every selected source file', () => {
    const idsByFile = new Map<string, string>();
    for (const entry of corpus.questions) {
      const result = normalizeComvestQuestion(entry.sourceFile, entry.input);
      if (result.ok) idsByFile.set(entry.sourceFile, result.value.question.id);
    }

    const ids = [...idsByFile.values()];
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(idsByFile.get('2021/day1/1.json')).not.toBe(idsByFile.get('2021/day2/1.json'));
  });
});

describe('Comvest golden corpus contract', () => {
  const mutate = (change: (draft: any) => void) => {
    const draft = structuredClone(JSON.parse(corpusBody));
    change(draft);
    return draft;
  };

  const questionCase = (draft: any, caseId: string) => {
    const found = draft.cases.find((candidate: any) => candidate.caseId === caseId);
    if (!found || found.kind !== 'question') throw new Error(`missing question case ${caseId}`);
    return found;
  };

  it('rejects a coverage entry that points to an unknown case', () => {
    const broken = mutate((draft) => {
      draft.coverage['simple-text'] = ['missing-case'];
    });
    expect(() => parseComvestGoldenCorpus(broken)).toThrow(/unknown case/);
  });

  it('rejects a case that references an unknown source file', () => {
    const broken = mutate((draft) => {
      questionCase(draft, 'simple-text').sourceFile = '2099/1.json';
    });
    expect(() => parseComvestGoldenCorpus(broken)).toThrow(/unknown sourceFile/);
  });

  it('rejects duplicate case ids', () => {
    const broken = mutate((draft) => {
      questionCase(draft, 'hyphenation').caseId = 'simple-text';
    });
    expect(() => parseComvestGoldenCorpus(broken)).toThrow(/caseIds must be unique/);
  });
});
