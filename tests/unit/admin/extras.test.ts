import { afterEach, describe, expect, it, vi } from 'vitest';
import { allPass } from '@/lib/admin/checks';
import { fromEditorDoc, toEditorDoc } from '@/lib/admin/document';
import { loadDraft, removeDraft, saveDraft, type Draft } from '@/lib/admin/drafts';
import { assetName, imageMarkdown, prepareImage, sanitizeSvg, svgSize } from '@/lib/admin/images';
import { describeError } from '@/lib/admin/messages';
import {
  chapterOrder,
  planRename,
  planRenameCourse,
  planReorder,
  planRestore,
  planRevert,
  planSave,
  planSaveHtml,
} from '@/lib/admin/plan';
import { storageAvailable } from '@/lib/admin/session';
import { templateFor } from '@/lib/admin/templates';
import { renderMarkdown } from '@/lib/content/markdown/render';
import { createRepoClient } from '@/lib/github/client';
import { textToBytes } from '@/lib/github/encoding';
import { readStorage, writeStorage } from '@/lib/storage';
import { setup, SKELETON, viewOf } from './helpers';

const TODAY = '2026-10-13';
const QUESTION_DIR = 'content/interview-questions/dsa-python';
const COURSE = 'content/learning-notes/dsa-python/arrays';
const COURSE_JSON = `${COURSE}/_course.json`;

/** SKELETON with one Learning Notes course (the track's .gitkeep is gone, as after creating it). */
function withCourse(extra: Record<string, string> = {}): Record<string, string> {
  const files: Record<string, string> = {
    ...SKELETON,
    [COURSE_JSON]: '{"title":"Arrays","description":"","order":["intro.md"],"html":{}}\n',
    [`${COURSE}/intro.md`]: '---\ntitle: Intro\n---\n\nHi\n',
    ...extra,
  };
  delete files['content/learning-notes/dsa-python/.gitkeep'];
  return files;
}

function questionText(title: string, answer: string) {
  return fromEditorDoc(
    'interview-questions',
    {
      title,
      text: templateFor('interview-questions', 'dsa-python').replace(
        'Write the answer here.',
        answer,
      ),
    },
    TODAY,
  );
}

