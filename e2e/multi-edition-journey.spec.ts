import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const transparentPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const EDITIONS = {
  'ENEM 2022': { packageId: 'enem-2022', editionId: 'enem-2022', total: 180 },
  'ENEM 2023': { packageId: 'enem-2023', editionId: 'enem-2023', total: 177 },
} as const;

type EditionLabel = keyof typeof EDITIONS;

async function mockQuestionAssets(context: BrowserContext) {
  await context.route('https://enem.dev/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPixel }));
}

async function openExams(page: Page) {
  await page.getByRole('button', { name: 'Provas', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Provas' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function downloadEdition(page: Page, label: EditionLabel) {
  const download = page.getByRole('button', { name: `Baixar ${label}` });
  await expect(download).toBeVisible();
  await download.click();
  await expect(page.getByRole('button', { name: `Remover ${label} do dispositivo` })).toBeVisible({ timeout: 30_000 });
}

async function selectRequiredLanguage(page: Page, name: 'Espanhol' | 'Inglês') {
  await expect(page.getByRole('heading', { name: 'Escolha o idioma estrangeiro para estudar.' })).toBeVisible();
  const language = page.getByRole('group', { name: 'Idioma estrangeiro' });
  const option = language.getByRole('radio', { name });
  await option.focus();
  await page.keyboard.press('Space');
}

function readActiveExamPreference(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('maratona-offline', 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    return new Promise<unknown>((resolve, reject) => {
      const request = database.transaction('settings').objectStore('settings').get('activeExam');
      request.onsuccess = () => { database.close(); resolve(request.result); };
      request.onerror = () => reject(request.error);
    });
  });
}

function readStorageCounts(page: Page) {
  return page.evaluate(async () => ({
    downloads: await new Promise<number>((resolve, reject) => {
      const opening = indexedDB.open('maratona-offline', 1);
      opening.onsuccess = () => {
        const request = opening.result.transaction('downloads').objectStore('downloads').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      };
      opening.onerror = () => reject(opening.error);
    }),
    packageCaches: (await caches.keys()).filter((name) => name.startsWith('maratona-package-')).length,
  }));
}

function expectNoViewportOverflow(page: Page) {
  return expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
}

test('jornada multi-edição: baixa 2022 e 2023, alterna, restaura offline, remove a ativa sem trocar sozinha e continua offline', async ({ page, context }) => {
  await mockQuestionAssets(context);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Baixe uma prova para começar a estudar.' })).toBeVisible();
  expect(await readStorageCounts(page)).toEqual({ downloads: 0, packageCaches: 0 });

  // Baixa as duas edições pela UI a partir do contexto limpo.
  const dialog = await openExams(page);
  await downloadEdition(page, 'ENEM 2022');
  await downloadEdition(page, 'ENEM 2023');

  // Ambas permanecem baixadas e a ativa continua sendo a primeira, sem troca implícita.
  await expect(dialog.locator('.exam-states').filter({ hasText: 'Baixada' })).toHaveCount(2);
  await expect(dialog.locator('.active-exam-note')).toContainText('ENEM 2022');
  await expect(dialog.getByRole('button', { name: 'Estudar ENEM 2023' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remover ENEM 2022 do dispositivo' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remover ENEM 2023 do dispositivo' })).toBeVisible();
  expect(await readStorageCounts(page)).toEqual({ downloads: 2, packageCaches: 2 });
  await expect.poll(() => readActiveExamPreference(page)).toEqual({
    selectionRequired: false,
    selection: { packageId: 'enem-2022', editionId: 'enem-2022' },
  });
  await expectNoViewportOverflow(page);
  const panelAudit = await new AxeBuilder({ page }).exclude('.swipe-hint').analyze();
  expect(panelAudit.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious')).toEqual([]);

  // A edição ativa filtra o feed: ENEM 2022 (+ idioma estrangeiro escolhido).
  await page.getByRole('button', { name: 'Fechar provas' }).click();
  await selectRequiredLanguage(page, 'Espanhol');
  await expect(page.getByRole('region', { name: `Questão 1 de ${EDITIONS['ENEM 2022'].total}` })).toBeVisible();
  await expect(page.locator('.question-slide')).toHaveCount(EDITIONS['ENEM 2022'].total);
  await expect(page.locator('.question-meta .eyebrow').first()).toContainText('2022');

  // Alterna para ENEM 2023: o feed passa a conter somente a edição escolhida.
  await openExams(page);
  const study2023 = page.getByRole('button', { name: 'Estudar ENEM 2023' });
  await study2023.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('ENEM 2023 é sua prova ativa.')).toBeVisible();
  await expect(page.locator('.active-exam-note')).toContainText('ENEM 2023');
  await expect.poll(() => readActiveExamPreference(page)).toEqual({
    selectionRequired: false,
    selection: { packageId: 'enem-2023', editionId: 'enem-2023' },
  });
  await page.getByRole('button', { name: 'Fechar provas' }).click();
  await expect(page.getByRole('region', { name: `Questão 1 de ${EDITIONS['ENEM 2023'].total}` })).toBeVisible();
  await expect(page.locator('.question-slide')).toHaveCount(EDITIONS['ENEM 2023'].total);
  await expect(page.locator('.question-meta .eyebrow').first()).toContainText('2023');

  // Preparação do offline real: o service worker do preview controla a página.
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await expect(page.locator('.connection')).toHaveText('Offline');

  // Restaurar a prova ativa após reload offline.
  await page.reload();
  await expect(page.getByRole('region', { name: `Questão 1 de ${EDITIONS['ENEM 2023'].total}` })).toBeVisible();
  await expect(page.locator('.question-slide')).toHaveCount(EDITIONS['ENEM 2023'].total);
  await expect.poll(() => readActiveExamPreference(page)).toEqual({
    selectionRequired: false,
    selection: { packageId: 'enem-2023', editionId: 'enem-2023' },
  });

  // Remover a edição ativa offline não ativa a outra silenciosamente.
  const offlineDialog = await openExams(page);
  await offlineDialog.getByRole('button', { name: 'Remover ENEM 2023 do dispositivo' }).click();
  await offlineDialog.getByRole('button', { name: 'Confirmar remoção' }).click();
  await expect(offlineDialog.getByText('ENEM 2023 foi removida. Escolha outra prova para continuar.')).toBeVisible();
  await expect(offlineDialog.getByRole('button', { name: 'Estudar ENEM 2022' })).toBeVisible();
  await expect(offlineDialog.getByRole('button', { name: 'Baixar ENEM 2023' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar provas' }).click();
  await expect(page.getByRole('heading', { name: 'Escolha uma prova baixada para continuar estudando.' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Questões' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: `Questão 1 de ${EDITIONS['ENEM 2022'].total}` })).toHaveCount(0);
  await expectNoViewportOverflow(page);
  const emptyAudit = await new AxeBuilder({ page }).exclude('.swipe-hint').analyze();
  expect(emptyAudit.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious')).toEqual([]);

  // O estado de escolha necessária sobrevive a reload offline.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Escolha uma prova baixada para continuar estudando.' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Questões' })).toHaveCount(0);
  await expect.poll(() => readActiveExamPreference(page)).toEqual({ selectionRequired: true, selection: null });

  // Nova escolha offline por teclado e continuação dos estudos sem rede.
  await openExams(page);
  const study2022 = page.getByRole('button', { name: 'Estudar ENEM 2022' });
  await study2022.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('ENEM 2022 é sua prova ativa.')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar provas' }).click();
  const firstQuestion = page.getByRole('region', { name: `Questão 1 de ${EDITIONS['ENEM 2022'].total}` });
  await expect(firstQuestion).toBeVisible();
  await firstQuestion.getByRole('radio').first().focus();
  await page.keyboard.press('Space');
  await expect(firstQuestion.getByRole('group')).toHaveAttribute('disabled', '');

  await page.reload();
  await expect(page.getByRole('region', { name: `Questão 1 de ${EDITIONS['ENEM 2022'].total}` }).getByRole('group')).toHaveAttribute('disabled', '');
  await expect.poll(() => readActiveExamPreference(page)).toEqual({
    selectionRequired: false,
    selection: { packageId: 'enem-2022', editionId: 'enem-2022' },
  });

  await context.setOffline(false);
});
