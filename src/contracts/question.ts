import { z } from 'zod';

const idSchema = z.string().trim().min(1);

export const questionKindSchema = z.enum([
  'single-choice',
  'multiple-choice',
  'true-false',
  'numeric',
  'essay',
]);

export type QuestionKind = z.infer<typeof questionKindSchema>;

export const alternativeSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1),
    text: z.string().trim().min(1).nullable(),
    file: z.string().trim().min(1).nullable(),
  })
  .refine(({ text, file }) => text !== null || file !== null, {
    message: 'an alternative needs text, a file, or both',
  });

export type Alternative = z.infer<typeof alternativeSchema>;

export const questionAnswerSchema = z.object({
  optionIds: z.array(idSchema).min(1).optional(),
  booleanValue: z.boolean().optional(),
  numericValue: z.number().finite().optional(),
  textReference: z.string().trim().min(1).optional(),
});

export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;

export const questionSchema = z
  .object({
    id: idSchema,
    institutionId: idSchema,
    examId: idSchema,
    editionId: idSchema,
    year: z.number().int().min(1900).max(3000).nullable(),
    subjectId: idSchema,
    kind: questionKindSchema,
    context: z.string().trim().min(1).nullable(),
    files: z.array(z.string().trim().min(1)),
    alternativesIntroduction: z.string().trim().min(1).nullable(),
    alternatives: z.array(alternativeSchema),
    answer: questionAnswerSchema,
  })
  .superRefine((question, context) => {
    const alternativeIds = question.alternatives.map(({ id }) => id);
    const ids = new Set(alternativeIds);
    if (ids.size !== alternativeIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'alternative ids must be unique within a question',
      });
    }

    const answerIds = question.answer.optionIds ?? [];
    if (answerIds.some((id) => !ids.has(id))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'answer references an unknown alternative',
      });
    }

    if (question.kind === 'single-choice') {
      if (question.alternatives.length < 2 || answerIds.length !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'single-choice requires at least two alternatives and one answer',
        });
      }
    } else if (question.kind === 'multiple-choice' && answerIds.length < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'multiple-choice requires at least one answer',
      });
    } else if (
      question.kind === 'true-false' &&
      question.answer.booleanValue === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'true-false requires booleanValue',
      });
    } else if (
      question.kind === 'numeric' &&
      question.answer.numericValue === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'numeric requires numericValue',
      });
    }
  });

export type Question = z.infer<typeof questionSchema>;

export const questionPackageSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: idSchema,
    institutionId: idSchema,
    examId: idSchema,
    editionId: idSchema,
    questions: z.array(questionSchema),
  })
  .superRefine((questionPackage, context) => {
    const ids = new Set<string>();
    for (const question of questionPackage.questions) {
      if (ids.has(question.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate question id ${question.id}`,
        });
      }
      ids.add(question.id);
      if (
        question.institutionId !== questionPackage.institutionId ||
        question.examId !== questionPackage.examId ||
        question.editionId !== questionPackage.editionId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `question ${question.id} does not belong to its package`,
        });
      }
    }
  });

export type QuestionPackage = z.infer<typeof questionPackageSchema>;
