import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const transparentPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function mockQuestionAssets(context: BrowserContext) {
  await context.route('https://enem.dev/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPixel }));
}

async function installEditionFromCleanCatalog(page: Page) {
  await page.getByRole('button', { name: /Filtros/ }).click();
  const download = page.getByRole('button', { name: /enem-2023: Baixar/i });
  await expect(download).toBeVisible();
  await download.click();
  const remove = page.getByRole('button', { name: /enem-2023: Remover download/i });
  await expect(remove).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: /Questão 1 de 177/ })).toBeVisible();
}

test('responde por teclado, persiste no reload e não tem violações graves de acessibilidade', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Questões' })).toBeVisible();
  const firstQuestion = page.getByRole('region', { name: /Questão 1 de/ });
  await expect(firstQuestion.getByRole('timer')).toHaveAccessibleName(/restantes/);

  const firstOption = firstQuestion.getByRole('radio').first();
  await firstOption.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(firstQuestion.getByRole('group')).toHaveAttribute('disabled', '');
  await expect(firstQuestion.getByRole('status').filter({ hasText: /resposta correta|Boa!/ })).toBeVisible();
  await page.waitForFunction(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('maratona-offline', 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction('sessions').objectStore('sessions').get('enem-demo-2024-1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return Boolean(stored);
  });

  await page.reload();
  await expect(page.getByRole('region', { name: /Questão 1 de/ }).getByRole('group')).toHaveAttribute('disabled', '');

  const results = await new AxeBuilder({ page }).exclude('.swipe-hint').analyze();
  expect(results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious')).toEqual([]);
});

test('bloqueia a questão exatamente após os três minutos', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const firstQuestion = page.getByRole('region', { name: /Questão 1 de/ });
  await expect(firstQuestion.getByRole('timer')).toContainText('3:00');
  await page.clock.fastForward('03:01');
  await expect(firstQuestion.getByText('Tempo esgotado. As alternativas foram bloqueadas.')).toBeVisible();
  await expect(firstQuestion.getByRole('group')).toHaveAttribute('disabled', '');
});

test('baixa pelo catálogo limpo, usa após reload offline e remove a edição', async ({ page, context }) => {
  await mockQuestionAssets(context);
  await page.goto('/');
  expect(await page.evaluate(async () => ({
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
  }))).toEqual({ downloads: 0, packageCaches: 0 });

  await installEditionFromCleanCatalog(page);
  const installedContext = await page.getByRole('region', { name: /Questão 1 de 177/ }).locator('.question-copy p').first().innerText();
  expect(await page.evaluate(async () => ({
    packageCaches: (await caches.keys()).filter((name) => name.startsWith('maratona-package-')).length,
  }))).toEqual({ packageCaches: 1 });

  // Production preview registers the service worker. A controlled reload primes
  // the immutable Vite assets before the actual airplane-mode reload.
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await expect(page.locator('.connection')).toHaveText('Offline');
  await page.reload();
  await expect(page.getByText(installedContext, { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.getByRole('button', { name: /enem-2023: Remover download/i }).click();
  await expect(page.getByRole('button', { name: /enem-2023: Baixar/i })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Uma ciclovia tem 12 km/).first()).toBeVisible();
  await context.setOffline(false);
});

interface MockEvent { eventId: string; type: string; selectedOptionId?: string }
interface MockChange { sequence: number; event: MockEvent; outcome: 'correct' | 'incorrect' | 'timed_out' | null; recordedAt: number }

async function mockAccountAndSync(context: BrowserContext, server: { enabled: boolean; changes: MockChange[]; seen: Set<string> }, initiallyAuthenticated = false) {
  const auth = { authenticated: initiallyAuthenticated };
  const user = { id: 'user-e2e', email: 'aluna@example.test', name: 'Aluna E2E' };
  await context.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/sign-in/email')) auth.authenticated = true;
    if (path.endsWith('/sign-out')) auth.authenticated = false;
    const hasUser = auth.authenticated && !path.endsWith('/sign-out');
    await route.fulfill({ status: 200, json: hasUser ? { user } : {} });
  });
  await context.route('**/api/sync', async (route: Route) => {
    if (!server.enabled) {
      await route.fulfill({ status: 503, json: { message: 'offline mock' } });
      return;
    }
    if (!auth.authenticated) {
      await route.fulfill({ status: 401, json: { message: 'unauthorized' } });
      return;
    }
    const request = route.request().postDataJSON() as { cursor: string | null; events: MockEvent[] };
    for (const event of request.events) {
      if (server.seen.has(event.eventId)) continue;
      server.seen.add(event.eventId);
      server.changes.push({
        sequence: server.changes.length + 1,
        event,
        outcome: event.type === 'question_timed_out' ? 'timed_out' : event.type === 'question_answered' ? 'correct' : null,
        recordedAt: Date.now(),
      });
    }
    const after = request.cursor ? Number.parseInt(request.cursor.slice(3), 36) : 0;
    const changes = server.changes.filter(({ sequence }) => sequence > after);
    await route.fulfill({ status: 200, json: {
      acceptedEventIds: request.events.map(({ eventId }) => eventId),
      changes,
      nextCursor: `v1.${(changes.at(-1)?.sequence ?? after).toString(36)}`,
      hasMore: false,
    } });
  });
}

