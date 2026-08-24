import type { StorageCapacity } from './types';

export async function requestPersistentStorage(storage: StorageManager | undefined = navigator.storage): Promise<StorageCapacity> {
  if (!storage) return { persisted: false, usage: null, quota: null, available: null };
  const persisted = storage.persist ? await storage.persist() : false;
  const estimate = storage.estimate ? await storage.estimate() : {};
  const usage = estimate.usage ?? null;
  const quota = estimate.quota ?? null;
  return { persisted, usage, quota, available: usage === null || quota === null ? null : Math.max(0, quota - usage) };
}
