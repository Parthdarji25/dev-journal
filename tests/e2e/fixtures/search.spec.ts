import { expect, test, type Page } from '@playwright/test';

/** Shortcuts only work once the page has hydrated, so retry until the palette opens. */
async function openPalette(page: Page, key = 'Control+k') {
  const dialog = page.getByRole('dialog', { name: 'Search everything' });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press(key);
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

test.use({ viewport: { width: 1280, height: 900 } });

const palette = (page: Page) => page.getByRole('dialog', { name: 'Search everything' });

function pagefindRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/pagefind/')) seen.push(path);
  });
  return seen;
}

test('the search index loads only when the palette first opens', async ({ page }) => {
  const seen = pagefindRequests(page);
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(seen).toEqual([]);

  // Hover prefetches the script, not the index (retried until the page has hydrated).
  const button = page.getByRole('button', { name: /Search everything/ }).first();
  await expect(async () => {
    await page.mouse.move(0, 0);
    await button.hover();
    expect(seen).toContain('/pagefind/pagefind.js');
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(seen.some((p) => p.includes('pagefind-entry') || p.endsWith('.pf_meta'))).toBe(false);

  await openPalette(page);
  await expect(palette(page)).toBeVisible();
  await page.keyboard.type('flexbox');
  await expect(palette(page).locator('[cmdk-item]').first()).toBeVisible();
  expect(seen.some((p) => p.includes('pagefind-entry'))).toBe(true);
});

test('finds a chapter and opens it with the keyboard', async ({ page }) => {
  await page.goto('/');
  await openPalette(page);
  const input = palette(page).getByRole('combobox', { name: 'Search everything' });
  await expect(input).toBeFocused();
  await input.fill('flexbox');
  const first = palette(page).locator('[cmdk-item]').first();
  await expect(first).toContainText('Flexbox basics · CSS Layout');
  await expect(first).toContainText('Learning Notes');
  await expect(palette(page).getByText(/^\d+ results?$/)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(
    /\/learning-notes\/frontend-development\/css-layout\/flexbox-basics$/,
  );
  await expect(palette(page)).toBeHidden();
});

test('"/" opens the palette; Esc closes it and returns focus', async ({ page }) => {
  await page.goto('/learning-notes');
  const button = page.getByRole('button', { name: /Search everything/ }).first();
  await button.focus();
  await openPalette(page, '/');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test('section chips and the track select filter results', async ({ page }) => {
  await page.goto('/');
  await openPalette(page);
  const dialog = palette(page);
  await dialog.getByRole('combobox', { name: 'Search everything' }).fill('fixture');
  await expect(dialog.locator('[cmdk-item]').first()).toBeVisible();
  const total = await dialog.locator('[cmdk-item]').count();
  expect(total).toBeGreaterThan(3);

  await dialog
    .getByRole('group', { name: 'Filter by section' })
    .getByRole('button', { name: 'Cheat Sheets' })
    .click();
  // The HTML sheet is indexed by title only, so just the markdown sheet matches.
  await expect(dialog.locator('[cmdk-item]')).toHaveCount(1);
  await expect(dialog.locator('[cmdk-item]')).toContainText('Python lists');
  await expect(dialog.locator('[cmdk-item]')).toContainText('Cheat Sheets');

  await dialog
    .getByRole('group', { name: 'Filter by section' })
    .getByRole('button', { name: 'All' })
    .click();
  // "fixture" appears in no System Design text; "cache" does, in a case-study step.
  await dialog.getByLabel('Track').selectOption('system-design');
  await expect(dialog.getByText('No results for “fixture”.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Search everything' }).fill('cache');
  await expect(dialog.locator('[cmdk-item]')).toHaveCount(1);
  await expect(dialog.locator('[cmdk-item]')).toContainText('Design walkthrough');
  await dialog.getByLabel('Track').selectOption('dsa-python');
  await expect(dialog.getByText('No results for “cache”.')).toBeVisible();
});

test('each interview question is its own result and opens its answer', async ({ page }) => {
  await page.goto('/');
  await openPalette(page);
  await palette(page).getByRole('combobox', { name: 'Search everything' }).fill('retrieval');
  const option = palette(page).locator('[cmdk-item]', {
    hasText: 'What is retrieval-augmented generation',
  });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/interview-questions\/gen-ai-engineer#what-is-rag$/);
  await expect(page.locator('#what-is-rag-answer')).toContainText('fetches relevant documents');
  await expect(page.locator('#what-is-rag-answer')).toBeVisible();
});

test('arrow keys move the selection; no matches shows an empty state', async ({ page }) => {
  await page.goto('/');
  await openPalette(page);
  const dialog = palette(page);
  await dialog.getByRole('combobox', { name: 'Search everything' }).fill('fixture');
  await expect(dialog.locator('[cmdk-item]').nth(1)).toBeVisible();
  await expect(dialog.locator('[cmdk-item]').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(dialog.locator('[cmdk-item]').nth(1)).toHaveAttribute('aria-selected', 'true');

  await dialog.getByRole('combobox', { name: 'Search everything' }).fill('zzqqxxnothing');
  await expect(dialog.getByText('No results for “zzqqxxnothing”.')).toBeVisible();
  await expect(dialog.getByText('0 results')).toBeVisible();
});

test('HTML chapters are found by their title, description and tags', async ({ page }) => {
  await page.goto('/');
  await openPalette(page);
  await palette(page).getByRole('combobox', { name: 'Search everything' }).fill('interactive');
  await expect(palette(page).locator('[cmdk-item]').first()).toContainText('Grid playground');
});
