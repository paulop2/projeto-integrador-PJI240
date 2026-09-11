import type {
  CatalogManifest,
  Exam,
  ExamEdition,
  Institution,
  PackageDescriptor,
  Subject,
} from '../contracts/catalog';
import { catalogManifestSchema } from '../contracts/catalog';
import type { QuestionPackage } from '../contracts/question';
import { questionPackageSchema } from '../contracts/question';

export const serializePackage = (questionPackage: QuestionPackage): string => {
  const validated = questionPackageSchema.parse(questionPackage);
  return `${JSON.stringify(validated, null, 2)}\n`;
};

export const packageDescriptor = async (
  questionPackage: QuestionPackage,
  body: string,
  version: number,
): Promise<PackageDescriptor> => {
  const bytes = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return {
    id: questionPackage.packageId,
    institutionId: questionPackage.institutionId,
    examId: questionPackage.examId,
    editionId: questionPackage.editionId,
    url: `/data/${questionPackage.examId}/${questionPackage.editionId}.json`,
    version,
    sha256: `sha256:${sha256}`,
    byteSize: bytes.byteLength,
    questionCount: questionPackage.questions.length,
    subjectIds: [...new Set(questionPackage.questions.map(({ subjectId }) => subjectId))].sort(),
    questionKinds: [...new Set(questionPackage.questions.map(({ kind }) => kind))].sort(),
  };
};

const replaceById = <T extends { id: string }>(items: readonly T[], value: T): T[] =>
  [...items.filter(({ id }) => id !== value.id), value].sort((a, b) => a.id.localeCompare(b.id));

export interface CatalogEntry {
  readonly institution: Institution;
  readonly exam: Exam;
  readonly edition: ExamEdition;
  readonly subjects: readonly Subject[];
}

/**
 * Inserts or replaces one exam's institution, exam, edition, subjects and
 * package descriptor in a catalog manifest, keeping every other exam intact.
 */
export const upsertCatalogManifest = (
  current: CatalogManifest | null,
  descriptor: PackageDescriptor,
  entry: CatalogEntry,
  generatedAt = new Date().toISOString(),
): CatalogManifest => {
  const base = current ?? {
    schemaVersion: 1 as const,
    generatedAt,
    institutions: [],
    exams: [],
    editions: [],
    subjects: [],
    packages: [],
  };

  let subjects = base.subjects;
  for (const subject of entry.subjects) subjects = replaceById(subjects, subject);

  return catalogManifestSchema.parse({
    ...base,
    generatedAt,
    institutions: replaceById(base.institutions, entry.institution),
    exams: replaceById(base.exams, entry.exam),
    editions: replaceById(base.editions, entry.edition),
    subjects,
    packages: replaceById(base.packages, descriptor),
  });
};

const SUBJECT_NAMES: Readonly<Record<string, string>> = {
  'ciencias-humanas': 'Ciências Humanas e suas Tecnologias',
  'ciencias-natureza': 'Ciências da Natureza e suas Tecnologias',
  linguagens: 'Linguagens, Códigos e suas Tecnologias',
  matematica: 'Matemática e suas Tecnologias',
};

const enemCatalogEntry = (year: number): CatalogEntry => ({
  institution: {
    id: 'inep',
    name: 'Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira',
  },
  exam: { id: 'enem', institutionId: 'inep', name: 'ENEM', category: 'vestibular' },
  edition: { id: `enem-${year}`, examId: 'enem', label: `ENEM ${year}`, year },
  subjects: [],
});

export const upsertEnemManifest = (
  current: CatalogManifest | null,
  descriptor: PackageDescriptor,
  year: number,
  generatedAt = new Date().toISOString(),
): CatalogManifest => {
  const entry = enemCatalogEntry(year);
  return upsertCatalogManifest(
    current,
    descriptor,
    {
      ...entry,
      subjects: descriptor.subjectIds.map((id) => ({ id, name: SUBJECT_NAMES[id] ?? id })),
    },
    generatedAt,
  );
};

const COMVEST_SUBJECT_NAMES: Readonly<Record<string, string>> = {
  mathematics: 'Matemática',
  portuguese: 'Língua Portuguesa',
  history: 'História',
  physics: 'Física',
  geography: 'Geografia',
  biology: 'Biologia',
  english: 'Inglês',
  chemistry: 'Química',
  philosophy: 'Filosofia',
};

export const comvestCatalogEntry = (
  editionId: string,
  year: number,
  day: number | null,
  subjectIds: readonly string[],
): CatalogEntry => ({
  institution: { id: 'unicamp', name: 'Universidade Estadual de Campinas (Comvest)' },
  exam: {
    id: 'comvest',
    institutionId: 'unicamp',
    name: 'Comvest — Vestibular Unicamp',
    category: 'vestibular',
  },
  edition: {
    id: editionId,
    examId: 'comvest',
    label:
      day === null
        ? `Vestibular Unicamp ${year}`
        : `Vestibular Unicamp ${year} — dia ${day}`,
    year,
  },
  subjects: [...subjectIds]
    .sort()
    .map((id) => ({ id, name: COMVEST_SUBJECT_NAMES[id] ?? id })),
});

export const upsertComvestManifest = (
  current: CatalogManifest | null,
  descriptor: PackageDescriptor,
  edition: { readonly year: number; readonly day: number | null },
  generatedAt = new Date().toISOString(),
): CatalogManifest =>
  upsertCatalogManifest(
    current,
    descriptor,
    comvestCatalogEntry(descriptor.editionId, edition.year, edition.day, descriptor.subjectIds),
    generatedAt,
  );