async function saveQuestion(
  client: Parameters<typeof viewOf>[0],
  title: string,
  answer: string,
  existingPath?: string,
) {
  const { view } = await viewOf(client);
  const plan = await planSave(view, {
    section: 'interview-questions',
    sectionName: 'Interview Questions',
    track: 'dsa-python',
    existingPath,
    title,
    fileText: questionText(title, answer),
  });
  return { plan, result: await client.commit(plan) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HTML upload', () => {
  const page = '<!doctype html><title>Viz</title><p>Bars</p>';

  it('adds an HTML chapter with its metadata in _course.json, in one commit', async () => {
    const { fake, client } = setup(withCourse());
    const { view } = await viewOf(client);
    const plan = await planSaveHtml(view, {
      section: 'learning-notes',
      sectionName: 'Learning Notes',
      track: 'dsa-python',
      course: 'arrays',
      title: 'Array visualiser',
      file: { name: 'viz.html', bytes: textToBytes(page) },
      description: 'Drag the bars.',
      tags: ['arrays', ' visual ', ''],
      today: TODAY,
    });
    expect(allPass(plan.checks)).toBe(true);
    expect(plan.message).toBe('docs(learning-notes): add array-visualiser.html');
    expect(plan.rows).toEqual([
      { status: 'A', path: `${COURSE}/array-visualiser.html`, size: page.length },
      { status: 'M', path: COURSE_JSON, size: expect.any(Number) },
    ]);
    await client.commit(plan);

    expect(fake.commitsCreated).toBe(1);
    const files = fake.files();
    expect(files[`${COURSE}/array-visualiser.html`]).toBe(page);
    expect(JSON.parse(files[COURSE_JSON] as string)).toEqual({
      title: 'Arrays',
      description: '',
      order: ['intro.md', 'array-visualiser.html'],
      html: {
        'array-visualiser.html': {
          title: 'Array visualiser',
          description: 'Drag the bars.',
          tags: ['arrays', 'visual'],
          updated: TODAY,
        },
      },
    });
  });

  it('replaces the file of an HTML chapter and updates its date, keeping the name', async () => {
    const path = `${COURSE}/viz.html`;
    const { fake, client } = setup(
      withCourse({
        [COURSE_JSON]: JSON.stringify({
          title: 'Arrays',
          order: ['intro.md', 'viz.html'],
          html: {
            'viz.html': { title: 'Viz', description: 'Old', tags: [], updated: '2026-01-01' },
          },
        }),
        [path]: page,
      }),
    );
    const { view } = await viewOf(client);
    const next = '<!doctype html><title>Viz 2</title>';
    const plan = await planSaveHtml(view, {
      section: 'learning-notes',
      sectionName: 'Learning Notes',
      track: 'dsa-python',
      course: 'arrays',
      existingPath: path,
      title: 'Viz',
      file: { name: 'Something Else.HTM', bytes: textToBytes(next) },
      description: 'New',
      tags: ['x'],
      today: TODAY,
    });
    expect(allPass(plan.checks)).toBe(true);
    expect(plan.message).toBe('docs(learning-notes): update viz.html');
    expect(plan.rows.map((r) => [r.status, r.path])).toEqual([
      ['M', path],
      ['M', COURSE_JSON],
    ]);
    await client.commit(plan);
    expect(fake.commitsCreated).toBe(1);
    expect(fake.files()[path]).toBe(next);
    expect(JSON.parse(fake.files()[COURSE_JSON] as string).html['viz.html']).toEqual({
      title: 'Viz',
      description: 'New',
      tags: ['x'],
      updated: TODAY,
    });
  });

  it('uploads an HTML mind map and removes the folder placeholder', async () => {
    const { fake, client } = setup();
    const { view } = await viewOf(client);
    const plan = await planSaveHtml(view, {
      section: 'mind-maps',
      sectionName: 'Mind Maps',
      track: 'dsa-python',
      title: 'Graph map',
      file: { name: 'map.html', bytes: textToBytes(page) },
      description: '',
      tags: [],
      today: TODAY,
    });
    expect(plan.rows.map((r) => [r.status, r.path])).toEqual([
      ['A', 'content/mind-maps/dsa-python/graph-map.html'],
      ['D', 'content/mind-maps/dsa-python/.gitkeep'],
    ]);
    await client.commit(plan);
    expect(fake.commitsCreated).toBe(1);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith('content/mind-maps/'))).toEqual([
      'content/mind-maps/dsa-python/graph-map.html',
    ]);
  });

  it('accepts only .html and .htm files, of any size', async () => {
    const { client } = setup();
    const { view } = await viewOf(client);
    const input = {
      section: 'cheat-sheets' as const,
      sectionName: 'Cheat Sheets',
      track: 'dsa-python',
      title: 'Big sheet',
      description: '',
      tags: [],
      today: TODAY,
    };
    const pdf = await planSaveHtml(view, {
      ...input,
      file: { name: 'sheet.pdf', bytes: textToBytes('%PDF') },
    });
    expect(pdf.checks.find((c) => c.id === 'html-file')).toMatchObject({
      ok: false,
      detail: '"sheet.pdf" is not an HTML file',
    });
    const none = await planSaveHtml(view, input);
    expect(none.checks.find((c) => c.id === 'html-file')).toMatchObject({ ok: false });

    const big = new Uint8Array(3 * 1024 * 1024).fill(97);
    const large = await planSaveHtml(view, { ...input, file: { name: 'big.htm', bytes: big } });
    expect(allPass(large.checks)).toBe(true);
    expect(large.rows[0]).toMatchObject({ status: 'A', size: big.length });
  });
});

