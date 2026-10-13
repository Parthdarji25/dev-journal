import { expect, test } from '@playwright/test';

/*
 * The static server sends the headers from vercel.json (see global-setup),
 * so these pages run exactly under the production CSP.
 */

const PAGE_POLICY =
  /<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'wasm-unsafe-eval'( 'sha256-[A-Za-z0-9+/]+=*')+"\/>/;

test('every page sends the security headers and runs without CSP violations', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });

  const sitemap = await (await request.get('/sitemap.xml')).text();
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1] as string).pathname,
  );
  expect(listed.length).toBeGreaterThan(20);

  for (const path of [...listed, '/admin/login', '/admin', '/no-such-page']) {
    const response = await page.goto(path);
    if (!response) throw new Error(`No response for ${path}`);
    // The sitemap lists only pages that exist.
    expect(response.status(), path).toBe(path === '/no-such-page' ? 404 : 200);
    const headers = response.headers();
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(headers['cache-control'], path).toBe('public, max-age=0, must-revalidate');
    // The page's own policy pins its inline scripts by hash.
    expect(await response.text(), path).toMatch(PAGE_POLICY);
    // Mind maps draw after load (Markmap loads lazily): wait for the drawing.
    if ((await page.locator('svg.markmap').count()) > 0) {
      await expect(page.locator('svg.markmap g').first()).toBeAttached();
    }
  }
  expect(violations).toEqual([]);
});

test('hashed assets and the search index are cached for a year', async ({ page, request }) => {
  await page.goto('/');
  const script = await page.locator('script[src^="/_next/static/"]').first().getAttribute('src');
  for (const asset of [script as string, '/pagefind/pagefind.js']) {
    const response = await request.get(asset);
    expect(response.status(), asset).toBe(200);
    expect(response.headers()['cache-control'], asset).toBe('public, max-age=31536000, immutable');
  }
});
