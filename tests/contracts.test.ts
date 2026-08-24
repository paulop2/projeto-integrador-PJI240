import { describe, expect, it } from 'vitest';

import {
  catalogManifestSchema,
  progressEventSchema,
  questionSchema,
  syncRequestSchema,
} from '../src/contracts';

const validQuestion = {
  id: 'enem-enem-2024-1',
  institutionId: 'inep',
  examId: 'enem',
  editionId: 'enem-2024',
  year: 2024,
  subjectId: 'matematica',
  kind: 'single-choice',
  context: 'Quanto é 1 + 1?',
  files: [],
  alternativesIntroduction: null,
  alternatives: [
    { id: 'a', label: 'A', text: '1', file: null },
    { id: 'b', label: 'B', text: '2', file: null },
  ],
  answer: { optionIds: ['b'] },
} as const;

describe('question contract', () => {
  it('accepts variable alternative counts and a valid answer', () => {
    expect(questionSchema.parse(validQuestion).alternatives).toHaveLength(2);
  });

  it('rejects an answer outside the alternatives', () => {
    expect(() =>
      questionSchema.parse({ ...validQuestion, answer: { optionIds: ['c'] } }),
    ).toThrow(/unknown alternative/);
  });
});

describe('catalog contract', () => {
  it('rejects inconsistent references', () => {
    expect(() =>
      catalogManifestSchema.parse({
        schemaVersion: 1,
        generatedAt: '2026-08-23T12:00:00-03:00',
        institutions: [{ id: 'inep', name: 'INEP' }],
        exams: [
          {
            id: 'enem',
            institutionId: 'outra',
            name: 'ENEM',
            category: 'vestibular',
          },
        ],
        editions: [],
        subjects: [],
        packages: [],
      }),
    ).toThrow(/unknown institution/);
  });
});

describe('sync trust boundary', () => {
  it('strips fields that the client is not allowed to assert', () => {
    const parsed = syncRequestSchema.parse({
      cursor: null,
      userId: 'forged',
      events: [
        {
          type: 'question_answered',
          eventId: '00000000-0000-4000-8000-000000000001',
          deviceId: '00000000-0000-4000-8000-000000000002',
          questionId: validQuestion.id,
          occurredAt: 1,
          selectedOptionId: 'b',
          elapsedMs: 42,
          correct: true,
        },
      ],
    });

    expect(parsed).not.toHaveProperty('userId');
    expect(parsed.events[0]).not.toHaveProperty('correct');
  });

  it('enforces the fixed timeout duration', () => {
    expect(() =>
      progressEventSchema.parse({
        type: 'question_timed_out',
        eventId: '00000000-0000-4000-8000-000000000001',
        deviceId: '00000000-0000-4000-8000-000000000002',
        questionId: validQuestion.id,
        occurredAt: 1,
        elapsedMs: 179_999,
      }),
    ).toThrow();
  });
});