describe('images', () => {
  it('writes uploaded images to assets/ in the same commit as the text', async () => {
    const { fake, client } = setup(withCourse());
    const { view } = await viewOf(client);
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0xff, 0x80, 0x01]);
    const line = imageMarkdown('Diagram', 'assets/diagram.webp', 800, 600);
    const plan = await planSave(view, {
      section: 'learning-notes',
      sectionName: 'Learning Notes',
      track: 'dsa-python',
      course: 'arrays',
      existingPath: `${COURSE}/intro.md`,
      title: 'Intro',
      fileText: fromEditorDoc('learning-notes', { title: 'Intro', text: `Hi\n\n${line}\n` }, TODAY),
      assets: [{ name: 'diagram.webp', bytes: webp }],
    });
    expect(plan.rows).toEqual([
      { status: 'M', path: `${COURSE}/intro.md`, size: expect.any(Number) },
      { status: 'A', path: `${COURSE}/assets/diagram.webp`, size: webp.length },
    ]);
    await client.commit(plan);
    expect(fake.commitsCreated).toBe(1);
    expect([...(fake.bytesOf(`${COURSE}/assets/diagram.webp`) ?? [])]).toEqual([...webp]);
    expect(fake.files()[`${COURSE}/intro.md`]).toContain(
      '![Diagram](assets/diagram.webp "800x600")',
    );
  });

  it('renders the inserted line with width and height', async () => {
    const { html } = await renderMarkdown(
      imageMarkdown('A [weird] alt', 'assets/a.webp', 640, 360),
    );
    expect(imageMarkdown('A [weird] alt', 'assets/a.webp', 640, 360)).toBe(
      '![A weird alt](assets/a.webp "640x360")',
    );
    expect(html).toContain('width="640"');
    expect(html).toContain('height="360"');
    expect(html).not.toContain('title=');
  });

  it('strips scripts, event attributes and javascript: URLs from SVGs', () => {
    const dirty = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE svg [<!ENTITY boom "x">]>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" onload="alert(1)">',
      '<script type="text/javascript">alert(2)</script><script href="x.js"/>',
      '<foreignObject><iframe src="https://example.com"></iframe></foreignObject>',
      '<a href="javascript:alert(3)"><rect width="10" height="10" onclick=\'steal()\'/></a>',
      '<a xlink:href=" JaVaScRiPt:alert(4)">x</a>',
      '<set attributeName="href" to="javascript:alert(5)"/>',
      '<circle r="5" fill="red"/>',
      '</svg>',
    ].join('');
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(
      /script|onload|onclick|alert|steal|foreignObject|iframe|ENTITY|<set/i,
    );
    expect(clean).toContain('<rect width="10" height="10"/>');
    expect(clean).toContain('<circle r="5" fill="red"/>');
    expect(clean).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">');
  });

  it('reads the SVG size from its attributes or viewBox', () => {
    expect(svgSize('<svg width="120" height="80">')).toEqual({ width: 120, height: 80 });
    expect(svgSize('<svg viewBox="0 0 300 150">')).toEqual({ width: 300, height: 150 });
    expect(svgSize('<svg width="600px" viewBox="0 0 300 150">')).toEqual({
      width: 600,
      height: 300,
    });
    expect(svgSize('<svg width="50%" height="2em">')).toEqual({ width: 800, height: 600 });
  });

  it('names assets from the file name and numbers duplicates', () => {
    expect(assetName('My Diagram.PNG', '.webp', new Set())).toBe('my-diagram.webp');
    expect(assetName('My Diagram.png', '.webp', new Set(['my-diagram']))).toBe('my-diagram-2.webp');
    expect(assetName('###.gif', '.webp', new Set())).toBe('image.webp');
  });

  it('prepares an SVG upload sanitised, and refuses other file types', async () => {
    const svg = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" onload="x()"><path d="M0 0"/></svg>',
      ],
      'Logo Mark.svg',
      { type: 'image/svg+xml' },
    );
    const image = await prepareImage(svg, new Set());
    expect(image).toMatchObject({ name: 'logo-mark.svg', width: 40, height: 20 });
    expect(new TextDecoder().decode(image.bytes)).not.toContain('onload');
    await expect(prepareImage(new File(['x'], 'notes.txt'), new Set())).rejects.toThrow(
      '"notes.txt" is not a supported image (png, jpg, webp, gif or svg).',
    );
  });
});

