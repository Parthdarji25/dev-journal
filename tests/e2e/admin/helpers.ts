import { expect, type Page } from '@playwright/test';
import { FakeGitHub } from '../../support/fake-github';

/*
 * The admin against an in-memory GitHub: every request to api.github.com is
 * answered by FakeGitHub through page.route, so nothing reaches the network.
 */

export const TOKEN = 'github_pat_e2e_token';
export const OWNER = 'test-owner';
export const REPO = 'test-repo';
export const Q_DIR = 'content/interview-questions/dsa-python';
export const COURSE = 'content/learning-notes/dsa-python/arrays';

export const SKELETON: Record<string, string> = {
  'content/_meta/tracks.json': '[]\n',
  'content/_meta/sections.json': '[]\n',
  'content/learning-notes/dsa-python/.gitkeep': '',
  'content/interview-questions/dsa-python/.gitkeep': '',
  'content/mind-maps/dsa-python/.gitkeep': '',
  'content/roadmaps/.gitkeep': '',
};

/** SKELETON with the course "Arrays" (and no track placeholder, as after creating it). */
export function withCourse(files: Record<string, string>): Record<string, string> {
  const all: Record<string, string> = { ...SKELETON, ...files };
  delete all['content/learning-notes/dsa-python/.gitkeep'];
  return all;
}

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers':
    'github-authentication-token-expiration, x-ratelimit-remaining, x-ratelimit-reset, retry-after, link',
};

export async function routeFakeGitHub(page: Page, files = SKELETON): Promise<FakeGitHub> {
  const fake = new FakeGitHub({
    owner: OWNER,
    repo: REPO,
    files,
    token: TOKEN,
    tokenExpiration: '2026-12-31 00:00:00 UTC',
  });
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const response = await fake.fetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: request.postData() ?? undefined,
    });
    await route.fulfill({
      status: response.status,
      headers: { ...Object.fromEntries(response.headers.entries()), ...CORS },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  return fake;
}

/** Starts signed in, as after a verified sign-in, on Interview Questions of DSA with Python. */
export async function signedIn(page: Page, files = SKELETON) {
  const fake = await routeFakeGitHub(page, files);
  await page.addInitScript(
    ([owner, repo, token]) => {
      if (!window.localStorage.getItem('parth-notes:admin:session')) {
        window.localStorage.setItem(
          'parth-notes:admin:session',
          JSON.stringify({
            token,
            owner,
            repo,
            branch: 'main',
            expiresAt: '2026-12-31T00:00:00.000Z',
          }),
        );
        window.localStorage.setItem(
          'parth-notes:admin:place',
          JSON.stringify({ track: 'dsa-python', section: 'interview-questions', course: '' }),
        );
      }
    },
    [OWNER, REPO, TOKEN],
  );
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Interview Questions' })).toBeVisible();
  return fake;
}

export async function newQuestion(page: Page, title: string) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByLabel('Question', { exact: true }).fill(title);
}

export const commitButton = (page: Page) =>
  page.getByRole('button', { name: /Commit & push|Pushing/ });

/** The toast in the corner (the header's site status is a live region too). */
export const toast = (page: Page) => page.getByRole('status').filter({ hasNotText: 'Site status' });

/** The deploy indicator in the admin header. */
export const siteStatus = (page: Page) =>
  page.getByRole('banner').getByRole('status').filter({ hasText: 'Site status' });

/**
 * Waits until `n` commits are on the branch (the ref update is the last step
 * of a commit), then checks that no other commit objects were created.
 */
export async function expectCommits(fake: FakeGitHub, n: number) {
  await expect.poll(() => fake.history().length).toBe(n);
  expect(fake.commitsCreated).toBe(n);
}

/** Draft keys saved in this browser. */
export const draftKeys = (page: Page) =>
  page.evaluate(() =>
    Object.keys(window.localStorage).filter((k) => k.startsWith('parth-notes:admin:draft:')),
  );
