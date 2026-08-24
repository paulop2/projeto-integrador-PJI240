import type { CatalogManifest, DownloadedPackage, ProgressEvent, StoredProgressChange } from '../contracts';
import type { StudySession } from '../app/ports';
import type { OfflineStorage, OutboxRecord } from './types';

export class MemoryOfflineStorage implements OfflineStorage {
  private catalog: CatalogManifest | null = null;
  private downloads = new Map<string, DownloadedPackage>();
  private progress = new Map<string, ProgressEvent>();
  private outbox = new Map<string, OutboxRecord>();
  private sessions = new Map<string, StudySession>();
  private cursor: string | null = null;

  async getCatalog() { return this.catalog; }
  async putCatalog(manifest: CatalogManifest) { this.catalog = manifest; }
  async listDownloads() { return [...this.downloads.values()]; }
  async getDownload(packageId: string) { return this.downloads.get(packageId) ?? null; }
  async putDownload(download: DownloadedPackage) { this.downloads.set(download.packageId, download); }
  async deleteDownload(packageId: string) { this.downloads.delete(packageId); }
  async appendProgress(event: ProgressEvent, enqueue = true) {
    if (this.progress.has(event.eventId)) return;
    this.progress.set(event.eventId, event);
    if (enqueue) this.outbox.set(event.eventId, { event, attempt: 0, nextAttemptAt: 0, lastError: null });
  }
  async listProgress() { return [...this.progress.values()].sort((a, b) => a.occurredAt - b.occurredAt); }
  async clearProgress() { this.progress.clear(); this.outbox.clear(); this.cursor = null; }
  async listOutbox(now = Date.now(), limit = 100) {
    return [...this.outbox.values()].filter((item) => item.nextAttemptAt <= now).sort((a, b) => a.event.occurredAt - b.event.occurredAt).slice(0, limit);
  }
  async acknowledgeOutbox(eventIds: string[]) { for (const id of eventIds) this.outbox.delete(id); }
  async retryOutbox(eventIds: string[], attempt: number, nextAttemptAt: number, error: string) {
    for (const id of eventIds) {
      const item = this.outbox.get(id);
      if (item) this.outbox.set(id, { ...item, attempt, nextAttemptAt, lastError: error });
    }
  }
  async applyRemoteChanges(changes: StoredProgressChange[]) {
    for (const { event } of changes) if (!this.progress.has(event.eventId)) this.progress.set(event.eventId, event);
  }
  async getSessions() { return Object.fromEntries(this.sessions); }
  async putSession(questionId: string, session: StudySession) { this.sessions.set(questionId, session); }
  async clearSessions() { this.sessions.clear(); }
  async getSyncCursor() { return this.cursor; }
  async putSyncCursor(cursor: string) { this.cursor = cursor; }
}
