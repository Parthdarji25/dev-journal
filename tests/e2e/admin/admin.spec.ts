import { expect, test, type Page } from '@playwright/test';
import { FakeGitHub } from '../../support/fake-github';

/*
 * The admin against an in-memory GitHub: every request to api.github.com is
 * answered by FakeGitHub through page.route, so nothing reaches the network.
 */

const TOKEN = 'github_pat_e2e_token';
const OWNER = 'test-owner';
const REPO = 'test-repo';
const Q_DIR = 'content/interview-questions/dsa-python';

const SKELETON: Record<string, string> = {
  'content/_meta/tracks.json': '[]\n',
  'content/_meta/sections.json': '[]\n',
  'content/learning-notes/dsa-python/.gitkeep': '',
  'content/interview-questions/dsa-python/.gitkeep': '',
  'content/mind-maps/dsa-python/.gitkeep': '',
  'content/roadmaps/.gitkeep': '',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
};

async function routeFakeGitHub(page: Page, files = SKELETON): Promise<FakeGitHub> {
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

/** Starts signed in, as after a verified sign-in. */
async function signedIn(page: Page, files = SKELETON) {
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

async function newQuestion(page: Page, title: string) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByLabel('Question', { exact: true }).fill(title);
}

const commitButton = (page: Page) => page.getByRole('button', { name: /Commit & push|Pushing/ });

test.describe('sign-in', () => {
  test('verifies the token, shows write access and the expiry, then opens the admin', async ({
    page,
  }) => {
    const fake = await routeFakeGitHub(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByText('Token setup')).toBeVisible();
    await expect(page.getByText('Contents: Read and write')).toBeVisible();

    await page.getByLabel('Repository').fill(`${OWNER}/${REPO}`);
    await page.getByLabel('Fine-grained token').fill('ghp_classic_token');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'It starts with github_pat_' }),
    ).toBeVisible();
    expect(fake.requests).toEqual([]);

    await page.getByLabel('Fine-grained token').fill(TOKEN);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByText('Token verified, write access, expires 31 Dec 2026')).toBeVisible();
    // The token lives in localStorage only, never in the address bar.
    expect(page.url()).not.toContain(TOKEN);
    expect(
      await page.evaluate(() => window.localStorage.getItem('parth-notes:admin:session')),
    ).toContain(TOKEN);

    await page.getByRole('button', { name: 'Open admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText(`${OWNER}/${REPO} · main`)).toBeVisible();
    await expect(page.getByText('Signed in, token expires 31 Dec 2026')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View site' })).toBeVisible();
  });

  test('a read-only token is refused', async ({ page }) => {
    const fake = await routeFakeGitHub(page);
    fake.canPush = false;
    await page.goto('/admin/login');
    await page.getByLabel('Repository').fill(`${OWNER}/${REPO}`);
    await page.getByLabel('Fine-grained token').fill(TOKEN);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'can read the repository but not write to it' }),
    ).toBeVisible();
  });

  test('the admin is not indexed', async ({ page }) => {
    await routeFakeGitHub(page);
    await page.goto('/admin/login');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('content', () => {
  test('create, edit, rename and delete each make exactly one commit', async ({ page }) => {
    const fake = await signedIn(page);
    await expect(page.getByText('No interview questions for DSA with Python yet.')).toBeVisible();

    // Create
    await newQuestion(page, 'What is a closure?');
    await expect(page.getByText('docs(interview-questions): add what-is-a-closure.md')).toHaveCount(
      0,
    );
    await expect(page.getByLabel('Commit message')).toHaveValue(
      'docs(interview-questions): add what-is-a-closure.md',
    );
    const changes = page.getByRole('complementary', { name: 'Commit' });
    await expect(changes).toContainText(`${Q_DIR}/what-is-a-closure.md`);
    await expect(changes).toContainText(`${Q_DIR}/.gitkeep`);
    await expect(changes).toContainText('1 commit, 2 files written together');
    await expect(commitButton(page)).toBeEnabled();
    await commitButton(page).click();
    await expect(page.getByRole('status')).toContainText('Committed what-is-a-closure.md');
    await expect.poll(() => fake.commitsCreated).toBe(1);
    expect(fake.files()[`${Q_DIR}/what-is-a-closure.md`]).toContain('question: What is a closure?');
    expect(fake.files()[`${Q_DIR}/.gitkeep`]).toBeUndefined();

    // Edit
    const row = page.getByRole('listitem').filter({ hasText: 'what-is-a-closure.md' });
    await expect(row).toContainText('What is a closure?');
    await row.getByRole('button', { name: /^Edit/ }).click();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue('What is a closure?');
    await page.getByLabel('Question', { exact: true }).fill('What is a closure in Python?');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expect(page.getByText(/Draft saved in this browser/)).toBeVisible();
    await expect(page.getByLabel('Commit message')).toHaveValue(
      'docs(interview-questions): update what-is-a-closure.md',
    );
    await commitButton(page).click();
    await expect(page.getByRole('status')).toContainText('Committed what-is-a-closure.md');
    await expect.poll(() => fake.commitsCreated).toBe(2);
    expect(fake.files()[`${Q_DIR}/what-is-a-closure.md`]).toContain(
      'question: What is a closure in Python?',
    );

    // Rename (inline, with a live preview of the new name)
    await row.getByRole('button', { name: /^Rename/ }).click();
    await page.getByLabel('New name for what-is-a-closure.md').fill('Python closures');
    await expect(page.getByText('→ python-closures.md')).toBeVisible();
    await expect(page.getByText('No other page links here.')).toBeVisible();
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      'Renamed what-is-a-closure.md to python-closures.md',
    );
    await expect.poll(() => fake.commitsCreated).toBe(3);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith(Q_DIR))).toEqual([
      `${Q_DIR}/python-closures.md`,
    ]);

    // Delete, then Undo
    const renamed = page.getByRole('listitem').filter({ hasText: 'python-closures.md' });
    await renamed.getByRole('button', { name: /^Delete/ }).click();
    const confirm = page.getByRole('group', { name: 'Delete python-closures.md' });
    await expect(confirm).toContainText(`${Q_DIR}/.gitkeep`);
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Deleted python-closures.md');
    await expect.poll(() => fake.commitsCreated).toBe(4);
    expect(fake.files()[`${Q_DIR}/python-closures.md`]).toBeUndefined();
    expect(fake.files()[`${Q_DIR}/.gitkeep`]).toBe('');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toContainText('Restored python-closures.md');
    await expect.poll(() => fake.commitsCreated).toBe(5);
    expect(fake.files()[`${Q_DIR}/python-closures.md`]).toContain('What is a closure in Python?');
    expect(fake.files()[`${Q_DIR}/.gitkeep`]).toBeUndefined();
    expect(fake.history().map((c) => c.message)).toEqual([
      'docs(interview-questions): restore python-closures.md',
      'docs(interview-questions): delete python-closures.md',
      'docs(interview-questions): rename what-is-a-closure.md to python-closures.md',
      'docs(interview-questions): update what-is-a-closure.md',
      'docs(interview-questions): add what-is-a-closure.md',
    ]);
  });

  test('a duplicate file name is blocked', async ({ page }) => {
    await signedIn(page, {
      ...SKELETON,
      [`${Q_DIR}/what-is-a-closure.md`]:
        '---\nquestion: What is a closure?\ndifficulty: easy\n---\n\nA.\n',
    });
    await newQuestion(page, 'What is a closure?');
    await expect(
      page.getByText('A file with this name already exists. Use "what-is-a-closure-2.md" instead.'),
    ).toBeVisible();
    await expect(commitButton(page)).toBeDisabled();
  });

  test('a stale branch shows the conflict message and never overwrites', async ({ page }) => {
    const fake = await signedIn(page);
    await newQuestion(page, 'Racing');
    fake.beforeRefUpdate = () => {
      fake.beforeRefUpdate = undefined;
      fake.externalPush({
        'content/roadmaps/dsa-python.md': '---\ntitle: Theirs\n---\n\n1. **A** - b\n',
      });
    };
    await commitButton(page).click();
    await expect(
      page.getByRole('alert').filter({
        hasText: 'Someone else pushed to main while you were saving. Nothing was overwritten.',
      }),
    ).toBeVisible();
    expect(fake.files()[`${Q_DIR}/racing.md`]).toBeUndefined();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('status')).toContainText('Committed racing.md');
    expect(fake.files()['content/roadmaps/dsa-python.md']).toContain('Theirs');
    expect(fake.files()[`${Q_DIR}/racing.md`]).toBeDefined();
  });

  test('leaving with unsaved changes asks first; drafts survive a reload', async ({ page }) => {
    await signedIn(page);
    await newQuestion(page, 'Half written');
    await expect(page.getByText(/Draft saved in this browser/)).toBeVisible();

    await page.getByRole('button', { name: 'Back to the list' }).click();
    await expect(page.getByText('You have unsaved changes.')).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Half written');

    await page.reload();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.getByText(/Restored your draft from/)).toBeVisible();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Half written');

    await page.getByRole('button', { name: 'Back to the list' }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Interview Questions' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
  });

  test('a rejected token sends you to sign-in and keeps the draft', async ({ page }) => {
    const fake = await signedIn(page);
    await newQuestion(page, 'Kept draft');
    await expect(page.getByText(/Draft saved in this browser/)).toBeVisible();
    fake.token = 'github_pat_rotated';
    await commitButton(page).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(
      page.getByRole('alert').filter({ hasText: 'GitHub rejected the token' }),
    ).toBeVisible();
    const drafts = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.startsWith('parth-notes:admin:draft:')),
    );
    expect(drafts).toHaveLength(1);
  });

  test('creates a course with its first chapter', async ({ page }) => {
    const fake = await signedIn(page);
    await page.getByRole('button', { name: /^Learning Notes/ }).click();
    await expect(page.getByText('DSA with Python has no courses yet.')).toBeVisible();
    await page.getByRole('button', { name: 'New course' }).click();
    await page.getByLabel('New course name').fill('Arrays');
    await page.getByLabel('Title', { exact: true }).fill('Two Sum');
    const panel = page.getByRole('complementary', { name: 'Commit' });
    await expect(panel).toContainText('content/learning-notes/dsa-python/arrays/_course.json');
    await expect(panel).toContainText('content/learning-notes/dsa-python/arrays/two-sum.md');
    await commitButton(page).click();
    await expect(page.getByRole('status')).toContainText('Committed two-sum.md');
    await expect.poll(() => fake.commitsCreated).toBe(1);
    expect(
      JSON.parse(fake.files()['content/learning-notes/dsa-python/arrays/_course.json'] as string),
    ).toMatchObject({
      title: 'Arrays',
      order: ['two-sum.md'],
    });
    await expect(page.getByLabel('Course')).toHaveValue('arrays');
    await expect(page.getByRole('listitem').filter({ hasText: 'two-sum.md' })).toContainText(
      'Two Sum',
    );
  });
});
