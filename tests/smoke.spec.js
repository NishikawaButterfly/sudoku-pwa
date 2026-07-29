import { test, expect } from '@playwright/test';

test('starts a playable game and saves progress', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Sudoku Instantáneo/);
  await expect(page.locator('[data-level]')).toHaveCount(6);

  await page.locator('[data-level="easy"]').click();
  await expect(page.locator('.cell')).toHaveCount(81);
  await expect(page.locator('.number')).toHaveCount(9);

  const editable = page.locator('.cell:not(.given)').first();
  await editable.click();
  await page.locator('.number').first().click();

  const saved = await page.evaluate(() => localStorage.getItem('sudoku-instantaneo-state-v2'));
  expect(saved).toBeTruthy();
});

test('notes and pause controls are available', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-level="medium"]').click();
  await page.locator('.cell:not(.given)').first().click();
  await page.getByRole('button', { name: /Notas/ }).click();
  await expect(page.getByRole('button', { name: /Notas/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /Pausa/ }).click();
  await expect(page.getByText('Partida pausada')).toBeVisible();
});
