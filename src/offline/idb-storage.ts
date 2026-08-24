import { catalogManifestSchema, downloadedPackageSchema, progressEventSchema, storedProgressChangeSchema } from '../contracts';
import type { CatalogManifest, DownloadedPackage, ProgressEvent, StoredProgressChange } from '../contracts';
import type { StudySession } from '../app/ports';
import type { OfflineStorage, OutboxRecord } from './types';

const DB_NAME = 'maratona-offline';
const DB_VERSION = 1;

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.addEventListener('success', () => resolve(value.result));
  value.addEventListener('error', () => reject(value.error ?? new Error('IndexedDB request failed')));
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.addEventListener('complete', () => resolve());
  transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')));
  transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')));
});

export class IndexedDbOfflineStorage implements OfflineStorage {
  private database: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB, private readonly name = DB_NAME) {}

  private open() {
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const opening = this.factory.open(this.name, DB_VERSION);
        opening.addEventListener('upgradeneeded', () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog');
          if (!db.objectStoreNames.contains('downloads')) db.createObjectStore('downloads', { keyPath: 'packageId' });
          if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'eventId' });
          if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'event.eventId' });
          if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions');
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        });
        opening.addEventListener('success', () => {
          opening.result.addEventListener('versionchange', () => opening.result.close());
          resolve(opening.result);
        });
        opening.addEventListener('error', () => reject(opening.error ?? new Error('Could not open IndexedDB')));
      });
    }
    return this.database;
  }

  private async read<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.open();
    return request<T | undefined>(db.transaction(storeName).objectStore(storeName).get(key));
  }

  private async all<T>(storeName: string): Promise<T[]> {
    const db = await this.open();
    return request<T[]>(db.transaction(storeName).objectStore(storeName).getAll());
  }

  private async write(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => void) {
    const db = await this.open();
    const transaction = db.transaction(storeName, mode);
    operation(transaction.objectStore(storeName));
    await transactionDone(transaction);
  }

  async getCatalog() {
    const value = await this.read<unknown>('catalog', 'manifest');
    return value === undefined ? null : catalogManifestSchema.parse(value);
  }
  async putCatalog(manifest: CatalogManifest) { await this.write('catalog', 'readwrite', (store) => { store.put(manifest, 'manifest'); }); }
  async listDownloads() { return (await this.all<unknown>('downloads')).map((value) => downloadedPackageSchema.parse(value)); }
  async getDownload(packageId: string) {
    const value = await this.read<unknown>('downloads', packageId);
    return value === undefined ? null : downloadedPackageSchema.parse(value);
  }
  async putDownload(download: DownloadedPackage) { await this.write('downloads', 'readwrite', (store) => { store.put(download); }); }
  async deleteDownload(packageId: string) { await this.write('downloads', 'readwrite', (store) => { store.delete(packageId); }); }

  async appendProgress(event: ProgressEvent, enqueue = true) {
    const parsed = progressEventSchema.parse(event);
    const db = await this.open();
    const transaction = db.transaction(enqueue ? ['progress', 'outbox'] : ['progress'], 'readwrite');
    const progress = transaction.objectStore('progress');
    if (await request(progress.getKey(parsed.eventId)) === undefined) {
      progress.add(parsed);
      if (enqueue) transaction.objectStore('outbox').add({ event: parsed, attempt: 0, nextAttemptAt: 0, lastError: null });
    }
    await transactionDone(transaction);
  }
  async listProgress() {
    return (await this.all<unknown>('progress')).map((value) => progressEventSchema.parse(value)).sort((a, b) => a.occurredAt - b.occurredAt);
  }
  async clearProgress() {
    const db = await this.open();
    const transaction = db.transaction(['progress', 'outbox', 'sessions', 'settings'], 'readwrite');
    transaction.objectStore('progress').clear(); transaction.objectStore('outbox').clear();
    transaction.objectStore('sessions').clear(); transaction.objectStore('settings').delete('syncCursor');
    await transactionDone(transaction);
  }
  async listOutbox(now = Date.now(), limit = 100) {
    const values = await this.all<OutboxRecord>('outbox');
    return values.filter((item) => item.nextAttemptAt <= now).sort((a, b) => a.event.occurredAt - b.event.occurredAt).slice(0, limit);
  }
  async acknowledgeOutbox(eventIds: string[]) { await this.write('outbox', 'readwrite', (store) => { for (const id of eventIds) store.delete(id); }); }
  async retryOutbox(eventIds: string[], attempt: number, nextAttemptAt: number, error: string) {
    const db = await this.open(); const transaction = db.transaction('outbox', 'readwrite'); const store = transaction.objectStore('outbox');
    for (const id of eventIds) { const item = await request<OutboxRecord | undefined>(store.get(id)); if (item) store.put({ ...item, attempt, nextAttemptAt, lastError: error }); }
    await transactionDone(transaction);
  }
  async applyRemoteChanges(changes: StoredProgressChange[]) {
    const parsed = changes.map((change) => storedProgressChangeSchema.parse(change));
    const db = await this.open(); const transaction = db.transaction('progress', 'readwrite'); const store = transaction.objectStore('progress');
    for (const { event } of parsed) if (await request(store.getKey(event.eventId)) === undefined) store.add(event);
    await transactionDone(transaction);
  }
  async getSessions() { return Object.fromEntries(await this.allSessionEntries()); }
  private async allSessionEntries(): Promise<Array<[string, StudySession]>> {
    const db = await this.open(); const transaction = db.transaction('sessions'); const store = transaction.objectStore('sessions');
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request<StudySession[]>(store.getAll())]);
    return keys.map((key, index) => [String(key), values[index]!] as [string, StudySession]);
  }
  async putSession(questionId: string, session: StudySession) { await this.write('sessions', 'readwrite', (store) => { store.put(session, questionId); }); }
  async clearSessions() { await this.write('sessions', 'readwrite', (store) => { store.clear(); }); }
  async getSyncCursor() { return (await this.read<string>('settings', 'syncCursor')) ?? null; }
  async putSyncCursor(cursor: string) { await this.write('settings', 'readwrite', (store) => { store.put(cursor, 'syncCursor'); }); }
}
