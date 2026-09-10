import type { ActiveExamPort, ForeignLanguagePreferencePort, PackagePort, ProgressPort, QuestionSourcePort, StudySession, StudySessionPort } from '../app/ports';
import type { ForeignLanguage, ProgressEvent } from '../contracts';
import { OfflinePackageManager } from './package-manager';
import type { OfflineStorage } from './types';

export class IndexedProgressPort implements ProgressPort {
  constructor(private readonly storage: OfflineStorage) {}
  append(event: ProgressEvent) { return this.storage.appendProgress(event, true); }
  list() { return this.storage.listProgress(); }
}

export class IndexedStudySessionPort implements StudySessionPort {
  constructor(private readonly storage: OfflineStorage) {}
  load() { return this.storage.getSessions(); }
  save(questionId: string, session: StudySession) { return this.storage.putSession(questionId, session); }
}

export class OfflineForeignLanguagePreferencePort implements ForeignLanguagePreferencePort {
  constructor(private readonly storage: OfflineStorage) {}
  async load() { return (await this.storage.getForeignLanguagePreference())?.language ?? null; }
  save(language: ForeignLanguage) { return this.storage.putForeignLanguagePreference({ language }); }
}

export class OfflineQuestionSourcePort implements QuestionSourcePort {
  constructor(private readonly packages: OfflinePackageManager) {}
  load() { return this.packages.loadQuestions(); }
}

export class OfflineActiveExamPort implements ActiveExamPort {
  constructor(private readonly packages: OfflinePackageManager) {}
  initialize() { return this.packages.restoreActiveExam(); }
  select(packageId: string, editionId: string) { return this.packages.selectActiveExam(packageId, editionId); }
}

export class OfflinePackagePort implements PackagePort {
  constructor(private readonly packages: OfflinePackageManager) {}
  async list() {
    return (await this.packages.list()).map(({ descriptor, edition, state }) => ({
      id: descriptor.id,
      institutionId: descriptor.institutionId,
      examId: descriptor.examId,
      editionId: descriptor.editionId,
      label: edition.label,
      year: edition.year,
      byteSize: descriptor.byteSize,
      questionCount: descriptor.questionCount,
      state,
    }));
  }
  install(packageId: string) { return this.packages.install(packageId).then(() => undefined); }
  remove(packageId: string) { return this.packages.remove(packageId); }
}
