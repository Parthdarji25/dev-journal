import { expect, test } from '@playwright/test';

const NOTE = '/learning-notes/frontend-development/css-layout/flexbox-basics';
const HTML_CHAPTER = '/learning-notes/frontend-development/css-layout/grid-playground';
const PROBLEM = '/learning-notes/dsa-python/arrays/two-sum';
const CASE_STUDY = '/learning-notes/system-design/url-shortener/design-walkthrough';

test.use({ viewport: { width: 1440, height: 900 } });

test('home lists tracks with summaries and recently updated items', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#tracks').getByRole('link', { name: /Frontend Development/ }),
  ).toContainText('1 course, 1 roadmap');
  const recent = page.locator('section[aria-labelledby="recent-title"] li');
  await expect(recent).toHaveCount(8);
  await expect(recent.first()).toContainText('Python lists');
  await expect(recent.first()).toContainText('Cheat Sheets');
  await expect(recent.first()).toContainText('9 Mar 2026');
});

test('track hub shows up to three items per section and coming soon elsewhere', async ({
  page,
}) => {
  await page.goto('/tracks/frontend-development');
  const notes = page.locator('section[aria-labelledby="learning-notes-title"]');
  await expect(notes.getByRole('link', { name: 'CSS Layout' })).toBeVisible();
  await expect(notes.getByRole('link', { name: 'Open Learning Notes' })).toHaveAttribute(
    'href',
    '/learning-notes#frontend-development',
  );
  const roadmap = page.locator('section[aria-labelledby="roadmaps-title"]');
  await expect(roadmap.getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('section[aria-labelledby="mind-maps-title"]')).toContainText(
    'Coming soon',
  );
});

test('learning notes index shows course cards and empty panels', async ({ page }) => {
  await page.goto('/learning-notes');
  const frontend = page.locator('[data-track-panel="frontend-development"]');
  await expect(frontend.getByRole('link', { name: /CSS Layout/ })).toContainText(
    '2 chapters · Note, HTML',
  );
  await expect(frontend).toContainText('content/learning-notes/frontend-development/');
  await expect(page.locator('[data-track-panel="gen-ai-engineer"]')).toContainText(
    'Prompting basics',
  );
  await expect(page.locator('[data-track-panel="backend-development"]')).toContainText(
    'coming soon',
  );
});

test('course page lists chapters in order with MD/HTML badges', async ({ page }) => {
  await page.goto('/learning-notes/frontend-development/css-layout');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CSS Layout');
  const items = page.locator('section[aria-labelledby="chapters-title"] li');
  await expect(items).toHaveText([/MD\s*Flexbox basics/, /HTML\s*Grid playground/]);
});

test('a course with no chapters shows its empty state', async ({ page }) => {
  await page.goto('/learning-notes/gen-ai-engineer/prompting-basics');
  await expect(page.getByText('Chapters for this course are coming soon.')).toBeVisible();
});

