import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'sudoku-instantaneo-state-v2';

async function startGame(page, level = 'easy') {
  await page.goto('/');
  await page.locator(`[data-level="${level}"]`).click();
  await expect(page.locator('.cell')).toHaveCount(81);
}

async function savedGame(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

test('starts a playable game and saves the entered value', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Sudoku Instant/);
  await expect(page.locator('[data-level]')).toHaveCount(6);

  await page.locator('[data-level="easy"]').click();
  await expect(page.locator('.cell')).toHaveCount(81);
  await expect(page.locator('.number')).toHaveCount(9);

  const editable = page.locator('.cell:not(.given)').first();
  const index = Number(await editable.getAttribute('data-index'));
  const initial = await savedGame(page);
  const answer = initial.solution[index];

  await editable.click();
  await page.keyboard.press(String(answer));

  const persisted = await savedGame(page);
  expect(persisted.values[index]).toBe(answer);
  await expect(page.locator(`[data-index="${index}"]`)).toHaveText(String(answer));
});
test('supports notes and keeps the timer stopped while paused', async ({ page }) => {
  await startGame(page, 'medium');
  const editable = page.locator('.cell:not(.given)').first();
  await editable.click();
  await page.getByRole('button', { name: 'Notes' }).click();
  await expect(page.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('1');
  await expect(editable).toContainText('1');

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Game paused')).toBeVisible();
  const pausedAt = await page.locator('#timer').textContent();
  await page.waitForTimeout(1_200);
  await expect(page.locator('#timer')).toHaveText(pausedAt);
});

test('restores a saved game from the menu', async ({ page }) => {
  await startGame(page);
  const editable = page.locator('.cell:not(.given)').first();
  const index = Number(await editable.getAttribute('data-index'));
  const initial = await savedGame(page);
  const answer = initial.solution[index];

  await editable.click();
  await page.keyboard.press(String(answer));
  await page.getByRole('button', { name: 'Return to menu' }).click();
  await page.getByRole('button', { name: 'Save and exit' }).click();
  await page.getByRole('button', { name: 'Continue game' }).click();

  await expect(page.locator(`[data-index="${index}"]`)).toHaveText(String(answer));
});

test('removes malformed saved data instead of rendering a broken board', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({
      level: 'easy',
      puzzle: [0],
      solution: [1],
      values: [0],
      notes: [[]],
      elapsed: 0,
      mistakes: 0,
      hints: 0,
    }));
  }, STORAGE_KEY);
  await page.reload();

  await page.getByRole('button', { name: 'Continue game' }).click();
  await expect(page.getByText('The saved game was invalid and has been removed')).toBeVisible();
  await expect(page.locator('#menuScreen')).toHaveClass(/active/);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('does not change the game through an open dialog', async ({ page }) => {
  await startGame(page);
  const editable = page.locator('.cell:not(.given)').first();
  const index = Number(await editable.getAttribute('data-index'));
  await editable.click();
  const before = await savedGame(page);

  await page.getByRole('button', { name: 'Open help' }).click();
  await page.keyboard.press('1');
  const after = await savedGame(page);

  expect(after.values[index]).toBe(before.values[index]);
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
});

test('marks wrong entries, ignores repeated no-ops and restores state with undo', async ({ page }) => {
  await startGame(page);
  const editable = page.locator('.cell:not(.given)').first();
  const index = Number(await editable.getAttribute('data-index'));
  const initial = await savedGame(page);
  const wrongAnswer = initial.solution[index] % 9 + 1;

  await editable.click();
  await page.keyboard.press(String(wrongAnswer));
  await expect(page.locator(`[data-index="${index}"]`)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#mistakes')).toHaveText('Mistakes: 1');

  await page.keyboard.press(String(wrongAnswer));
  await expect(page.locator('#mistakes')).toHaveText('Mistakes: 1');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(`[data-index="${index}"]`)).toHaveText('');
  await expect(page.locator('#mistakes')).toHaveText('Mistakes: 0');
});

test('keeps a completed game terminal and its result dialog non-dismissible', async ({ page }) => {
  await page.goto('/');
  const setup = await page.evaluate(async (key) => {
    const { PUZZLES } = await import('/src/puzzles.js');
    const item = PUZZLES.easy[0];
    const puzzle = [...item.p].map(Number);
    const solution = [...item.s].map(Number);
    const index = puzzle.findIndex((value) => value === 0);
    const values = [...solution];
    values[index] = 0;
    localStorage.setItem(key, JSON.stringify({
      version: 3,
      level: 'easy',
      puzzle,
      solution,
      values,
      notes: Array.from({ length: 81 }, () => []),
      elapsed: 12,
      mistakes: 0,
      hints: 0,
    }));
    return { index, answer: solution[index] };
  }, STORAGE_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Continue game' }).click();
  await page.keyboard.press(String(setup.answer));

  await expect(page.getByRole('heading', { name: 'Completed!' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('heading', { name: 'Completed!' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('supports roving keyboard navigation across the grid', async ({ page }) => {
  await startGame(page);
  await page.locator('[data-index="0"]').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-index="1"]')).toBeFocused();
  await expect(page.locator('[data-index="1"]')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('[data-index="0"]')).toHaveAttribute('tabindex', '-1');
});