describe('history and restore', () => {
  it('lists the commits of one file and restores an older version as a new commit', async () => {
    const { fake, client } = setup();
    const { plan: created } = await saveQuestion(client, 'What is a closure?', 'The first answer.');
    await saveQuestion(client, 'What is a closure?', 'A worse answer.', created.path);

    const { commits } = await client.listCommits({ path: created.path });
    expect(commits.map((c) => c.message)).toEqual([
      'docs(interview-questions): update what-is-a-closure.md',
      'docs(interview-questions): add what-is-a-closure.md',
    ]);
    const older = commits[1]!;
    const old = (await client.treeAt(older.sha)).get(created.path)!;
    const { view } = await viewOf(client);
    const today = '2026-10-20';
    const text = fromEditorDoc(
      'interview-questions',
      toEditorDoc('interview-questions', await client.readText(old.sha)),
      today,
    );
    const plan = await planRestore(view, {
      section: 'interview-questions',
      path: created.path,
      sha: old.sha,
      text,
      from: older.sha.slice(0, 7),
      today,
    });
    expect(allPass(plan.checks)).toBe(true);
    expect(plan.message).toBe(
      `docs(interview-questions): restore what-is-a-closure.md from ${older.sha.slice(0, 7)}`,
    );
    expect(plan.rows).toEqual([{ status: 'M', path: created.path, size: expect.any(Number) }]);
    await client.commit(plan);

    expect(fake.commitsCreated).toBe(3);
    const restored = fake.files()[created.path];
    expect(restored).toContain('The first answer.');
    expect(restored).not.toContain('A worse answer.');
    expect(restored).toContain("updated: '2026-10-20'");
  });

  it('refuses to "restore" the version that is already current', async () => {
    const { client } = setup();
    const { plan: created } = await saveQuestion(client, 'Same', 'Answer');
    const { view } = await viewOf(client);
    const plan = await planRestore(view, {
      section: 'interview-questions',
      path: created.path,
      sha: view.files.get(created.path)!.sha,
      from: 'abc1234',
      today: TODAY,
    });
    expect(plan.checks).toEqual([expect.objectContaining({ id: 'different', ok: false })]);
  });

  it('restores an HTML chapter byte for byte and updates its date in _course.json', async () => {
    const path = `${COURSE}/viz.html`;
    const { fake, client } = setup(
      withCourse({
        [COURSE_JSON]: JSON.stringify({
          title: 'Arrays',
          order: ['intro.md', 'viz.html'],
          html: { 'viz.html': { title: 'Viz', description: 'D', tags: [], updated: '2026-01-01' } },
        }),
        [path]: '<p>version 1</p>',
      }),
    );
    const v1 = fake.blobShaOf(path)!;
    fake.externalPush({ [path]: '<p>version 2</p>' }, 'docs(learning-notes): update viz.html');
    const { view } = await viewOf(client);
    const plan = await planRestore(view, {
      section: 'learning-notes',
      path,
      sha: v1,
      from: 'abc1234',
      today: TODAY,
    });
    expect(plan.rows.map((r) => [r.status, r.path])).toEqual([
      ['M', path],
      ['M', COURSE_JSON],
    ]);
    const uploadsBefore = fake.requests.filter(
      (r) => r.method === 'POST' && r.path.endsWith('/git/blobs'),
    ).length;
    await client.commit(plan);

    expect(fake.commitsCreated).toBe(1);
    expect(fake.blobShaOf(path)).toBe(v1);
    // Only _course.json was uploaded; the old HTML blob is reused.
    expect(
      fake.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/git/blobs')).length -
        uploadsBefore,
    ).toBe(1);
    expect(JSON.parse(fake.files()[COURSE_JSON] as string).html['viz.html']).toEqual({
      title: 'Viz',
      description: 'D',
      tags: [],
      updated: TODAY,
    });
  });

  it('leaves _course.json alone for an HTML chapter without metadata', async () => {
    const path = `${COURSE}/bare.html`;
    const { fake, client } = setup(withCourse({ [path]: '<p>version 1</p>' }));
    const v1 = fake.blobShaOf(path)!;
    fake.externalPush({ [path]: '<p>version 2</p>' });
    const { view } = await viewOf(client);
    const plan = await planRestore(view, {
      section: 'learning-notes',
      path,
      sha: v1,
      from: 'abc1234',
      today: TODAY,
    });
    expect(plan.rows.map((r) => [r.status, r.path])).toEqual([['M', path]]);
    await client.commit(plan);
    expect(fake.blobShaOf(path)).toBe(v1);
  });
});

