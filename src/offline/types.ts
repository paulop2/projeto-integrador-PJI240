import type {
  CatalogManifest,
  DownloadedPackage,
  PackageDescriptor,
  ProgressEvent,
  StoredProgressChange,
} from '../contracts';
import type { StudySession } from '../app/ports';

export interface OutboxRecord {
  event: ProgressEvent;
  attempt: number;
  nextAttemptAt: number;
  lastError: string | null;
}

export interface OfflineStorage {
  getCatalog(): Promise<CatalogManifest | null>;
  putCatalog(manifest: CatalogManifest): Promise<void>;
  listDownloads(): Promise<DownloadedPackage[]>;
  getDownload(packageId: string): Promise<DownloadedPackage | null>;
  putDownload(download: DownloadedPackage): Promise<void>;
  deleteDownload(packageId: string): Promise<void>;
  appendProgress(event: ProgressEvent, enqueue?: boolean): Promise<void>;
  listProgress(): Promise<ProgressEvent[]>;
  clearProgress(): Promise<void>;
  listOutbox(now?: number, limit?: number): Promise<OutboxRecord[]>;
  acknowledgeOutbox(eventIds: string[]): Promise<void>;
  retryOutbox(eventIds: string[], attempt: number, nextAttemptAt: number, error: string): Promise<void>;
  applyRemoteChanges(changes: StoredProgressChange[]): Promise<void>;
  getSessions(): Promise<Record<string, StudySession>>;
  putSession(questionId: string, session: StudySession): Promise<void>;
  clearSessions(): Promise<void>;
  getSyncCursor(): Promise<string | null>;
  putSyncCursor(cursor: string): Promise<void>;
}

export interface PackageCache {
  putPackage(descriptor: PackageDescriptor, response: Response): Promise<void>;
  getPackage(descriptor: PackageDescriptor): Promise<Response | null>;
  deletePackage(descriptor: PackageDescriptor): Promise<void>;
  putAsset(descriptor: PackageDescriptor, url: string, response: Response): Promise<void>;
}

export type PackageState = 'available' | 'downloaded' | 'update-available';

export interface PackageListing {
  descriptor: PackageDescriptor;
  download: DownloadedPackage | null;
  state: PackageState;
}

export interface StorageCapacity {
  persisted: boolean;
  usage: number | null;
  quota: number | null;
  available: number | null;
}
