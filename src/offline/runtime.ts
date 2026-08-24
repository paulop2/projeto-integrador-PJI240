import { BrowserPackageCache } from './cache-storage';
import { IndexedDbOfflineStorage } from './idb-storage';
import { OfflinePackageManager } from './package-manager';
import { IndexedProgressPort, IndexedStudySessionPort, OfflinePackagePort, OfflineQuestionSourcePort } from './adapters';
import { MemoryOfflineStorage } from './memory-storage';
import { requestPersistentStorage } from './capacity';
import { FetchSyncTransport, OnlineSyncCoordinator, SyncQueue } from './sync-queue';

const hasOfflineApis = typeof indexedDB !== 'undefined' && typeof caches !== 'undefined';
const storage = hasOfflineApis ? new IndexedDbOfflineStorage() : new MemoryOfflineStorage();
const manager = hasOfflineApis ? new OfflinePackageManager(storage, new BrowserPackageCache()) : null;
const syncQueue = new SyncQueue(storage, new FetchSyncTransport());
const syncCoordinator = typeof window === 'undefined' ? undefined : new OnlineSyncCoordinator(syncQueue);

export const offlineRuntime = {
  storage,
  progressPort: new IndexedProgressPort(storage),
  sessionPort: new IndexedStudySessionPort(storage),
  questionSource: manager ? new OfflineQuestionSourcePort(manager) : undefined,
  packagePort: manager ? new OfflinePackagePort(manager) : undefined,
  prepareStorage: requestPersistentStorage,
  syncQueue,
  syncCoordinator,
  clearAccountProgress: () => storage.clearProgress(),
};