describe('activity and revert', () => {
  const TWO = `${COURSE}/two-pointers.md`;
  const files = withCourse({
    [COURSE_JSON]: '{"title":"Arrays","order":["intro.md","two-pointers.md"],"html":{}}\n',
    [`${COURSE}/intro.md`]:
      '---\ntitle: Intro\n---\n\nNext: [pointers](/learning-notes/dsa-python/arrays/two-pointers).\n',
    [TWO]: '---\ntitle: Two pointers\n---\n\nBody\n',
  });

  async function renameTwoPointers(client: Parameters<typeof viewOf>[0]) {
    const { view } = await viewOf(client);
    const { findBrokenLinkFixes } = await import('@/lib/admin/plan');
    const to = `${COURSE}/two-pointer-technique.md`;
    return client.commit(
      await planRename(view, {
        section: 'learning-notes',
        track: 'dsa-python',
        course: 'arrays',
        path: TWO,
        newName: 'Two pointer technique',
        linkFixes: (await findBrokenLinkFixes(view, TWO, to)).fixes,
      }),
    );
  }

  it('lists content commits page by page and counts them', async () => {
    const { client } = setup();
    await saveQuestion(client, 'One', 'A');
    await saveQuestion(client, 'Two', 'B');
    await saveQuestion(client, 'Three', 'C');
    // Three admin commits plus the initial commit that created content/.
    expect(await client.countCommits('content')).toBe(4);
    const first = await client.listCommits({ path: 'content', perPage: 2 });
    expect(first.commits.map((c) => c.message)).toEqual([
      'docs(interview-questions): add three.md',
      'docs(interview-questions): add two.md',
    ]);
    expect(first.hasMore).toBe(true);
    const second = await client.listCommits({ path: 'content', perPage: 2, page: 2 });
    expect(second.commits).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    // The section filter.
    expect((await client.listCommits({ path: 'content/roadmaps' })).commits).toHaveLength(1);
    expect((await client.listCommits({ path: QUESTION_DIR })).commits).toHaveLength(4);
  });

  it('reports the files of a commit with their status', async () => {
    const { client } = setup(files);
    const renamed = await renameTwoPointers(client);
    const detail = await client.commitDetail(renamed.commitSha);
    expect(detail.message).toBe(
      'docs(learning-notes): rename two-pointers.md to two-pointer-technique.md',
    );
    expect(detail.files).toEqual([
      { path: COURSE_JSON, status: 'modified', sha: expect.any(String) },
      { path: `${COURSE}/intro.md`, status: 'modified', sha: expect.any(String) },
      {
        path: `${COURSE}/two-pointer-technique.md`,
        status: 'renamed',
        previousPath: TWO,
        sha: expect.any(String),
      },
    ]);
  });

  it('reverts a commit with one new commit that restores the parent versions', async () => {
    const { fake, client } = setup(files);
    const before = fake.files();
    const renamed = await renameTwoPointers(client);
    const detail = await client.commitDetail(renamed.commitSha);
    const parent = await client.treeAt(detail.parents[0]!);
    const { view } = await viewOf(client);
    const plan = planRevert(view, detail, parent);
    expect(allPass(plan.checks)).toBe(true);
    expect(plan.message).toBe(
      'Revert "docs(learning-notes): rename two-pointers.md to two-pointer-technique.md"',
    );
    await client.commit(plan);
    expect(fake.commitsCreated).toBe(2);
    expect(fake.files()).toEqual(before);
  });

  it('never overwrites a file that changed after the reverted commit', async () => {
    const { fake, client } = setup(files);
    const renamed = await renameTwoPointers(client);
    fake.externalPush({ [`${COURSE}/intro.md`]: '---\ntitle: Intro\n---\n\nRewritten\n' });
    const detail = await client.commitDetail(renamed.commitSha);
    const parent = await client.treeAt(detail.parents[0]!);
    const { view } = await viewOf(client);
    const error = await client.commit(planRevert(view, detail, parent)).catch((e: unknown) => e);
    expect(error).toMatchObject({
      kind: 'conflict',
      details: { reason: 'changed', paths: [`${COURSE}/intro.md`] },
    });
    expect(fake.commitsCreated).toBe(1);
    expect(fake.files()[`${COURSE}/intro.md`]).toContain('Rewritten');
  });

  it('reverts only content files', async () => {
    const { fake, client } = setup();
    fake.externalPush(
      { 'README.md': '# changed\n', [`${QUESTION_DIR}/q.md`]: '---\nquestion: Q\n---\n\nA\n' },
      'Mixed change',
    );
    const detail = await client.commitDetail(fake.headSha);
    const parent = await client.treeAt(detail.parents[0]!);
    const { view } = await viewOf(client);
    const plan = planRevert(view, detail, parent);
    expect(plan.rows.map((r) => [r.status, r.path])).toEqual([['D', `${QUESTION_DIR}/q.md`]]);
    await client.commit(plan);
    expect(fake.files()['README.md']).toBe('# changed\n');
    expect(fake.files()[`${QUESTION_DIR}/q.md`]).toBeUndefined();
  });
});

