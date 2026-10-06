import { expect, test } from '@playwright/test';

// Zitadel Login V2 appends /login to the configured /login base URI.
// Exercise the built app entrypoint, rather than mounting AuthPage directly.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({
    json: null,
  }));
  await page.route('**/api/login/context?authRequest=V2_route-regression', (route) => route.fulfill({
    json: { googleEnabled: false },
  }));
});

for (const path of ['/login', '/login/', '/login/login', '/login/login/']) {
  test(`the identity screen opens at ${path}`, async ({ page }) => {
    await page.goto(`${path}?authRequest=V2_route-regression`);
    await expect(page.getByRole('heading', { name: 'Entrar na Maratona', exact: true })).toBeVisible();
    await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Provas', exact: true })).toHaveCount(0);
  });
}

test('entering from the account dialog follows the Login V2 redirect', async ({ page }) => {
  await page.route('**/api/auth/sign-in/social', (route) => route.fulfill({
    json: { url: 'http://127.0.0.1:4173/login/login?authRequest=V2_route-regression' },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar ou criar conta', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Entrar ou criar conta', exact: true }).click();
  await expect(page).toHaveURL(/\/login\/login\?authRequest=V2_route-regression$/);
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
});

test('the service worker does not cache the Login V2 navigation response', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.goto('/login/login?authRequest=V2_route-regression');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  const cachedURL = await page.evaluate(async () => (await caches.match('/index.html'))?.url);
  expect(cachedURL).toBeTruthy();
  expect(cachedURL).not.toContain('/login');
  expect(cachedURL).not.toContain('authRequest');
});
