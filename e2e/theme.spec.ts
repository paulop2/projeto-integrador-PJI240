import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('escolhe, aplica e persiste o tema claro', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');
  const select = page.getByLabel('Tema');

  await expect(select).toHaveValue('dark');
  await expect(root).toHaveAttribute('data-theme', 'dark');

  await select.selectOption('light');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f2ea');
  expect(await page.evaluate(() => localStorage.getItem('maratona.theme'))).toBe('light');

  const results = await new AxeBuilder({ page }).exclude('.swipe-hint').analyze();
  expect(results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious')).toEqual([]);

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.getByLabel('Tema')).toHaveValue('light');
});

test('segue a preferência do sistema quando a opção Sistema está ativa', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  await page.getByLabel('Tema').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f2ea');
});