describe('site status', () => {
  it('reads commit statuses and deployments, skipping what the token cannot see', async () => {
    const { fake, client } = setup();
    const sha = fake.headSha;
    // Nothing reported (check runs answer 403 for this token).
    expect(await client.siteStatus(sha)).toBe('unknown');
    fake.commitStatuses.set(sha, 'pending');
    expect(await client.siteStatus(sha)).toBe('building');
    fake.commitStatuses.set(sha, 'success');
    expect(await client.siteStatus(sha)).toBe('live');
    fake.deployments.set(sha, 'failure');
    expect(await client.siteStatus(sha)).toBe('failed');
  });
});

describe('chapter order', () => {
  const files = withCourse({
    [COURSE_JSON]: '{"title":"Arrays","order":["intro.md","two-sum.md"],"html":{}}\n',
    [`${COURSE}/two-sum.md`]: '---\ntitle: Two Sum\n---\n\nBody\n',
    [`${COURSE}/sliding-window.md`]: '---\ntitle: Sliding window\n---\n\nBody\n',
  });

  it('lists the saved order first, then chapters it does not mention', async () => {
    const { client } = setup(files);
    const { view } = await viewOf(client);
    expect(await chapterOrder(view, 'dsa-python', 'arrays')).toEqual([
      'intro.md',
      'two-sum.md',
      'sliding-window.md',
    ]);
  });

  it('saves a new order to _course.json in one commit', async () => {
    const { fake, client } = setup(files);
    const before = fake.files();
    const { view } = await viewOf(client);
    const order = ['sliding-window.md', 'intro.md', 'two-sum.md'];
    const plan = await planReorder(view, { track: 'dsa-python', course: 'arrays', order });
    expect(allPass(plan.checks)).toBe(true);
    expect(plan.message).toBe('docs(learning-notes): reorder arrays');
    expect(plan.rows).toEqual([{ status: 'M', path: COURSE_JSON, size: expect.any(Number) }]);
    await client.commit(plan);
    expect(fake.commitsCreated).toBe(1);
    const after = fake.files();
    expect(JSON.parse(after[COURSE_JSON] as string).order).toEqual(order);
    expect({ ...after, [COURSE_JSON]: '' }).toEqual({ ...before, [COURSE_JSON]: '' });
  });

  it('refuses an order that drops or repeats a chapter', async () => {
    const { client } = setup(files);
    const { view } = await viewOf(client);
    for (const order of [
      ['intro.md', 'two-sum.md'],
      ['intro.md', 'intro.md', 'two-sum.md'],
    ]) {
      const plan = await planReorder(view, { track: 'dsa-python', course: 'arrays', order });
      expect(plan.checks[0]).toMatchObject({ id: 'order', ok: false });
      expect(plan.changes).toEqual([]);
    }
  });
});

