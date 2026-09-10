import { describe, expect, it } from 'vitest';

import type { ProgressEvent } from '../../src/contracts';
import {
  ActiveExamError,
  OfflineActiveExamPort,
  OfflinePackageManager,
  OfflinePackagePort,
  OfflineQuestionSourcePort,
} from '../../src/offline';
import {
  createMultiEditionWorld,
  descriptorFor,
  enem2022,
  enem2023,
  type MultiEditionWorld,
} from '../fixtures/multi-edition';

const offlineFetcher = async () => { throw new Error('offline'); };

async function installedWorld(): Promise<MultiEditionWorld> {
  const world = await createMultiEditionWorld([enem2022(), enem2023()]);
  await world.manager.refreshCatalog();
  await world.manager.install('enem-2022-completo');
  await world.manager.install('enem-2023-completo');
  return world;
}

function progressEvent(questionId: string, eventId: string): ProgressEvent {
  return {
    type: 'question_viewed',
    eventId,
    deviceId: '00000000-0000-4000-8000-0000000000ff',
    questionId,
    occurredAt: 10,
    localDay: '2026-09-10',
  };
}

describe('multi-exam catalog, cache and persistence', () => {
  it('lists two editions of the same exam and installs both simultaneously without overwriting', async () => {
    const world = await installedWorld();

    const listed = await new OfflinePackagePort(world.manager).list();
    expect(listed.map(({ examId }) => examId)).toEqual(['enem', 'enem']);
    expect(listed.map(({ id, editionId, state }) => [id, editionId, state])).toEqual([
      ['enem-2022-completo', 'enem-2022', 'downloaded'],
      ['enem-2023-completo', 'enem-2023', 'downloaded'],
    ]);

    expect((await world.storage.listDownloads()).map(({ packageId }) => packageId).sort()).toEqual([
      'enem-2022-completo',
      'enem-2023-completo',
    ]);
    expect(world.cache.packages.size).toBe(2);
    expect(world.cache.packages.has(descriptorFor(world, 'enem-2022-completo').sha256)).toBe(true);
    expect(world.cache.packages.has(descriptorFor(world, 'enem-2023-completo').sha256)).toBe(true);

    const source = new OfflineQuestionSourcePort(world.manager);
    await world.manager.selectActiveExam('enem-2022-completo', 'enem-2022');
    expect((await source.load()).map(({ editionId }) => editionId)).toEqual(['enem-2022', 'enem-2022']);
    await world.manager.selectActiveExam('enem-2023-completo', 'enem-2023');
    expect((await source.load()).map(({ editionId }) => editionId)).toEqual(['enem-2023', 'enem-2023']);

    expect(world.cache.packages.size).toBe(2);
  });

  it('keeps only the active edition after selecting and reloading offline', async () => {
    const world = await installedWorld();
    await world.manager.selectActiveExam('enem-2023-completo', 'enem-2023');

    const reloaded = new OfflinePackageManager(world.storage, world.cache, offlineFetcher, () => 200);
    await expect(new OfflineActiveExamPort(reloaded).initialize()).resolves.toEqual({
      status: 'active', packageId: 'enem-2023-completo', editionId: 'enem-2023',
    });
    const questions = await reloaded.loadQuestions();
    expect(questions.map(({ editionId }) => editionId)).toEqual(['enem-2023', 'enem-2023']);
    expect(questions.every(({ editionId }) => editionId === 'enem-2023')).toBe(true);

    await reloaded.selectActiveExam('enem-2022-completo', 'enem-2022');
    expect((await reloaded.loadQuestions()).map(({ editionId }) => editionId)).toEqual(['enem-2022', 'enem-2022']);

    const secondReload = new OfflinePackageManager(world.storage, world.cache, offlineFetcher);
    await expect(secondReload.restoreActiveExam()).resolves.toEqual({
      status: 'active', packageId: 'enem-2022-completo', editionId: 'enem-2022',
    });
  });

  it('invalidates only the preference when the active edition is removed and preserves progress', async () => {
    const world = await installedWorld();
    await world.manager.selectActiveExam('enem-2022-completo', 'enem-2022');
    const event = progressEvent('enem-enem-2022-1', '00000000-0000-4000-8000-0000000000a1');
    await world.storage.appendProgress(event);
    await world.storage.putSession(event.questionId, { startedAt: 10, selectedOptionId: null, outcome: null });

    await world.manager.remove('enem-2022-completo');

    await expect(world.manager.restoreActiveExam()).resolves.toEqual({ status: 'selection-required' });
    expect(await world.manager.loadQuestions()).toEqual([]);
    expect((await world.storage.listDownloads()).map(({ packageId }) => packageId)).toEqual(['enem-2023-completo']);
    expect(await world.storage.listProgress()).toEqual([event]);
    expect(await world.storage.getSessions()).toEqual({
      [event.questionId]: { startedAt: 10, selectedOptionId: null, outcome: null },
    });
  });

  it('removing a non-active edition keeps the feed, preference and downloads untouched', async () => {
    const world = await installedWorld();
    await world.manager.selectActiveExam('enem-2022-completo', 'enem-2022');
    const preference = await world.storage.getActiveExamPreference();
    const source = new OfflineQuestionSourcePort(world.manager);

    await world.manager.remove('enem-2023-completo');

    expect((await source.load()).map(({ editionId }) => editionId)).toEqual(['enem-2022', 'enem-2022']);
    expect(await world.storage.getActiveExamPreference()).toEqual(preference);
    expect((await world.storage.listDownloads()).map(({ packageId }) => packageId)).toEqual(['enem-2022-completo']);
  });

  it('updates one edition atomically while preserving the active selection and the other edition', async () => {
    const world = await installedWorld();
    await world.manager.selectActiveExam('enem-2022-completo', 'enem-2022');
    const previousPreference = await world.storage.getActiveExamPreference();
    const firstDescriptor = descriptorFor(world, 'enem-2022-completo');

    await world.publish([enem2022(2, ' atualizada'), enem2023()]);
    await world.manager.refreshCatalog();
    expect((await world.manager.list(false)).map(({ descriptor, state }) => [descriptor.id, state])).toEqual([
      ['enem-2022-completo', 'update-available'],
      ['enem-2023-completo', 'downloaded'],
    ]);

    const updatedBody = world.bodies.get('enem-2022-completo');
    if (!updatedBody) throw new Error('missing updated body');
    // Same byte length, different hash: this must fail the SHA-256 integrity check, not the byte-size check.
    world.bodies.set('enem-2022-completo', updatedBody.replace('Resposta A', 'Resposta Z'));
    await expect(world.manager.install('enem-2022-completo')).rejects.toThrow(/integrity/);
    expect((await world.storage.getDownload('enem-2022-completo'))?.version).toBe(1);
    expect((await world.manager.loadQuestions())[0]?.context).toContain('Matemática 2022');
    expect(await world.storage.getActiveExamPreference()).toEqual(previousPreference);

    world.bodies.set('enem-2022-completo', updatedBody);
    await world.manager.install('enem-2022-completo');

    expect((await world.manager.loadQuestions())[0]?.context).toContain('atualizada');
    expect(await world.storage.getActiveExamPreference()).toEqual(previousPreference);
    expect((await world.storage.getDownload('enem-2023-completo'))?.version).toBe(1);
    expect(world.cache.packages.has(firstDescriptor.sha256)).toBe(false);
    expect(world.cache.packages.has(descriptorFor(world, 'enem-2022-completo').sha256)).toBe(true);
  });

  it('isolates a corrupted package from the intact edition', async () => {
    const world = await installedWorld();
    await world.manager.selectActiveExam('enem-2022-completo', 'enem-2022');
    await world.cache.putPackage(descriptorFor(world, 'enem-2023-completo'), new Response('corrupted'));

    await expect(world.manager.selectActiveExam('enem-2023-completo', 'enem-2023')).rejects.toBeInstanceOf(ActiveExamError);
    expect((await world.manager.loadQuestions()).map(({ editionId }) => editionId)).toEqual(['enem-2022', 'enem-2022']);
    expect(await world.storage.getActiveExamPreference()).toEqual({
      selectionRequired: false,
      selection: { packageId: 'enem-2022-completo', editionId: 'enem-2022' },
    });

    await world.manager.remove('enem-2023-completo');
    expect((await world.manager.loadQuestions()).map(({ editionId }) => editionId)).toEqual(['enem-2022', 'enem-2022']);
    expect(await world.storage.getActiveExamPreference()).toEqual({
      selectionRequired: false,
      selection: { packageId: 'enem-2022-completo', editionId: 'enem-2022' },
    });
  });

  it('keeps the intact edition when installing another package fails', async () => {
    const world = await createMultiEditionWorld([enem2022(), enem2023()]);
    await world.manager.refreshCatalog();
    await world.manager.install('enem-2022-completo');

    const failing = new OfflinePackageManager(world.storage, world.cache, async (input) => {
      if (String(input).includes('enem-2023')) throw new Error('network unavailable');
      return world.fetcher(input);
    }, () => 100);
    await expect(failing.install('enem-2023-completo')).rejects.toThrow('network unavailable');

    expect((await world.storage.listDownloads()).map(({ packageId }) => packageId)).toEqual(['enem-2022-completo']);
    expect((await world.manager.loadQuestions()).map(({ editionId }) => editionId)).toEqual(['enem-2022', 'enem-2022']);
  });
});
