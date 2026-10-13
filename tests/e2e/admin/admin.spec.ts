import { expect, test } from '@playwright/test';
import {
  commitButton,
  expectCommits,
  newQuestion,
  OWNER,
  Q_DIR,
  REPO,
  routeFakeGitHub,
  signedIn,
  SKELETON,
  toast,
  TOKEN,
} from './helpers';

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
    await expect(toast(page)).toContainText('Committed what-is-a-closure.md');
    await expectCommits(fake, 1);
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
    await expect(toast(page)).toContainText('Committed what-is-a-closure.md');
    await expectCommits(fake, 2);
    expect(fake.files()[`${Q_DIR}/what-is-a-closure.md`]).toContain(
      'question: What is a closure in Python?',
    );

    // Rename (inline, with a live preview of the new name)
    await row.getByRole('button', { name: /^Rename/ }).click();
    await page.getByLabel('New name for what-is-a-closure.md').fill('Python closures');
    await expect(page.getByText('→ python-closures.md')).toBeVisible();
    await expect(page.getByText('No other page links here.')).toBeVisible();
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(toast(page)).toContainText('Renamed what-is-a-closure.md to python-closures.md');
    await expectCommits(fake, 3);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith(Q_DIR))).toEqual([
      `${Q_DIR}/python-closures.md`,
    ]);

    // Delete, then Undo
    const renamed = page.getByRole('listitem').filter({ hasText: 'python-closures.md' });
    await renamed.getByRole('button', { name: /^Delete/ }).click();
    const confirm = page.getByRole('group', { name: 'Delete python-closures.md' });
    await expect(confirm).toContainText(`${Q_DIR}/.gitkeep`);
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(toast(page)).toContainText('Deleted python-closures.md');
    await expectCommits(fake, 4);
    expect(fake.files()[`${Q_DIR}/python-closures.md`]).toBeUndefined();
    expect(fake.files()[`${Q_DIR}/.gitkeep`]).toBe('');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(toast(page)).toContainText('Restored python-closures.md');
    await expectCommits(fake, 5);
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
    await expect(toast(page)).toContainText('Committed racing.md');
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
    await expect(toast(page)).toContainText('Committed two-sum.md');
    await expectCommits(fake, 1);
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

test.describe('updates right after a commit', () => {
  test('a delete leaves the list at once, even while GitHub still serves the old head', async ({
    page,
  }) => {
    const fake = await signedIn(page, {
      ...SKELETON,
      [`${Q_DIR}/lagging.md`]: '---\nquestion: Lagging?\ndifficulty: easy\n---\n\nA.\n',
    });
    fake.staleRefReads = 10;
    const row = page.getByRole('listitem').filter({ hasText: 'lagging.md' });
    await row.getByRole('button', { name: /^Delete/ }).click();
    await page
      .getByRole('group', { name: 'Delete lagging.md' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(toast(page)).toContainText('Deleted lagging.md');
    await expect(row).toHaveCount(0);
    await expect(page.getByText('No interview questions for DSA with Python yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Interview Questions/ })).toContainText('0');

    // Undo straight away: no false "someone else pushed" conflict.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(toast(page)).toContainText('Restored lagging.md');
    await expect(row).toHaveCount(1);
    await expectCommits(fake, 2);
  });

  test('deletes a whole course after typing its name, and Undo brings it back', async ({
    page,
  }) => {
    const course = 'content/learning-notes/dsa-python/arrays';
    const files = { ...SKELETON };
    delete files['content/learning-notes/dsa-python/.gitkeep'];
    const fake = await signedIn(page, {
      ...files,
      [`${course}/_course.json`]: '{"title":"Arrays","order":["intro.md"],"html":{}}\n',
      [`${course}/intro.md`]: '---\ntitle: Intro\n---\n\nHi\n',
    });
    await page.getByRole('button', { name: /^Learning Notes/ }).click();
    await expect(page.getByLabel('Course')).toHaveValue('arrays');
    await page.getByRole('button', { name: 'Delete course' }).click();

    const panel = page.getByRole('group', { name: 'Delete the course Arrays' });
    await expect(panel).toContainText(`${course}/_course.json`);
    await expect(panel).toContainText(`${course}/intro.md`);
    const confirm = panel.getByRole('button', { name: 'Delete course' });
    await expect(confirm).toBeDisabled();
    await panel.getByLabel('Type the course name, Arrays, to confirm').fill('Arrays');
    await confirm.click();

    await expect(toast(page)).toContainText('Deleted the course Arrays');
    await expect(page.getByText('DSA with Python has no courses yet.')).toBeVisible();
    await expectCommits(fake, 1);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith(`${course}/`))).toEqual([]);
    expect(fake.files()['content/learning-notes/dsa-python/.gitkeep']).toBe('');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(toast(page)).toContainText('Restored the course Arrays');
    await expect(page.getByLabel('Course')).toHaveValue('arrays');
    await expect(page.getByRole('listitem').filter({ hasText: 'intro.md' })).toBeVisible();
    expect(fake.files()['content/learning-notes/dsa-python/.gitkeep']).toBeUndefined();
  });
});
