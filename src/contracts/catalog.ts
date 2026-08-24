import { z } from 'zod';

import { questionKindSchema } from './question';

export const identifierSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use kebab-case identifiers');

export const institutionSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1),
});

export type Institution = z.infer<typeof institutionSchema>;

export const examSchema = z.object({
  id: identifierSchema,
  institutionId: identifierSchema,
  name: z.string().trim().min(1),
  category: z.enum(['vestibular', 'concurso', 'olimpiada', 'outro']),
});

export type Exam = z.infer<typeof examSchema>;

export const examEditionSchema = z.object({
  id: identifierSchema,
  examId: identifierSchema,
  label: z.string().trim().min(1),
  year: z.number().int().min(1900).max(3000).nullable(),
});

export type ExamEdition = z.infer<typeof examEditionSchema>;

export const subjectSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1),
});

export type Subject = z.infer<typeof subjectSchema>;

export const packageDescriptorSchema = z.object({
  id: identifierSchema,
  institutionId: identifierSchema,
  examId: identifierSchema,
  editionId: identifierSchema,
  url: z.string().startsWith('/data/').endsWith('.json'),
  version: z.number().int().positive(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  questionCount: z.number().int().positive(),
  subjectIds: z.array(identifierSchema).min(1),
  questionKinds: z.array(questionKindSchema).min(1),
});

export type PackageDescriptor = z.infer<typeof packageDescriptorSchema>;

const uniqueIds = <T extends { id: string }>(items: ReadonlyArray<T>) =>
  new Set(items.map(({ id }) => id)).size === items.length;

export const catalogManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    institutions: z.array(institutionSchema),
    exams: z.array(examSchema),
    editions: z.array(examEditionSchema),
    subjects: z.array(subjectSchema),
    packages: z.array(packageDescriptorSchema),
  })
  .superRefine((manifest, context) => {
    const collections: ReadonlyArray<
      readonly [string, ReadonlyArray<{ id: string }>]
    > = [
      ['institution', manifest.institutions],
      ['exam', manifest.exams],
      ['edition', manifest.editions],
      ['subject', manifest.subjects],
      ['package', manifest.packages],
    ];

    for (const [name, items] of collections) {
      if (!uniqueIds(items)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} ids must be unique`,
        });
      }
    }

    const institutionIds = new Set(manifest.institutions.map(({ id }) => id));
    const examById = new Map(manifest.exams.map((exam) => [exam.id, exam]));
    const editionById = new Map(
      manifest.editions.map((edition) => [edition.id, edition]),
    );
    const subjectIds = new Set(manifest.subjects.map(({ id }) => id));

    for (const exam of manifest.exams) {
      if (!institutionIds.has(exam.institutionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `exam ${exam.id} references an unknown institution`,
        });
      }
    }

    for (const edition of manifest.editions) {
      if (!examById.has(edition.examId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edition ${edition.id} references an unknown exam`,
        });
      }
    }

    for (const descriptor of manifest.packages) {
      const exam = examById.get(descriptor.examId);
      const edition = editionById.get(descriptor.editionId);
      if (
        exam?.institutionId !== descriptor.institutionId ||
        edition?.examId !== descriptor.examId ||
        descriptor.subjectIds.some((id) => !subjectIds.has(id))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `package ${descriptor.id} has inconsistent catalog references`,
        });
      }
    }
  });

export type CatalogManifest = z.infer<typeof catalogManifestSchema>;
