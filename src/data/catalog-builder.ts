import type { CatalogManifest, PackageDescriptor, Subject } from '../contracts/catalog';
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

const SUBJECT_NAMES: Readonly<Record<string, string>> = {
  'ciencias-humanas': 'Ciências Humanas e suas Tecnologias',
  'ciencias-natureza': 'Ciências da Natureza e suas Tecnologias',
  linguagens: 'Linguagens, Códigos e suas Tecnologias',
  matematica: 'Matemática e suas Tecnologias',
};

const subject = (id: string): Subject => ({ id, name: SUBJECT_NAMES[id] ?? id });

export const upsertEnemManifest = (
  current: CatalogManifest | null,
  descriptor: PackageDescriptor,
  year: number,
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
  const institution = { id: 'inep', name: 'Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira' };
  const exam = { id: 'enem', institutionId: 'inep', name: 'ENEM', category: 'vestibular' as const };
  const edition = { id: `enem-${year}`, examId: 'enem', label: `ENEM ${year}`, year };

  const replace = <T extends { id: string }>(items: readonly T[], value: T): T[] =>
    [...items.filter(({ id }) => id !== value.id), value].sort((a, b) => a.id.localeCompare(b.id));

  let subjects = base.subjects;
  for (const id of descriptor.subjectIds) subjects = replace(subjects, subject(id));

  return catalogManifestSchema.parse({
    ...base,
    generatedAt,
    institutions: replace(base.institutions, institution),
    exams: replace(base.exams, exam),
    editions: replace(base.editions, edition),
    subjects,
    packages: replace(base.packages, descriptor),
  });
};