describe('rename a course', () => {
  const NEW = 'content/learning-notes/dsa-python/arrays-and-hashing';
  const files = withCourse({
    [COURSE_JSON]:
      '{"title":"Arrays","description":"","order":["intro.md","two-sum.md"],"html":{}}\n',
    [`${COURSE}/intro.md`]:
      '---\ntitle: Intro\n---\n\nNext: [Two Sum](/learning-notes/dsa-python/arrays/two-sum#idea).\n',
    [`${COURSE}/two-sum.md`]: '---\ntitle: Two Sum\n---\n\nBody\n',
    [`${COURSE}/assets/diagram.svg`]: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'content/roadmaps/dsa-python.md':
      '---\ntitle: R\n---\n\n1. **Arrays** - Read [the course](/learning-notes/dsa-python/arrays) and [Two Sum](/learning-notes/dsa-python/arrays/two-sum).\n',
  });

  it('moves the folder, its links and its title in one commit', async () => {
    const { fake, client } = setup(files);
    const twoSumSha = fake.blobShaOf(`${COURSE}/two-sum.md`);
    const svgSha = fake.blobShaOf(`${COURSE}/assets/diagram.svg`);
    const { view } = await viewOf(client);
    const plan = await planRenameCourse(view, {
      track: 'dsa-python',
      course: 'arrays',
      newName: 'Arrays and Hashing',
      setTitle: true,
    });
    expect(allPass(plan.checks)).toBe(true);
    expect(plan.message).toBe('docs(learning-notes): rename course arrays to arrays-and-hashing');
    expect(plan.path).toBe(NEW);
    await client.commit(plan);

    expect(fake.commitsCreated).toBe(1);
    const after = fake.files();
    expect(Object.keys(after).filter((p) => p.startsWith(`${COURSE}/`))).toEqual([]);
    expect(
      Object.keys(after)
        .filter((p) => p.startsWith(`${NEW}/`))
        .sort(),
    ).toEqual([
      `${NEW}/_course.json`,
      `${NEW}/assets/diagram.svg`,
      `${NEW}/intro.md`,
      `${NEW}/two-sum.md`,
    ]);
    expect(JSON.parse(after[`${NEW}/_course.json`] as string)).toMatchObject({
      title: 'Arrays and Hashing',
      order: ['intro.md', 'two-sum.md'],
    });
    expect(after[`${NEW}/intro.md`]).toContain(
      '[Two Sum](/learning-notes/dsa-python/arrays-and-hashing/two-sum#idea)',
    );
    expect(after['content/roadmaps/dsa-python.md']).toContain(
      '[the course](/learning-notes/dsa-python/arrays-and-hashing) and [Two Sum](/learning-notes/dsa-python/arrays-and-hashing/two-sum)',
    );
    // Unchanged files are moved, not uploaded again.
    expect(fake.blobShaOf(`${NEW}/two-sum.md`)).toBe(twoSumSha);
    expect(fake.blobShaOf(`${NEW}/assets/diagram.svg`)).toBe(svgSha);
  });

  it('keeps the title when asked, and changes only the title when the folder stays', async () => {
    const { fake, client } = setup(files);
    const { view } = await viewOf(client);
    const keepTitle = await planRenameCourse(view, {
      track: 'dsa-python',
      course: 'arrays',
      newName: 'Arrays and Hashing',
      setTitle: false,
    });
    expect(keepTitle.changes.find((c) => c.path === `${NEW}/_course.json`)).toMatchObject({
      action: 'copy',
    });

    const titleOnly = await planRenameCourse(view, {
      track: 'dsa-python',
      course: 'arrays',
      newName: 'ARRAYS',
      setTitle: true,
    });
    expect(titleOnly.rows).toEqual([{ status: 'M', path: COURSE_JSON, size: expect.any(Number) }]);
    await client.commit(titleOnly);
    expect(JSON.parse(fake.files()[COURSE_JSON] as string).title).toBe('ARRAYS');

    const { view: latest } = await viewOf(client);
    const nothing = await planRenameCourse(latest, {
      track: 'dsa-python',
      course: 'arrays',
      newName: 'ARRAYS',
      setTitle: true,
    });
    expect(nothing.checks.find((c) => c.id === 'changed')?.ok).toBe(false);
  });

  it('blocks a name another course already uses', async () => {
    const { client } = setup({
      ...files,
      'content/learning-notes/dsa-python/graphs/_course.json': '{"title":"Graphs","order":[]}\n',
    });
    const { view } = await viewOf(client);
    const plan = await planRenameCourse(view, {
      track: 'dsa-python',
      course: 'arrays',
      newName: 'Graphs',
      setTitle: true,
    });
    expect(plan.checks.find((c) => c.id === 'unique')).toMatchObject({
      ok: false,
      detail: 'A course named "graphs" already exists. Try "graphs-2".',
    });
    expect(plan.changes).toEqual([]);
  });
});

