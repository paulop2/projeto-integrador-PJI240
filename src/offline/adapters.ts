import type { PackagePort, ProgressPort, QuestionSourcePort, StudySession, StudySessionPort } from '../app/ports';
import type { ProgressEvent } from '../contracts';
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

export class OfflineQuestionSourcePort implements QuestionSourcePort {
  constructor(private readonly packages: OfflinePackageManager) {}
  load() { return this.packages.loadQuestions(); }
}

export class OfflinePackagePort implements PackagePort {
  constructor(private readonly packages: OfflinePackageManager) {}
  async list() {
    return (await this.packages.list()).map(({ descriptor, state }) => ({ id: descriptor.id, label: descriptor.editionId, byteSize: descriptor.byteSize, state }));
  }
  install(packageId: string) { return this.packages.install(packageId).then(() => undefined); }
  remove(packageId: string) { return this.packages.remove(packageId); }
}
