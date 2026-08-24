import { describe, expect, it } from 'vitest';

import type { ProgressEvent, StoredProgressChange } from '../../src/contracts';
import { MemoryOfflineStorage, SyncQueue, retryDelayMs, type SyncTransport } from '../../src/offline';
import { synchronize, type EventToStore, type ServerQuestion, type SyncRepository } from '../../src/server/sync-service';

const userId = 'authenticated-user';
const question: ServerQuestion = { id: 'enem-enem-2024-1', kind: 'single-choice', correctOptionId: 'b' };

class SharedServer implements SyncRepository {
  private sequence = 0;
  private readonly rows = new Map<string, StoredProgressChange[]>();
  private readonly eventIds = new Set<string>();

  async findQuestions(ids: string[]) {
    return new Map(ids.filter((id) => id === question.id).map((id) => [id, question]));
  }

  async append(owner: string, entries: EventToStore[]) {
    const rows = this.rows.get(owner) ?? [];
    for (const entry of entries) {
      const key = `${owner}:${entry.event.eventId}`;
      if (this.eventIds.has(key)) continue;
      this.eventIds.add(key);
      rows.push({ sequence: ++this.sequence, ...entry });
    }
    this.rows.set(owner, rows);
  }

  async changesAfter(owner: string, sequence: number, limit: number) {
    return (this.rows.get(owner) ?? []).filter((row) => row.sequence > sequence).slice(0, limit);
  }
}

class AuthenticatedLocalTransport implements SyncTransport {
  online = false;
  sessionUser: string | null = null;

  constructor(private readonly server: SharedServer) {}

  async sync(request: Parameters<SyncTransport['sync']>[0]) {
    if (!this.online) throw new Error('network unavailable');
    if (!this.sessionUser) throw new Error('unauthorized');
    return synchronize(this.sessionUser, request, this.server, 1_700_000_001_000);
  }
}

const answered: ProgressEvent = {
  type: 'question_answered',
  eventId: 'e70a4901-b347-4b46-8b92-9f2b8480be59',
  deviceId: 'f78493c5-76a0-429b-8705-b736e331d162',
  questionId: question.id,
  occurredAt: 1_700_000_000_000,
  selectedOptionId: 'b',
  elapsedMs: 25_000,
};

describe('anonymous to authenticated multi-device sync integration', () => {
  it('retains anonymous work through failure, syncs after login/reconnection, and reaches a second device', async () => {
    const server = new SharedServer();
    const firstStorage = new MemoryOfflineStorage();
    const firstTransport = new AuthenticatedLocalTransport(server);
    let now = 10_000;
    const firstQueue = new SyncQueue(firstStorage, firstTransport, () => now);
    await firstStorage.appendProgress(answered);

    expect(await firstQueue.flush()).toBe(false);
    expect(await firstStorage.listProgress()).toEqual([answered]);
    expect(await firstStorage.listOutbox(now)).toEqual([]);

    now += retryDelayMs(1);
    firstTransport.sessionUser = userId;
    firstTransport.online = true;
    expect(await firstQueue.flush()).toBe(true);
    expect(await firstStorage.listOutbox(now)).toEqual([]);

    const secondStorage = new MemoryOfflineStorage();
    const secondTransport = new AuthenticatedLocalTransport(server);
    secondTransport.sessionUser = userId;
    secondTransport.online = true;
    expect(await new SyncQueue(secondStorage, secondTransport, () => now).flush()).toBe(true);
    expect(await secondStorage.listProgress()).toEqual([answered]);
  });

  it('clears account progress on logout without removing downloaded package metadata', async () => {
    const storage = new MemoryOfflineStorage();
    await storage.appendProgress(answered);
    await storage.putDownload({
      packageId: 'enem-2024', version: 1, sha256: `sha256:${'a'.repeat(64)}`,
      byteSize: 100, downloadedAt: 1, lastVerifiedAt: 1,
    });

    await storage.clearProgress();

    expect(await storage.listProgress()).toEqual([]);
    expect(await storage.listOutbox(Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect((await storage.listDownloads())[0]?.packageId).toBe('enem-2024');
  });
});
