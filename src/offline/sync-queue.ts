import { SYNC_BATCH_SIZE, syncResponseSchema, type SyncRequest } from '../contracts';
import type { OfflineStorage } from './types';
import { invokeFetch, type Fetcher } from './fetcher';

export interface SyncTransport {
  sync(request: SyncRequest): Promise<unknown>;
}

export class FetchSyncTransport implements SyncTransport {
  constructor(private readonly endpoint = '/api/sync', private readonly fetcher: Fetcher = fetch) {}
  async sync(request: SyncRequest) {
    const response = await invokeFetch(this.fetcher, this.endpoint, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Sync failed (${response.status})`);
    return response.json();
  }
}

export const retryDelayMs = (attempt: number) => Math.min(60 * 60_000, 1_000 * 2 ** Math.min(attempt, 12));

export class SyncQueue {
  private running: Promise<boolean> | null = null;
  constructor(
    private readonly storage: OfflineStorage,
    private readonly transport: SyncTransport,
    private readonly now: () => number = Date.now,
  ) {}

  flush() {
    if (!this.running) this.running = this.perform().finally(() => { this.running = null; });
    return this.running;
  }

  async retryWaitMs() {
    const [next] = await this.storage.listOutbox(Number.MAX_SAFE_INTEGER, 1);
    return next ? Math.max(0, next.nextAttemptAt - this.now()) : 30_000;
  }

  private async perform(): Promise<boolean> {
    let cursor = await this.storage.getSyncCursor();
    let keepPulling = true;
    while (keepPulling) {
      const pending = await this.storage.listOutbox(this.now(), SYNC_BATCH_SIZE);
      try {
        const response = syncResponseSchema.parse(await this.transport.sync({ cursor, events: pending.map(({ event }) => event) }));
        await this.storage.acknowledgeOutbox(response.acceptedEventIds);
        await this.storage.applyRemoteChanges(response.changes);
        await this.storage.putSyncCursor(response.nextCursor);
        cursor = response.nextCursor;
        keepPulling = response.hasMore || (pending.length === SYNC_BATCH_SIZE && response.acceptedEventIds.length > 0);
      } catch (cause) {
        if (pending.length) {
          const attempt = Math.max(...pending.map((item) => item.attempt)) + 1;
          const message = cause instanceof Error ? cause.message : String(cause);
          await this.storage.retryOutbox(pending.map(({ event }) => event.eventId), attempt, this.now() + retryDelayMs(attempt), message);
        }
        return false;
      }
    }
    return true;
  }
}

export class OnlineSyncCoordinator {
  private onOnline = () => { this.run(); };
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly queue: SyncQueue, private readonly target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window) {}
  start() { this.target.addEventListener('online', this.onOnline); if (navigator.onLine) this.run(); }
  private run() {
    void this.queue.flush().then((success) => {
      if (!success) void this.queue.retryWaitMs().then((delay) => { this.timer = setTimeout(() => this.run(), delay); });
    });
  }
  stop() {
    this.target.removeEventListener('online', this.onOnline);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
