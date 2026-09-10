import type { ActiveExamSelection, ProgressEvent, Question } from '../contracts';

/** Boundary implemented in memory here and by IndexedDB in the offline layer. */
export interface ProgressPort {
  append(event: ProgressEvent): Promise<void>;
  list(): Promise<ProgressEvent[]>;
}

export interface QuestionSourcePort {
  load(): Promise<Question[]>;
}

export interface PackageSummary {
  /** Stable package ID used by install and remove operations. */
  id: string;
  institutionId: string;
  examId: string;
  editionId: string;
  label: string;
  year: number | null;
  byteSize: number;
  questionCount: number;
  state: 'available' | 'downloaded' | 'update-available';
}

export interface PackagePort {
  list(): Promise<PackageSummary[]>;
  install(packageId: string): Promise<void>;
  remove(packageId: string): Promise<void>;
}

export type ActiveExamState =
  | ({ status: 'active' } & ActiveExamSelection)
  | { status: 'selection-required' }
  | { status: 'empty' };

export interface ActiveExamPort {
  initialize(): Promise<ActiveExamState>;
  select(packageId: string, editionId: string): Promise<ActiveExamState>;
}

export interface StudySession {
  startedAt: number | null;
  selectedOptionId: string | null;
  outcome: 'correct' | 'incorrect' | 'timed_out' | null;
}

/** Persisting startedAt lets a timer resume from its real deadline after reload. */
export interface StudySessionPort {
  load(): Promise<Record<string, StudySession>>;
  save(questionId: string, session: StudySession): Promise<void>;
}

export class MemoryProgressPort implements ProgressPort {
  private readonly events: ProgressEvent[] = [];

  async append(event: ProgressEvent) {
    if (!this.events.some(({ eventId }) => eventId === event.eventId)) this.events.push(event);
  }

  async list() {
    return [...this.events];
  }
}

export class MemoryStudySessionPort implements StudySessionPort {
  private sessions: Record<string, StudySession> = {};
  async load() { return { ...this.sessions }; }
  async save(questionId: string, session: StudySession) {
    this.sessions = { ...this.sessions, [questionId]: session };
  }
}