test.describe('note chapter', () => {
  test('renders meta, markdown features and navigation', async ({ page }) => {
    await page.goto(NOTE);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link')).toHaveText(
      ['Learning Notes', 'Frontend Development', 'CSS Layout'],
    );
    await expect(page.locator('article > p').first()).toHaveText(
      'Note · Last updated 2 Mar 2026 · ~1 min read',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Flexbox basics');

    const article = page.locator('article');
    await expect(article.locator('h2#main-axis a.heading-anchor')).toHaveAttribute(
      'href',
      '#main-axis',
    );
    await expect(article.locator('.callout-tip')).toContainText('Use gap instead of margins');
    await expect(article.locator('.callout-warning')).toBeVisible();
    await expect(article.locator('table')).toBeVisible();
    await expect(article.locator('script')).toHaveCount(0);
    await expect(article).not.toContainText('raw html is never rendered');

    const img = article.locator('img');
    await expect(img).toHaveAttribute('width', '640');
    await expect(img).toHaveAttribute('height', '320');
    await expect(img).toHaveAttribute('loading', 'eager');
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(
      true,
    );

    const current = page
      .locator('aside nav[aria-label="Course chapters"] [aria-current="page"]')
      .filter({ visible: true });
    await expect(current).toContainText('Flexbox basics');
    await expect(
      page.getByRole('navigation', { name: 'Previous and next chapter' }).getByRole('link'),
    ).toHaveText(/Next HTML chapters*Grid playground/);
  });

  test('table of contents tracks the scroll position', async ({ page }) => {
    await page.goto(NOTE);
    const toc = page.getByRole('navigation', { name: 'On this page' });
    await expect(toc.getByRole('link')).toHaveText(['Main axis', 'Alignment', 'Cross axis']);
    await page.locator('h2#cross-axis').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(toc.locator('[aria-current="location"]')).toHaveText('Cross axis');
  });

  test('copy button copies the code and says Copied', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(NOTE);
    const button = page.getByRole('button', { name: 'Copy code' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.copy-button')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('display: flex;');
  });

  test('code is highlighted with classes, not inline styles', async ({ page }) => {
    await page.goto(NOTE);
    const pre = page.locator('pre.shiki');
    await expect(pre).toHaveAttribute('data-language', 'css');
    expect(await pre.locator('[style]').count()).toBe(0);
    const colour = await pre
      .locator('span[class*="sl-"]')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(colour).not.toBe(await pre.evaluate((el) => getComputedStyle(el).color));
  });
});

test('problem chapter hides the solution behind a toggle', async ({ page }) => {
  await page.goto(PROBLEM);
  await expect(page.locator('article')).toContainText('Easy');
  await expect(page.locator('article')).toContainText('Asked by');
  await expect(page.locator('article')).toContainText('Acme Corp');
  await expect(page.locator('h2#problem')).toBeVisible();
  await expect(page.locator('h2#approach')).toBeHidden();

  const toggle = page.getByRole('button', { name: 'Show solution' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Hide solution' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.locator('h2#approach')).toBeVisible();
  await expect(page.locator('pre.shiki[data-language="python"]')).toBeVisible();
  await expect(page.getByText('Time: O(n)')).toBeVisible();
  await expect(page.getByText('Space: O(n)')).toBeVisible();
});

test('case-study chapter shows one step at a time', async ({ page }) => {
  await page.goto(CASE_STUDY);
  const steps = page.getByRole('navigation', { name: 'Case study steps' }).getByRole('button');
  await expect(steps).toHaveCount(3);
  await expect(steps.first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('region', { name: /Step 1 of 3/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Step 2 of 3/ })).toBeHidden();

  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByRole('region', { name: /Step 2 of 3: Data model/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Step 1 of 3/ })).toBeHidden();

  await steps.nth(2).click();
  await expect(page.getByRole('region', { name: /Step 3 of 3/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();

  await page.emulateMedia({ media: 'print' });
  for (let i = 1; i <= 3; i++)
    await expect(page.getByRole('region', { name: new RegExp(`Step ${i} of 3`) })).toBeVisible();
});

test.describe('HTML chapter', () => {
  test('renders a sandboxed frame that resizes to its content', async ({ page }) => {
    await page.goto(HTML_CHAPTER);
    await expect(page.getByText('Fixture HTML artifact chapter.')).toBeVisible();
    const frame = page.locator('iframe');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect(frame).toHaveAttribute('loading', 'lazy');
    await expect(frame).toHaveAttribute(
      'src',
      'http://127.0.0.1:4401/learning-notes/frontend-development/css-layout/grid-playground.html',
    );
    await expect(page.getByText('Sandboxed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Full size' })).toBeVisible();

    // The artifact is short, so the frame shrinks from its 480px default to fit.
    await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeLessThan(400);
    const inner = page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Grid playground fixture' });
    await expect(inner).toBeVisible();
    await expect(page.getByText('This artifact could not be loaded')).toHaveCount(0);
  });

  test('shows an error with Reload when the artifact does not load in 10s', async ({ page }) => {
    await page.clock.install();
    await page.route('http://127.0.0.1:4401/**', (route) => route.abort());
    await page.goto(HTML_CHAPTER);
    await page.locator('iframe').scrollIntoViewIfNeeded();
    await page.clock.runFor(11_000);
    const alert = page.getByRole('alert').filter({ hasText: 'This artifact could not be loaded' });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('button', { name: 'Reload' })).toBeVisible();
  });
});
