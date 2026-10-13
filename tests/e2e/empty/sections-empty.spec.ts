import { expect, test, type Page } from '@playwright/test';

/** Shortcuts only work once the page has hydrated, so retry until the palette opens. */
async function openPalette(page: Page, key = 'Control+k') {
  const dialog = page.getByRole('dialog', { name: 'Search everything' });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press(key);
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

const SECTIONS = [
  { base: '/roadmap', text: (t: string) => `${t} roadmap is coming soon.` },
  { base: '/mind-maps', text: (t: string) => `${t} mind maps are coming soon.` },
  { base: '/interview-questions', text: (t: string) => `${t} questions are coming soon.` },
  { base: '/cheat-sheets', text: (t: string) => `${t} cheat sheets are coming soon.` },
  { base: '/resources', text: (t: string) => `${t} resources are coming soon.` },
];

const TRACKS = [
  ['frontend-development', 'Frontend Development'],
  ['backend-development', 'Backend Development'],
  ['gen-ai-engineer', 'Gen AI Engineer'],
  ['dsa-python', 'DSA with Python'],
  ['system-design', 'System Design'],
] as const;

for (const section of SECTIONS) {
  test(`${section.base} shows coming-soon for every track`, async ({ page }) => {
    await page.goto(section.base);
    await expect(page.getByText(section.text('Frontend Development'))).toBeVisible();
    for (const [slug, name] of TRACKS) {
      await page.goto(`${section.base}/${slug}`);
      await expect(page.getByText(section.text(name))).toBeVisible();
      const pills = page.getByRole('group', { name: 'Choose a track' }).getByRole('button');
      await expect(pills).toHaveCount(5);
      for (const pill of await pills.all()) await expect(pill).toContainText('0');
    }
  });
}

test('search on an empty site finds nothing (no fallback index of every page)', async ({
  page,
}) => {
  await page.goto('/');
  await openPalette(page);
  const dialog = page.getByRole('dialog', { name: 'Search everything' });
  await dialog.getByRole('combobox', { name: 'Search everything' }).fill('coming');
  await expect(dialog.getByText('No results for “coming”.')).toBeVisible();
});

test('unknown pages show the styled 404', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
});

test('SEO files exist', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /admin');
  expect(robots).toContain('Sitemap:');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/roadmap/system-design</loc>');
  expect(sitemap).not.toContain('/admin');
  const og = await request.get('/og-image.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toBe('image/png');
});

test('pages declare a canonical URL and description', async ({ page }) => {
  await page.goto('/roadmap');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/roadmap\/frontend-development$/,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/og-image\.png$/,
  );
});
