import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

const bar = (page: Page) => page.getByRole('group', { name: 'Choose a track' });

test.describe('category bar', () => {
  test('shows one pill per track with counts and the selected track', async ({ page }) => {
    await page.goto('/roadmap/frontend-development');
    const pills = bar(page).getByRole('button');
    await expect(pills).toHaveCount(5);
    await expect(pills.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(pills.first()).toContainText('Frontend');
    await expect(pills.first()).toContainText('3');
    await expect(bar(page).getByRole('button', { name: /Backend/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('[data-track-panel]')).toContainText(
      'content/roadmaps/frontend-development.md',
    );
  });

  test('switching track loads only that track’s prebuilt page', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await page.goto('/interview-questions/gen-ai-engineer');
    await page.waitForLoadState('networkidle');
    // Nothing is prefetched for other tracks until the visitor points at one.
    expect(requested.filter((p) => /\/interview-questions\/(?!gen-ai)/.test(p))).toEqual([]);

    const dsa = bar(page).getByRole('button', { name: /DSA/ });
    await dsa.hover();
    await page.waitForLoadState('networkidle');
    const other = requested.filter((p) => /\/interview-questions\/(?!gen-ai)/.test(p));
    expect(other.length).toBeGreaterThan(0);
    expect(other.every((p) => p.includes('/interview-questions/dsa-python'))).toBe(true);

    await dsa.click();
    await expect(page).toHaveURL(/\/interview-questions\/dsa-python$/);
    await expect(page.getByText('DSA with Python questions are coming soon.')).toBeVisible();
  });

  test('each track page carries only its own data', async ({ request }) => {
    const genAi = await (await request.get('/interview-questions/gen-ai-engineer')).text();
    const dsa = await (await request.get('/interview-questions/dsa-python')).text();
    expect(genAi).toContain('retrieval-augmented');
    expect(dsa).not.toContain('retrieval-augmented');
    const lists = await (await request.get('/cheat-sheets/dsa-python/python-lists')).text();
    expect(lists).not.toContain('Big O table fixture');
    expect(lists).not.toContain('HTTP');
  });

  test('the index page shows the first track, or the remembered one', async ({ page }) => {
    await page.goto('/resources');
    await expect(bar(page).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Frontend Development resources are coming soon.')).toBeVisible();

    await bar(page)
      .getByRole('button', { name: /Backend/ })
      .click();
    await expect(page).toHaveURL(/\/resources\/backend-development$/);
    await page.goto('/mind-maps');
    await expect(page).toHaveURL(/\/mind-maps\/backend-development$/);
  });
});

test('roadmap shows numbered steps with an optional notes link', async ({ page }) => {
  await page.goto('/roadmap/frontend-development');
  const steps = page.locator('ol > li[id^="step-"]');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText('HTML');
  await expect(steps.nth(0)).toContainText('Structure and semantics of a page.');
  await expect(steps.nth(1).getByRole('link', { name: 'Notes' })).toHaveAttribute(
    'href',
    '/learning-notes/frontend-development/css-layout',
  );
  await expect(page.locator('main')).not.toContainText(/done|progress/i);
});

test.describe('mind maps', () => {
  test('draws the map with Markmap and expands/collapses it', async ({ page }) => {
    await page.goto('/mind-maps/backend-development');
    const pills = page.getByRole('navigation', { name: 'Mind maps' }).getByRole('link');
    await expect(pills).toHaveText([/MD\s*HTTP/, /HTML\s*REST overview/]);
    await expect(pills.first()).toHaveAttribute('aria-current', 'page');

    const nodes = page.locator('svg.markmap g.markmap-node');
    await expect(nodes).toHaveCount(10);
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(nodes).toHaveCount(3);
    await page.getByRole('button', { name: 'Expand all' }).click();
    await expect(nodes).toHaveCount(10);

    await page.getByText('Outline').click();
    await expect(page.locator('details')).toContainText('Creates resources');
  });

  test('an HTML map uses the sandboxed frame', async ({ page }) => {
    await page.goto('/mind-maps/backend-development/rest-overview');
    await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  });
});

test.describe('interview questions', () => {
  const URL = '/interview-questions/gen-ai-engineer';

  test('filters by company and difficulty with a live count', async ({ page }) => {
    await page.goto(URL);
    const count = page.getByText(/^\d+ of 2$/);
    await expect(count).toHaveText('2 of 2');
    const companies = page.getByRole('group', { name: 'Filter by company' });
    await expect(companies.getByRole('button')).toHaveText([/All\s*2/, /Acme Corp\s*1/]);

    await companies.getByRole('button', { name: /Acme Corp/ }).click();
    await expect(count).toHaveText('1 of 2');
    const difficulty = page.getByRole('group', { name: 'Filter by difficulty' });
    await difficulty.getByRole('button', { name: 'Easy' }).click();
    await expect(count).toHaveText('0 of 2');
    await expect(page.getByText('No questions match these filters.')).toBeVisible();
    await difficulty.getByRole('button', { name: 'All' }).click();
    await companies.getByRole('button', { name: /^All/ }).click();
    await expect(count).toHaveText('2 of 2');
  });

  test('answers toggle one by one or all at once; shuffle keeps every question', async ({
    page,
  }) => {
    await page.goto(URL);
    await expect(page.getByText('fetches relevant documents')).toBeHidden();
    const rag = page.locator('li', {
      has: page.getByRole('heading', { name: /retrieval-augmented/ }),
    });
    await rag.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByText('fetches relevant documents')).toBeVisible();

    await page.getByRole('button', { name: 'Show all answers' }).click();
    await expect(page.getByText('A fixture question with no companies')).toBeVisible();
    await page.getByRole('button', { name: 'Hide all answers' }).click();
    await expect(page.getByText('fetches relevant documents')).toBeHidden();

    await page.getByRole('button', { name: 'Shuffle' }).click();
    await expect(page.locator('main ol > li')).toHaveCount(2);
    await expect(page.locator('main ol > li').first()).toContainText('Q1');
  });

  test('a company chip on a card filters the list', async ({ page }) => {
    await page.goto(URL);
    await page.locator('main ol > li').getByRole('button', { name: 'Acme Corp' }).click();
    await expect(page.getByText(/^1 of 2$/)).toBeVisible();
  });

  test('a link to a question opens its answer', async ({ page }) => {
    await page.goto(`${URL}#what-is-rag`);
    await expect(page.getByText('fetches relevant documents')).toBeVisible();
  });
});

test.describe('cheat sheets', () => {
  test('filters rows, copies code and shows empty groups', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/cheat-sheets/dsa-python/python-lists');
    const pills = page.getByRole('navigation', { name: 'Cheat sheets' }).getByRole('link');
    await expect(pills).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Empty group' })).toContainText(
      'No entries yet.',
    );
    await expect(page.getByText('a if x | y else b')).toBeVisible();
    await expect(page.getByText('4 of 4 entries')).toBeVisible();

    await page.getByLabel('Filter this sheet').fill('append');
    await expect(page.getByText('1 of 4 entries')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Create' })).toBeHidden();

    await page.getByRole('button', { name: 'Copy xs.append(4)' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('xs.append(4)');

    await page.getByLabel('Filter this sheet').fill('nothing-matches');
    await expect(page.getByText('Nothing matches')).toBeVisible();
  });

  test('the track page shows the first sheet; HTML sheets use the frame', async ({ page }) => {
    await page.goto('/cheat-sheets/dsa-python');
    await expect(page.getByRole('heading', { name: 'Big O table' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  });
});

test('resources filter by type and open in a new tab', async ({ page }) => {
  await page.goto('/resources/backend-development');
  const types = page.getByRole('group', { name: 'Filter by type' });
  await expect(types.getByRole('button')).toHaveText([
    /All\s*4/,
    /Docs\s*1/,
    /Course\s*1/,
    /Video\s*1/,
    /Book\s*1/,
  ]);
  const rows = page.locator('main ul li a[target="_blank"]');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(rows.first()).toContainText('docs.example.com');
  await expect(rows.first()).toContainText('Fixture documentation link');

  await types.getByRole('button', { name: /Video/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Example talk');
  await expect(page.getByText('1 of 4 links')).toBeVisible();
});