test('sincroniza progresso anônimo após login/reconexão, replica no segundo dispositivo e preserva pacote no logout', async ({ browser, context, page }) => {
  const server = { enabled: false, changes: [] as MockChange[], seen: new Set<string>() };
  await mockQuestionAssets(context);
  await mockAccountAndSync(context, server);
  await page.goto('/');
  await installEditionFromCleanCatalog(page);

  const firstQuestion = page.getByRole('region', { name: /Questão 1 de 177/ });
  await firstQuestion.getByRole('radio').first().click();
  await expect(firstQuestion.getByRole('group')).toHaveAttribute('disabled', '');

  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  await page.getByLabel('E-mail').fill('aluna@example.test');
  await page.getByLabel('Senha').fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText(/Conta conectada/)).toBeVisible();
  await expect(page.getByText('Sync pendente')).toBeVisible();

  await page.waitForTimeout(2_100);
  server.enabled = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => server.changes.some(({ event }) => event.type === 'question_answered')).toBe(true);
  await expect(page.getByText('Sincronizado')).toBeVisible();

  const secondContext = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await mockAccountAndSync(secondContext, server, true);
  const secondPage = await secondContext.newPage();
  await secondPage.goto('/');
  await expect(secondPage.getByText('Sincronizado')).toBeVisible();
  await expect.poll(async () => secondPage.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('maratona-offline', 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    return new Promise<number>((resolve, reject) => {
      const request = database.transaction('progress').objectStore('progress').count();
      request.onsuccess = () => { database.close(); resolve(request.result); };
      request.onerror = () => reject(request.error);
    });
  })).toBeGreaterThan(0);
  await secondPage.reload();
  await secondPage.getByRole('button', { name: 'Ver estatísticas' }).click();
  const answered = secondPage.getByRole('dialog', { name: 'Estatísticas' }).locator('.stat').filter({ hasText: 'respondidas' });
  await expect(answered).toContainText('1');
  await secondContext.close();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByText(/As provas baixadas continuam disponíveis/)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar conta' }).click();
  await page.getByRole('button', { name: /Filtros/ }).click();
  await expect(page.getByRole('button', { name: /enem-2023: Remover download/i })).toBeVisible();
  expect(await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('maratona-offline', 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    return new Promise<{ progress: number; downloads: number }>((resolve, reject) => {
      const transaction = database.transaction(['progress', 'downloads']);
      const progress = transaction.objectStore('progress').count();
      const downloads = transaction.objectStore('downloads').count();
      transaction.oncomplete = () => { database.close(); resolve({ progress: progress.result, downloads: downloads.result }); };
      transaction.onerror = () => reject(transaction.error);
    });
  })).toEqual({ progress: 0, downloads: 1 });
});
