import { expect, test } from '@playwright/test';

const TRACKS = [
  'frontend-development',
  'backend-development',
  'gen-ai-engineer',
  'dsa-python',
  'system-design',
];

test('home shows coming-soon states everywhere', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    "A notebook for everything I'm learning.",
  );
  const cards = page.locator('#tracks').getByRole('link');
  await expect(cards).toHaveCount(5);
  for (const card of await cards.all()) await expect(card).toContainText('Coming soon');
  await expect(
    page.locator('section[aria-labelledby="sections-title"]').getByRole('link'),
  ).toHaveCount(6);
  await expect(page.getByText('Nothing yet, coming soon.')).toBeVisible();
});

for (const track of TRACKS) {
  test(`track hub ${track} shows six coming-soon sections`, async ({ page }) => {
    await page.goto(`/tracks/${track}`);
    await expect(
      page.locator('main section[aria-labelledby$="-title"]').filter({ hasText: 'Coming soon' }),
    ).toHaveCount(6);
    await expect(
      page.getByRole('navigation', { name: 'Other tracks' }).getByRole('link'),
    ).toHaveCount(4);
  });
}

test('learning notes index shows one empty panel per track and filters client-side', async ({
  page,
}) => {
  await page.goto('/learning-notes');
  const panels = page.locator('[data-track-panel]');
  await expect(panels).toHaveCount(5);
  await expect(page.getByText('System Design notes are coming soon.')).toBeVisible();
  for (const panel of await panels.all()) await expect(panel).toContainText('are coming soon.');

  const filter = page.getByRole('group', { name: 'Filter by track' });
  await expect(filter.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  await filter.getByRole('button', { name: 'DSA' }).click();
  await expect(filter.getByRole('button', { name: 'DSA' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panels.filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('[data-track-panel="dsa-python"]')).toBeVisible();
  await filter.getByRole('button', { name: 'All' }).click();
  await expect(panels.filter({ visible: true })).toHaveCount(5);
});

test('public pages never link to admin', async ({ page }) => {
  for (const path of ['/', '/learning-notes', '/tracks/dsa-python']) {
    await page.goto(path);
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  }
});
