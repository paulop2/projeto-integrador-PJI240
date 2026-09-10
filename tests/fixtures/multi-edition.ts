import type {
  CatalogManifest,
  Exam,
  ExamEdition,
  Institution,
  PackageDescriptor,
  Question,
  QuestionPackage,
  Subject,
} from '../../src/contracts';
import { MemoryOfflineStorage, MemoryPackageCache, OfflinePackageManager, type Fetcher } from '../../src/offline';

const encoder = new TextEncoder();

const INSTITUTION: Institution = { id: 'inep', name: 'INEP' };
const EXAM: Exam = { id: 'enem', institutionId: 'inep', name: 'ENEM', category: 'vestibular' };
const SUBJECTS: Subject[] = [
  { id: 'matematica', name: 'Matemática' },
  { id: 'linguagens', name: 'Linguagens' },
  { id: 'ciencias-humanas', name: 'Ciências Humanas' },
];

const SUBJECT_LABELS: Readonly<Record<string, string>> = {
  matematica: 'Matemática',
  linguagens: 'Linguagens',
  'ciencias-humanas': 'Ciências Humanas',
};

const choices = (values: string[]) =>
  values.map((text, index) => ({
    id: String.fromCharCode(97 + index),
    label: String.fromCharCode(65 + index),
    text,
    file: null,
  }));

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function makeQuestion(
  editionId: string,
  year: number,
  subjectId: string,
  position: number,
  context: string,
): Question {
  return {
    id: `enem-${editionId}-${position}`,
    institutionId: 'inep',
    examId: 'enem',
    editionId,
    year,
    subjectId,
    language: null,
    kind: 'single-choice',
    files: [],
    context,
    alternativesIntroduction: null,
    alternatives: choices(['Resposta A', 'Resposta B', 'Resposta C', 'Resposta D']),
    answer: { optionIds: ['a'] },
  };
}

export interface EditionFixture {
  packageId: string;
  editionId: string;
  label: string;
  year: number;
  version: number;
  questions: Question[];
}

function enemFixture(editionId: string, year: number, version: number, suffix: string): EditionFixture {
  const subjectsByPosition: readonly [string, string] = editionId === 'enem-2022'
    ? ['matematica', 'linguagens']
    : ['matematica', 'ciencias-humanas'];
  const questions = subjectsByPosition.map((subjectId, index) =>
    makeQuestion(editionId, year, subjectId, index + 1, `${SUBJECT_LABELS[subjectId]} ${year}${suffix}`));
  return { packageId: `${editionId}-completo`, editionId, label: `ENEM ${year}`, year, version, questions };
}

/** ENEM 2022 and ENEM 2023 share `examId: 'enem'` and the `matematica` subject. */
export const enem2022 = (version = 1, suffix = ''): EditionFixture => enemFixture('enem-2022', 2022, version, suffix);
export const enem2023 = (version = 1, suffix = ''): EditionFixture => enemFixture('enem-2023', 2023, version, suffix);

export function questionPackage(spec: EditionFixture): QuestionPackage {
  return {
    schemaVersion: 1,
    packageId: spec.packageId,
    institutionId: 'inep',
    examId: 'enem',
    editionId: spec.editionId,
    questions: spec.questions,
  };
}

export function packageBody(spec: EditionFixture): string {
  return JSON.stringify(questionPackage(spec));
}

export async function catalogFor(specs: readonly EditionFixture[]): Promise<CatalogManifest> {
  const editions: ExamEdition[] = specs.map((spec) => ({
    id: spec.editionId,
    examId: 'enem',
    label: spec.label,
    year: spec.year,
  }));
  const packages = await Promise.all(specs.map(async (spec): Promise<PackageDescriptor> => {
    const body = packageBody(spec);
    return {
      id: spec.packageId,
      institutionId: 'inep',
      examId: 'enem',
      editionId: spec.editionId,
      url: `/data/enem/${spec.packageId}.json`,
      version: spec.version,
      sha256: await sha256(body),
      byteSize: encoder.encode(body).byteLength,
      questionCount: spec.questions.length,
      subjectIds: [...new Set(spec.questions.map(({ subjectId }) => subjectId))].sort(),
      questionKinds: ['single-choice'],
    };
  }));
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-10T12:00:00-03:00',
    institutions: [INSTITUTION],
    exams: [EXAM],
    editions,
    subjects: SUBJECTS,
    packages,
  };
}

export interface MultiEditionWorld {
  storage: MemoryOfflineStorage;
  cache: MemoryPackageCache;
  manager: OfflinePackageManager;
  fetcher: Fetcher;
  /** Mutable package bodies as served by the network, keyed by package ID. */
  bodies: Map<string, string>;
  specs: Map<string, EditionFixture>;
  catalog(): CatalogManifest;
  /**
   * Replaces the fixture catalog with new editions/versions and updates the
   * bodies served by the fetcher. Callers still refresh the stored catalog
   * through the manager to observe update availability.
   */
  publish(update: readonly EditionFixture[]): Promise<CatalogManifest>;
}

export async function createMultiEditionWorld(initial: readonly EditionFixture[]): Promise<MultiEditionWorld> {
  const specs = new Map(initial.map((spec) => [spec.packageId, spec]));
  const bodies = new Map(initial.map((spec) => [spec.packageId, packageBody(spec)]));
  let current = await catalogFor(initial);

  const fetcher: Fetcher = async (input) => {
    const url = String(input);
    if (url.includes('manifest')) return Response.json(current);
    const match = [...bodies.entries()].find(([packageId]) => url.includes(packageId));
    if (!match) return new Response(null, { status: 404 });
    return new Response(match[1]);
  };

  const storage = new MemoryOfflineStorage();
  const cache = new MemoryPackageCache();
  const manager = new OfflinePackageManager(storage, cache, fetcher, () => 100);

  return {
    storage,
    cache,
    manager,
    fetcher,
    bodies,
    specs,
    catalog: () => current,
    async publish(update) {
      for (const spec of update) {
        specs.set(spec.packageId, spec);
        bodies.set(spec.packageId, packageBody(spec));
      }
      current = await catalogFor([...specs.values()]);
      return current;
    },
  };
}

export function descriptorFor(world: MultiEditionWorld, packageId: string): PackageDescriptor {
  const descriptor = world.catalog().packages.find(({ id }) => id === packageId);
  if (!descriptor) throw new Error(`Missing descriptor for ${packageId}`);
  return descriptor;
}
