import type { ProgressEvent, StoredProgressChange } from '../contracts/progress';
import type { SyncRequest, SyncResponse } from '../contracts/sync';
import { syncRequestSchema } from '../contracts/sync';
import { decodeCursor, encodeCursor } from './cursor';
import { HttpError } from './http';

export interface ServerQuestion {
  id: string;
  kind: string;
  correctOptionId: string;
}

export interface EventToStore {
  event: ProgressEvent;
  outcome: StoredProgressChange['outcome'];
  recordedAt: number;
}

export interface SyncRepository {
  findQuestions(questionIds: string[]): Promise<Map<string, ServerQuestion>>;
  append(userId: string, events: EventToStore[]): Promise<void>;
  changesAfter(
    userId: string,
    sequence: number,
    limit: number,
  ): Promise<StoredProgressChange[]>;
}

export function classifyEvent(
  event: ProgressEvent,
  question: ServerQuestion,
): StoredProgressChange['outcome'] {
  if (event.type === 'question_viewed') return null;
  if (event.type === 'question_timed_out') return 'timed_out';
  return event.selectedOptionId === question.correctOptionId ? 'correct' : 'incorrect';
}

export async function synchronize(
  userId: string,
  input: unknown,
  repository: SyncRepository,
  now = Date.now(),
): Promise<SyncResponse> {
  const parsed = syncRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, 'Lote de sincronização inválido.', 'invalid_sync_request');
  }
  const request: SyncRequest = parsed.data;
  const after = decodeCursor(request.cursor);
  const questionIds = [...new Set(request.events.map(({ questionId }) => questionId))];
  const questions = await repository.findQuestions(questionIds);
  const unknownIds = questionIds.filter((id) => !questions.has(id));
  if (unknownIds.length > 0) {
    throw new HttpError(
      422,
      `Questão desconhecida: ${unknownIds[0]}.`,
      'unknown_question',
    );
  }

  const toStore = request.events.map((event) => ({
    event,
    outcome: classifyEvent(event, questions.get(event.questionId)!),
    recordedAt: now,
  }));
  await repository.append(userId, toStore);

  const page = await repository.changesAfter(userId, after, 101);
  const hasMore = page.length > 100;
  const changes = page.slice(0, 100);
  const lastSequence = changes.at(-1)?.sequence ?? after;
  return {
    acceptedEventIds: request.events.map(({ eventId }) => eventId),
    changes,
    nextCursor: encodeCursor(lastSequence),
    hasMore,
  };
}
