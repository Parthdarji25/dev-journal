import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import {
  commitButton,
  expectCommits,
  COURSE,
  draftKeys,
  newQuestion,
  Q_DIR,
  routeFakeGitHub,
  signedIn,
  siteStatus,
  SKELETON,
  toast,
  withCourse,
} from './helpers';

const COURSE_JSON = `${COURSE}/_course.json`;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A real PNG (an RGB gradient) of the given size, built in memory. */
function png(width: number, height: number): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * 3;
      raw[i] = Math.floor((x * 255) / width);
      raw[i + 1] = 128;
      raw[i + 2] = Math.floor((y * 255) / height);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function openCourse(page: Page) {
  await page.getByRole('button', { name: /^Learning Notes/ }).click();
  await expect(page.getByLabel('Course', { exact: true })).toHaveValue('arrays');
}

const chapterRows = (page: Page) =>
  page.getByRole('list', { name: 'Chapters in reading order' }).getByRole('listitem');

/** One question in DSA with Python (its folder placeholder already gone). */
function withQuestion(): Record<string, string> {
  const files: Record<string, string> = {
    ...SKELETON,
    [`${Q_DIR}/q.md`]: '---\nquestion: Q?\ndifficulty: easy\n---\n\nA.\n',
  };
  delete files[`${Q_DIR}/.gitkeep`];
  return files;
}