describe('errors keep the draft', () => {
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

  it('reports when the rate limit resets, without retrying or committing', async () => {
    const { fake, client } = setup();
    const { view } = await viewOf(client);
    const plan = await planSave(view, {
      section: 'interview-questions',
      sectionName: 'Interview Questions',
      track: 'dsa-python',
      title: 'Limited',
      fileText: questionText('Limited', 'A'),
    });
    const reset = Math.floor(Date.UTC(2026, 9, 13, 15, 45) / 1000);
    fake.intercept = (method, path) =>
      method === 'GET' && path.includes('/git/ref/')
        ? new Response('{"message":"API rate limit exceeded"}', {
            status: 403,
            headers: {
              'content-type': 'application/json',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(reset),
            },
          })
        : undefined;
    const refReadsBefore = fake.requests.filter((r) => r.path.includes('/git/ref/')).length;
    const error = await client.commit(plan).catch((e: unknown) => e);
    expect(error).toMatchObject({
      kind: 'rate-limit',
      details: { resetAt: new Date(reset * 1000) },
    });
    expect(describeError(error)).toBe(
      `GitHub's rate limit is used up. It resets at ${clock.format(new Date(reset * 1000))}. Your draft is kept.`,
    );
    // Not retried: the limit will not reset in the next few seconds.
    expect(fake.requests.filter((r) => r.path.includes('/git/ref/')).length - refReadsBefore).toBe(
      1,
    );
    expect(fake.commitsCreated).toBe(0);
  });

  it('says the draft is safe when the browser is offline, without sending anything', async () => {
    const { fake, client } = setup();
    vi.stubGlobal('navigator', { onLine: false });
    const error = await client.snapshot().catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'offline' });
    expect(describeError(error)).toBe("You're offline, your draft is safe");
    expect(fake.requests).toHaveLength(0);
  });

  it('reports a network failure after the retries', async () => {
    let calls = 0;
    const broken = createRepoClient({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      token: 'github_pat_x',
      fetch: async () => {
        calls++;
        throw new TypeError('Failed to fetch');
      },
      sleep: async () => {},
    });
    const error = await broken.snapshot().catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'network' });
    expect(calls).toBe(4);
    expect(describeError(error)).toBe(
      'Could not reach GitHub. Your draft is kept; try again in a moment.',
    );
  });

  it('explains in plain words when GitHub refuses a file', async () => {
    const { fake, client } = setup();
    fake.intercept = (method, path) =>
      method === 'POST' && path.endsWith('/git/blobs')
        ? new Response(
            JSON.stringify({
              message: 'File too large',
              errors: [{ message: 'this file is larger than 100 MB' }],
            }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          )
        : undefined;
    const { view } = await viewOf(client);
    const plan = await planSaveHtml(view, {
      section: 'mind-maps',
      sectionName: 'Mind Maps',
      track: 'dsa-python',
      title: 'Huge',
      file: { name: 'huge.html', bytes: textToBytes('<p>pretend this is 120 MB</p>') },
      description: '',
      tags: [],
      today: TODAY,
    });
    const error = await client.commit(plan).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'refused' });
    expect(describeError(error)).toBe(
      'GitHub refused the change: File too large: this file is larger than 100 MB. Your draft is kept.',
    );
    expect(fake.commitsCreated).toBe(0);
    expect(fake.files()['content/mind-maps/dsa-python/huge.html']).toBeUndefined();
  });

  it('treats a token that cannot write as read-only at sign-in', async () => {
    const { fake, client } = setup();
    fake.intercept = (method, path) =>
      method === 'POST' && path.endsWith('/git/blobs')
        ? new Response('{"message":"Resource not accessible by personal access token"}', {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        : undefined;
    expect(await client.verify()).toEqual({ canPush: false, expiresAt: null });
  });
});

describe('browser storage', () => {
  const draft: Draft = {
    title: 'T',
    text: 'Body',
    baseSha: null,
    savedAt: 1,
    images: [{ name: 'a.webp', width: 2, height: 1, base64: 'UklGRg==' }],
  };

  it('keeps drafts with their uploads when storage works', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    expect(storageAvailable()).toBe(true);
    expect(saveDraft('owner/repo@main', 'new:x', draft)).toBe(true);
    expect(loadDraft('owner/repo@main', 'new:x')).toEqual(draft);
    removeDraft('owner/repo@main', 'new:x');
    expect(loadDraft('owner/repo@main', 'new:x')).toBeNull();
  });

  it('reports blocked storage (private mode) instead of throwing', () => {
    const denied = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.stubGlobal('window', {
      localStorage: { getItem: denied, setItem: denied, removeItem: denied },
    });
    expect(storageAvailable()).toBe(false);
    expect(saveDraft('r', 'k', draft)).toBe(false);
    expect(loadDraft('r', 'k')).toBeNull();
    expect(() => removeDraft('r', 'k')).not.toThrow();
    // The public site silently falls back to defaults.
    expect(readStorage('last-track')).toBeNull();
    expect(() => writeStorage('last-track', 'dsa-python')).not.toThrow();
  });

  it('reports a full storage so the editor can keep the text without the uploads', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        },
        removeItem: () => {},
      },
    });
    expect(saveDraft('r', 'k', draft)).toBe(false);
  });
});