test.describe('HTML upload, history and restore', () => {
  test('uploads an HTML chapter, replaces it, then restores the first version', async ({
    page,
  }) => {
    const fake = await signedIn(
      page,
      withCourse({
        [COURSE_JSON]: '{"title":"Arrays","description":"","order":["intro.md"],"html":{}}\n',
        [`${COURSE}/intro.md`]: '---\ntitle: Intro\n---\n\nHi\n',
      }),
    );
    await openCourse(page);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const format = page.getByRole('group', { name: 'Format' });
    await format.getByRole('button', { name: 'HTML' }).click();
    await expect(format.getByRole('button', { name: 'HTML' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('Title', { exact: true }).fill('Array visualiser');
    await page.getByLabel('Description').fill('Drag the bars.');
    await page.getByLabel('Tags (comma-separated)').fill('arrays, visual');

    // Only .html and .htm files are taken.
    await page.getByLabel('HTML file').setInputFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7'),
    });
    await expect(
      page.getByRole('alert').filter({ hasText: '"notes.pdf" is not an HTML file.' }),
    ).toBeVisible();

    const v1 = '<!doctype html><title>Viz</title><p>version 1</p>';
    await page.getByLabel('HTML file').setInputFiles({
      name: 'viz.html',
      mimeType: 'text/html',
      buffer: Buffer.from(v1),
    });
    await expect(page.getByText('viz.html', { exact: true })).toBeVisible();
    const panel = page.getByRole('complementary', { name: 'Commit' });
    await expect(panel).toContainText(`${COURSE}/array-visualiser.html`);
    await expect(panel).toContainText(COURSE_JSON);
    await expect(panel).toContainText('1 commit, 2 files written together');
    await commitButton(page).click();
    await expect(toast(page)).toContainText('Committed array-visualiser.html');
    await expectCommits(fake, 1);
    expect(fake.files()[`${COURSE}/array-visualiser.html`]).toBe(v1);
    expect(JSON.parse(fake.files()[COURSE_JSON] as string)).toMatchObject({
      order: ['intro.md', 'array-visualiser.html'],
      html: {
        'array-visualiser.html': {
          title: 'Array visualiser',
          description: 'Drag the bars.',
          tags: ['arrays', 'visual'],
        },
      },
    });

    // Edit replaces the file under the same name: one more commit.
    const row = chapterRows(page).filter({ hasText: 'array-visualiser.html' });
    await expect(row).toContainText('Array visualiser');
    await row.getByRole('button', { name: /^Edit/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit array-visualiser.html' })).toBeVisible();
    await expect(page.getByText('(current file)')).toBeVisible();
    const v2 = '<!doctype html><title>Viz</title><p>version 2</p>';
    await page.getByLabel('HTML file').setInputFiles({
      name: 'whatever.htm',
      mimeType: 'text/html',
      buffer: Buffer.from(v2),
    });
    await commitButton(page).click();
    await expect(toast(page)).toContainText('Committed array-visualiser.html');
    await expectCommits(fake, 2);
    expect(fake.files()[`${COURSE}/array-visualiser.html`]).toBe(v2);

    // History lists both commits; Restore writes the first version as a new commit.
    await row.getByRole('button', { name: /^History/ }).click();
    const history = page.getByRole('group', { name: 'History of array-visualiser.html' });
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(history.getByRole('listitem').first()).toContainText('Current version');
    await expect(history.getByRole('listitem').last()).toContainText(
      'docs(learning-notes): add array-visualiser.html',
    );
    await history.getByRole('button', { name: /^Restore/ }).click();
    await expect(toast(page)).toContainText('Restored array-visualiser.html from');
    await expectCommits(fake, 3);
    expect(fake.files()[`${COURSE}/array-visualiser.html`]).toBe(v1);
    expect(fake.history()[0]?.message).toMatch(
      /^docs\(learning-notes\): restore array-visualiser\.html from [0-9a-f]{7}$/,
    );
  });
});

test.describe('images', () => {
  test('a PNG becomes WebP at most 1600px wide, committed with the text', async ({ page }) => {
    const fake = await signedIn(page);
    await newQuestion(page, 'What does this diagram show?');
    await page.getByLabel('Images to insert').setInputFiles({
      name: 'Big Diagram.png',
      mimeType: 'image/png',
      buffer: png(2000, 500),
    });
    const images = page.getByRole('list', { name: 'Images in this commit' });
    await expect(images).toContainText('assets/big-diagram.webp');
    await expect(images).toContainText('1600×400');
    const line = '![Big Diagram](assets/big-diagram.webp "1600x400")';
    await expect(page.locator('.cm-content')).toContainText(line);

    const panel = page.getByRole('complementary', { name: 'Commit' });
    await expect(panel).toContainText(`${Q_DIR}/assets/big-diagram.webp`);
    await expect(panel).toContainText('1 commit, 3 files written together');
    await page.getByRole('tab', { name: 'Preview' }).click();
    const img = page.locator('.prose-content img');
    await expect(img).toHaveAttribute('width', '1600');
    await expect(img).toHaveAttribute('height', '400');

    await commitButton(page).click();
    await expect(toast(page)).toContainText('Committed what-does-this-diagram-show.md');
    await expectCommits(fake, 1);
    const webp = Buffer.from(fake.bytesOf(`${Q_DIR}/assets/big-diagram.webp`) ?? []);
    expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
    // The image line went into the body; the front-matter is intact.
    const text = fake.files()[`${Q_DIR}/what-does-this-diagram-show.md`] as string;
    expect(text).toMatch(/^---\nquestion: What does this diagram show\?\n/);
    expect(text).toContain(line);
  });
});

test.describe('Activity', () => {
  test('shows the commit just pushed on top with its files, and reverts it in one commit', async ({
    page,
  }) => {
    const fake = await signedIn(page, withQuestion());
    const row = page.getByRole('listitem').filter({ hasText: 'q.md' });
    await row.getByRole('button', { name: /^Delete/ }).click();
    await page
      .getByRole('group', { name: 'Delete q.md' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(toast(page)).toContainText('Deleted q.md');
    await expectCommits(fake, 1);
    const deleted = fake.headSha.slice(0, 7);

    const tab = page.getByRole('tab', { name: /^Activity/ });
    await expect(tab).toHaveAccessibleName(/Activity\s*2\s*commits/);
    await tab.click();
    const panel = page.getByRole('tabpanel', { name: /Activity/ });
    const commits = panel.locator('ol > li');
    await expect(commits).toHaveCount(2);
    const top = commits.first();
    await expect(top).toContainText(deleted);
    await expect(top).toContainText('docs(interview-questions): delete q.md');
    await expect(top).toContainText('Pushed now');
    await expect(top).toContainText('2 files');
    await expect(commits.last()).toContainText('Initial commit');

    await top.getByRole('button', { name: 'Show changes' }).click();
    await expect(top.getByRole('button', { name: 'Hide changes' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(top.getByTitle('removed')).toHaveText(/^D/);
    await expect(top.getByTitle('added')).toHaveText(/^A/);
    await expect(top).toContainText(`${Q_DIR}/q.md`);
    await expect(top).toContainText(`${Q_DIR}/.gitkeep`);

    await top.getByRole('button', { name: 'Revert', exact: true }).click();
    const confirm = page.getByRole('group', { name: `Revert ${deleted}` });
    await expect(confirm).toContainText(`${Q_DIR}/q.md`);
    await confirm.getByRole('button', { name: 'Revert', exact: true }).click();
    await expect(toast(page)).toContainText(`Reverted ${deleted}`);
    await expectCommits(fake, 2);
    expect(fake.files()[`${Q_DIR}/q.md`]).toContain('question: Q?');
    expect(fake.files()[`${Q_DIR}/.gitkeep`]).toBeUndefined();
    expect(fake.history()[0]?.message).toBe('Revert "docs(interview-questions): delete q.md"');
    await expect(commits.first()).toContainText('Revert "docs(interview-questions): delete q.md"');
    await expect(commits.first()).toContainText('Pushed now');
    await expect(panel.getByText('2 commits pushed')).toBeVisible();

    // The section filter.
    await panel.getByLabel('Section').selectOption({ label: 'Mind Maps' });
    await expect(commits).toHaveCount(1);
    await expect(commits.first()).toContainText('Initial commit');

    // The Content tab shows the restored question.
    await page.getByRole('tab', { name: 'Content' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'q.md' })).toBeVisible();
  });

  test('the site status follows the deploy of the latest commit', async ({ page }) => {
    await page.clock.install();
    const fake = await signedIn(page, withQuestion());
    await expect(siteStatus(page)).toContainText('No deploy status');

    const row = page.getByRole('listitem').filter({ hasText: 'q.md' });
    await row.getByRole('button', { name: /^Delete/ }).click();
    await page
      .getByRole('group', { name: 'Delete q.md' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expectCommits(fake, 1);
    // Nothing reported yet right after a push: the host is still building.
    await expect(siteStatus(page)).toContainText('Building...');

    fake.deployments.set(fake.headSha, 'success');
    await page.clock.fastForward(10_000);
    await expect(siteStatus(page)).toContainText('Live');
  });
});

test.describe('courses', () => {
  test('reorders chapters by keyboard and drag-and-drop, saved in one commit', async ({ page }) => {
    const fake = await signedIn(
      page,
      withCourse({
        [COURSE_JSON]:
          '{"title":"Arrays","description":"","order":["intro.md","two-sum.md","sliding-window.md"],"html":{}}\n',
        [`${COURSE}/intro.md`]: '---\ntitle: Intro\n---\n\nHi\n',
        [`${COURSE}/two-sum.md`]: '---\ntitle: Two Sum\n---\n\nBody\n',
        [`${COURSE}/sliding-window.md`]: '---\ntitle: Sliding window\n---\n\nBody\n',
      }),
    );
    await openCourse(page);
    const rows = chapterRows(page);
    await expect(rows).toHaveText([/intro\.md/, /two-sum\.md/, /sliding-window\.md/]);
    await expect(page.getByRole('button', { name: 'Move intro.md up' })).toBeDisabled();

    // Move up, then Reset puts the saved order back.
    await page.getByRole('button', { name: 'Move sliding-window.md up' }).click();
    await expect(rows).toHaveText([/intro\.md/, /sliding-window\.md/, /two-sum\.md/]);
    const bar = page.getByRole('group', { name: 'Chapter order' });
    await bar.getByRole('button', { name: 'Reset' }).click();
    await expect(rows).toHaveText([/intro\.md/, /two-sum\.md/, /sliding-window\.md/]);
    await expect(bar).toHaveCount(0);

    // Keyboard only: focus stays on the moved chapter's arrow.
    await page.getByRole('button', { name: 'Move sliding-window.md up' }).focus();
    await page.keyboard.press('Enter');
    await expect(rows).toHaveText([/intro\.md/, /sliding-window\.md/, /two-sum\.md/]);
    await expect(page.getByRole('button', { name: 'Move sliding-window.md up' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(rows).toHaveText([/sliding-window\.md/, /intro\.md/, /two-sum\.md/]);
    await expect(page.getByText('Moved sliding-window.md to position 1 of 3.')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Move sliding-window.md down' })).toBeFocused();

    // Drag-and-drop: two-sum.md onto the first place.
    await rows
      .filter({ hasText: 'two-sum.md' })
      .dragTo(rows.filter({ hasText: 'sliding-window.md' }));
    await expect(rows).toHaveText([/two-sum\.md/, /sliding-window\.md/, /intro\.md/]);

    await bar.getByRole('button', { name: 'Save order' }).click();
    await expect(toast(page)).toContainText('Saved the chapter order');
    await expectCommits(fake, 1);
    expect(fake.history()[0]?.message).toBe('docs(learning-notes): reorder arrays');
    expect(JSON.parse(fake.files()[COURSE_JSON] as string).order).toEqual([
      'two-sum.md',
      'sliding-window.md',
      'intro.md',
    ]);
    await expect(bar).toHaveCount(0);
    await expect(rows).toHaveText([/two-sum\.md/, /sliding-window\.md/, /intro\.md/]);
  });

  test('renames a course: the folder and its links move in one commit, and Undo moves it back', async ({
    page,
  }) => {
    const NEW = 'content/learning-notes/dsa-python/arrays-and-hashing';
    const fake = await signedIn(
      page,
      withCourse({
        [COURSE_JSON]:
          '{"title":"Arrays","description":"","order":["intro.md","two-sum.md"],"html":{}}\n',
        [`${COURSE}/intro.md`]:
          '---\ntitle: Intro\n---\n\nNext: [Two Sum](/learning-notes/dsa-python/arrays/two-sum).\n',
        [`${COURSE}/two-sum.md`]: '---\ntitle: Two Sum\n---\n\nBody\n',
        'content/roadmaps/dsa-python.md':
          '---\ntitle: R\n---\n\n1. **Arrays** - Read [the course](/learning-notes/dsa-python/arrays).\n',
      }),
    );
    await openCourse(page);
    await page.getByRole('button', { name: 'Rename course' }).click();
    const panel = page.getByRole('group', { name: 'Rename the course Arrays' });
    const name = panel.getByLabel('New course name');
    await expect(name).toHaveValue('Arrays');
    await expect(panel.getByRole('button', { name: 'Rename course' })).toBeDisabled();
    await name.fill('Arrays and Hashing');
    await expect(panel).toContainText(`${COURSE}/ → ${NEW}/`);
    await expect(panel).toContainText('1 link points here and will be updated in the same commit');
    await expect(panel).toContainText('content/roadmaps/dsa-python.md:5');
    await panel.getByRole('button', { name: 'Rename course' }).click();

    await expect(toast(page)).toContainText('Renamed the course to Arrays and Hashing');
    await expectCommits(fake, 1);
    const files = fake.files();
    expect(Object.keys(files).filter((p) => p.startsWith(`${COURSE}/`))).toEqual([]);
    expect(JSON.parse(files[`${NEW}/_course.json`] as string).title).toBe('Arrays and Hashing');
    expect(files[`${NEW}/intro.md`]).toContain(
      '(/learning-notes/dsa-python/arrays-and-hashing/two-sum)',
    );
    expect(files['content/roadmaps/dsa-python.md']).toContain(
      '(/learning-notes/dsa-python/arrays-and-hashing)',
    );
    const course = page.getByLabel('Course', { exact: true });
    await expect(course).toHaveValue('arrays-and-hashing');
    await expect(course.locator('option:checked')).toHaveText('Arrays and Hashing');
    await expect(chapterRows(page)).toHaveCount(2);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(toast(page)).toContainText('Undid the course rename');
    await expectCommits(fake, 2);
    await expect(course).toHaveValue('arrays');
    expect(fake.files()[COURSE_JSON]).toContain('"title":"Arrays"');
    expect(Object.keys(fake.files()).filter((p) => p.startsWith(`${NEW}/`))).toEqual([]);
  });
});

test.describe('errors keep the draft', () => {
  test('rate limit: says when it resets', async ({ page }) => {
    const fake = await signedIn(page);
    await newQuestion(page, 'Limited');
    await expect(page.getByText(/Draft saved in this browser/)).toBeVisible();
    const reset = Math.floor(Date.now() / 1000) + 30 * 60;
    fake.intercept = (method, path) =>
      method === 'GET' && path.endsWith('/git/ref/heads/main')
        ? new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
            status: 403,
            headers: {
              'content-type': 'application/json',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(reset),
            },
          })
        : undefined;
    await commitButton(page).click();
    const time = await page.evaluate(
      (r) =>
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(r * 1000),
        ),
      reset,
    );
    await expect(
      page.getByRole('alert').filter({
        hasText: `GitHub's rate limit is used up. It resets at ${time}. Your draft is kept.`,
      }),
    ).toBeVisible();
    expect(fake.commitsCreated).toBe(0);
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Limited');
    expect(await draftKeys(page)).toHaveLength(1);
  });

  test('offline: says the draft is safe, then commits once back online', async ({
    page,
    context,
  }) => {
    const fake = await signedIn(page);
    await newQuestion(page, 'Offline question');
    await expect(page.getByText(/Draft saved in this browser/)).toBeVisible();
    await context.setOffline(true);
    await expect(
      page.getByRole('alert').filter({ hasText: "You're offline, your draft is safe" }).first(),
    ).toBeVisible();
    await commitButton(page).click();
    const message = page.getByRole('complementary', { name: 'Commit' }).getByRole('alert');
    await expect(message).toContainText("You're offline, your draft is safe");
    await expect(message).toContainText('It will try again when you are back online.');
    expect(fake.commitsCreated).toBe(0);
    expect(await draftKeys(page)).toHaveLength(1);

    await context.setOffline(false);
    await expect(toast(page)).toContainText('Committed offline-question.md');
    await expectCommits(fake, 1);
    expect(await draftKeys(page)).toHaveLength(0);
  });

  test('a file GitHub refuses: its reason in plain words', async ({ page }) => {
    const fake = await signedIn(page);
    await newQuestion(page, 'Too big');
    await expect(page.getByText(/Draft saved in this browser/)).toBeVisible();
    fake.intercept = (method, path) =>
      method === 'POST' && path.endsWith('/git/blobs')
        ? new Response(
            JSON.stringify({
              message: 'File too large',
              errors: [{ message: 'files over 100 MB are not allowed' }],
            }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          )
        : undefined;
    await commitButton(page).click();
    await expect(
      page.getByRole('alert').filter({
        hasText:
          'GitHub refused the change: File too large: files over 100 MB are not allowed. Your draft is kept.',
      }),
    ).toBeVisible();
    expect(fake.commitsCreated).toBe(0);
    expect(await draftKeys(page)).toHaveLength(1);
  });

  test('blocked storage (private mode): the admin explains, the public site still works', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    await routeFakeGitHub(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Browser storage is blocked' })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'keeps your sign-in and your drafts' }),
    ).toBeVisible();

    await page.goto('/admin/login');
    await expect(page.getByText('Sign-in and drafts need browser storage')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
