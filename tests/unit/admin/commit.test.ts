import { describe, expect, it } from 'vitest';
import { allPass } from '@/lib/admin/checks';
import { fromEditorDoc } from '@/lib/admin/document';
import { describeError } from '@/lib/admin/messages';
import { findBrokenLinkFixes, planDelete, planRename, planSave, planUndo } from '@/lib/admin/plan';
import { templateFor } from '@/lib/admin/templates';
import { GitHubError } from '@/lib/github/errors';
import { setup, SKELETON, TOKEN, viewOf } from './helpers';

const TODAY = '2026-10-13';
const QUESTION_DIR = 'content/interview-questions/dsa-python';

function questionText(title: string, answer = 'An answer.') {
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

async function createQuestion(client: Parameters<typeof viewOf>[0], title: string) {
  const { view } = await viewOf(client);
  const plan = await planSave(view, {
    section: 'interview-questions',
    sectionName: 'Interview Questions',
    track: 'dsa-python',
    title,
    fileText: questionText(title),
  });
  return { plan, result: await client.commit(plan) };
}

describe('verify', () => {
  it('reports push access and the token expiry', async () => {
    const { client } = setup(SKELETON, { tokenExpiration: '2026-12-31 00:00:00 UTC' });
    expect(await client.verify()).toEqual({ canPush: true, expiresAt: '2026-12-31T00:00:00.000Z' });
  });

  it('reports read-only tokens and missing expiry headers', async () => {
    const { client } = setup(SKELETON, { canPush: false });
    expect(await client.verify()).toEqual({ canPush: false, expiresAt: null });
  });

  it('turns a 401 into an auth error with a plain message', async () => {
    const { fake } = setup();
    const { createRepoClient } = await import('@/lib/github/client');
    const wrong = createRepoClient({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      token: 'github_pat_wrong',
      fetch: fake.fetch,
    });
    const error = await wrong.verify().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).kind).toBe('auth');
    expect(describeError(error)).toMatch(/Sign in again; your draft is kept/);
  });
});

describe('create', () => {
  it('writes one commit with the new file and removes the folder placeholder', async () => {
    const { fake, client } = setup();
    const { plan } = await createQuestion(client, 'What is a closure?');

    expect(fake.commitsCreated).toBe(1);
    expect(fake.history()).toEqual([
      { sha: fake.headSha, message: 'docs(interview-questions): add what-is-a-closure.md' },
    ]);
    const files = fake.files();
    const written = plan.changes.find((c) => c.path === plan.path);
    expect(written?.action === 'write' ? written.content : null).toBe(files[plan.path]);
    expect(files[`${QUESTION_DIR}/what-is-a-closure.md`]).toContain(
      'question: What is a closure?\n',
    );
    expect(files[`${QUESTION_DIR}/what-is-a-closure.md`]).toContain("updated: '2026-10-13'");
    expect(files[`${QUESTION_DIR}/.gitkeep`]).toBeUndefined();
    expect(plan.rows).toEqual([
      { status: 'A', path: `${QUESTION_DIR}/what-is-a-closure.md`, size: expect.any(Number) },
      { status: 'D', path: `${QUESTION_DIR}/.gitkeep` },
    ]);
    // Nothing else changed.
    expect(Object.keys(files).sort()).toEqual(
      [
        ...Object.keys(SKELETON).filter((p) => p !== `${QUESTION_DIR}/.gitkeep`),
        `${QUESTION_DIR}/what-is-a-closure.md`,
      ].sort(),
    );
  });

  it('blocks a duplicate file name and offers a numbered alternative', async () => {
    const { client } = setup();
    await createQuestion(client, 'What is a closure?');
    const { view } = await viewOf(client);
    const plan = await planSave(view, {
      section: 'interview-questions',
      sectionName: 'Interview Questions',
      track: 'dsa-python',
      title: 'What is a closure!',
      fileText: questionText('What is a closure!'),
    });
    const unique = plan.checks.find((c) => c.id === 'unique');
    expect(unique).toMatchObject({ ok: false });
    expect(unique?.detail).toBe(
      'A file with this name already exists. Use "what-is-a-closure-2.md" instead.',
    );
    expect(allPass(plan.checks)).toBe(false);
  });

  it('creates a course with its first chapter and _course.json in one commit', async () => {
    const { fake, client } = setup();
    const { view } = await viewOf(client);
    const text = fromEditorDoc(
      'learning-notes',
      { title: 'Two Sum', text: templateFor('learning-notes', 'dsa-python') },
      TODAY,
    );
    const plan = await planSave(view, {
      section: 'learning-notes',
      sectionName: 'Learning Notes',
      track: 'dsa-python',
      newCourseName: 'Arrays and Hashing',
      title: 'Two Sum',
      fileText: text,
    });
    expect(allPass(plan.checks)).toBe(true);
    await client.commit(plan);

    expect(fake.commitsCreated).toBe(1);
    const files = fake.files();
    const folder = 'content/learning-notes/dsa-python/arrays-and-hashing';
    expect(JSON.parse(files[`${folder}/_course.json`] as string)).toEqual({
      title: 'Arrays and Hashing',
      description: '',
      order: ['two-sum.md'],
      html: {},
    });
    expect(files[`${folder}/two-sum.md`]).toContain('type: problem');
    expect(files['content/learning-notes/dsa-python/.gitkeep']).toBeUndefined();
  });

  it('adds a chapter to an existing course and appends it to the order', async () => {
    const { fake, client } = setup({
      ...SKELETON,
      'content/learning-notes/dsa-python/arrays/_course.json':
        '{"title":"Arrays","order":["intro.md"],"html":{}}',
      'content/learning-notes/dsa-python/arrays/intro.md': '---\ntitle: Intro\n---\n\nHi\n',
    });
    const { view } = await viewOf(client);
    const plan = await planSave(view, {
      section: 'learning-notes',
      sectionName: 'Learning Notes',
      track: 'dsa-python',
      course: 'arrays',
      title: 'Sliding window',
      fileText: fromEditorDoc('learning-notes', { title: 'Sliding window', text: 'Body' }, TODAY),
    });
    await client.commit(plan);
    expect(fake.commitsCreated).toBe(1);
    expect(
      JSON.parse(fake.files()['content/learning-notes/dsa-python/arrays/_course.json'] as string)
        .order,
    ).toEqual(['intro.md', 'sliding-window.md']);
  });

  it('creates a roadmap file and removes the roadmaps placeholder', async () => {
    const { fake, client } = setup();
    const { view } = await viewOf(client);
    const plan = await planSave(view, {
      section: 'roadmaps',
      sectionName: 'Roadmap',
      track: 'dsa-python',
      title: 'DSA roadmap',
      fileText: fromEditorDoc(
        'roadmaps',
        { title: 'DSA roadmap', text: templateFor('roadmaps', 'dsa-python') },
        TODAY,
      ),
    });
    await client.commit(plan);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith('content/roadmaps/'))).toEqual([
      'content/roadmaps/dsa-python.md',
    ]);
  });
});

describe('edit', () => {
  it('updates only the edited file in one commit', async () => {
    const { fake, client } = setup();
    const { plan: created } = await createQuestion(client, 'What is a closure?');
    const before = fake.files();
    const { view } = await viewOf(client);
    const plan = await planSave(view, {
      section: 'interview-questions',
      sectionName: 'Interview Questions',
      track: 'dsa-python',
      existingPath: created.path,
      title: 'What is a closure?',
      fileText: questionText('What is a closure?', 'A better answer.'),
    });
    expect(plan.message).toBe('docs(interview-questions): update what-is-a-closure.md');
    expect(plan.rows).toEqual([{ status: 'M', path: created.path, size: expect.any(Number) }]);
    await client.commit(plan);

    expect(fake.commitsCreated).toBe(2);
    const after = fake.files();
    expect(after[created.path]).toContain('A better answer.');
    expect({ ...after, [created.path]: '' }).toEqual({ ...before, [created.path]: '' });
  });
});

describe('rename', () => {
  it('moves the file, updates _course.json and fixes links in one commit', async () => {
    const { fake, client } = setup({
      ...SKELETON,
      'content/learning-notes/dsa-python/arrays/_course.json':
        '{"title":"Arrays","order":["intro.md","two-pointers.md"],"html":{}}',
      'content/learning-notes/dsa-python/arrays/intro.md':
        '---\ntitle: Intro\n---\n\nNext: [pointers](/learning-notes/dsa-python/arrays/two-pointers#idea).\n',
      'content/learning-notes/dsa-python/arrays/two-pointers.md':
        '---\ntitle: Two pointers\n---\n\nBody\n',
    });
    const oldPath = 'content/learning-notes/dsa-python/arrays/two-pointers.md';
    const newPath = 'content/learning-notes/dsa-python/arrays/two-pointer-technique.md';
    const oldSha = fake.blobShaOf(oldPath);
    const { view } = await viewOf(client);
    const links = await findBrokenLinkFixes(view, oldPath, newPath);
    expect(links.refs).toEqual([
      {
        file: 'content/learning-notes/dsa-python/arrays/intro.md',
        line: 5,
        url: '/learning-notes/dsa-python/arrays/two-pointers#idea',
      },
    ]);
    const plan = await planRename(view, {
      section: 'learning-notes',
      track: 'dsa-python',
      course: 'arrays',
      path: oldPath,
      newName: 'Two pointer technique',
      linkFixes: links.fixes,
    });
    expect(allPass(plan.checks)).toBe(true);
    expect(plan.message).toBe(
      'docs(learning-notes): rename two-pointers.md to two-pointer-technique.md',
    );
    await client.commit(plan);

    expect(fake.commitsCreated).toBe(1);
    const files = fake.files();
    expect(files[oldPath]).toBeUndefined();
    expect(fake.blobShaOf(newPath)).toBe(oldSha);
    expect(
      JSON.parse(files['content/learning-notes/dsa-python/arrays/_course.json'] as string).order,
    ).toEqual(['intro.md', 'two-pointer-technique.md']);
    expect(files['content/learning-notes/dsa-python/arrays/intro.md']).toContain(
      '[pointers](/learning-notes/dsa-python/arrays/two-pointer-technique#idea)',
    );
  });

  it('blocks a rename onto an existing name', async () => {
    const { client } = setup();
    await createQuestion(client, 'First question');
    await createQuestion(client, 'Second question');
    const { view } = await viewOf(client);
    const plan = await planRename(view, {
      section: 'interview-questions',
      track: 'dsa-python',
      path: `${QUESTION_DIR}/second-question.md`,
      newName: 'First question',
    });
    expect(plan.checks.find((c) => c.id === 'unique')?.ok).toBe(false);
    expect(plan.changes).toEqual([]);
  });
});

describe('delete and undo', () => {
  it('deletes the last item, restores the placeholder, and Undo puts everything back', async () => {
    const { fake, client } = setup();
    const { plan: created } = await createQuestion(client, 'What is a closure?');
    const before = fake.files();

    const { view } = await viewOf(client);
    const plan = await planDelete(view, {
      section: 'interview-questions',
      track: 'dsa-python',
      path: created.path,
    });
    expect(plan.rows).toEqual([
      { status: 'D', path: created.path },
      { status: 'A', path: `${QUESTION_DIR}/.gitkeep`, size: 0 },
    ]);
    const deleted = await client.commit(plan);
    expect(fake.commitsCreated).toBe(2);
    expect(fake.files()[created.path]).toBeUndefined();
    expect(fake.files()[`${QUESTION_DIR}/.gitkeep`]).toBe('');

    await client.commit(
      planUndo(deleted, 'docs(interview-questions): restore what-is-a-closure.md'),
    );
    expect(fake.commitsCreated).toBe(3);
    expect(fake.files()).toEqual(before);
  });

  it('removes a chapter from _course.json and keeps the course folder', async () => {
    const { fake, client } = setup({
      ...SKELETON,
      'content/learning-notes/dsa-python/arrays/_course.json':
        '{"title":"Arrays","order":["intro.md"],"html":{}}',
      'content/learning-notes/dsa-python/arrays/intro.md': '---\ntitle: Intro\n---\n\nHi\n',
    });
    const { view } = await viewOf(client);
    await client.commit(
      await planDelete(view, {
        section: 'learning-notes',
        track: 'dsa-python',
        course: 'arrays',
        path: 'content/learning-notes/dsa-python/arrays/intro.md',
      }),
    );
    expect(fake.commitsCreated).toBe(1);
    const files = fake.files();
    expect(files['content/learning-notes/dsa-python/arrays/intro.md']).toBeUndefined();
    expect(
      JSON.parse(files['content/learning-notes/dsa-python/arrays/_course.json'] as string).order,
    ).toEqual([]);
    expect(files['content/learning-notes/dsa-python/arrays/.gitkeep']).toBeUndefined();
  });

  it('unlinks references to a deleted page in the same commit', async () => {
    const { fake, client } = setup({
      ...SKELETON,
      'content/mind-maps/dsa-python/graphs.md': '---\ntitle: Graphs\n---\n\n# Graphs\n',
      'content/roadmaps/dsa-python.md':
        '---\ntitle: R\n---\n\n1. **Graphs** - See [the map](/mind-maps/dsa-python/graphs).\n',
    });
    const { view } = await viewOf(client);
    const links = await findBrokenLinkFixes(view, 'content/mind-maps/dsa-python/graphs.md', null);
    expect(links.refs).toHaveLength(1);
    await client.commit(
      await planDelete(view, {
        section: 'mind-maps',
        track: 'dsa-python',
        path: 'content/mind-maps/dsa-python/graphs.md',
        linkFixes: links.fixes,
      }),
    );
    expect(fake.commitsCreated).toBe(1);
    expect(fake.files()['content/roadmaps/dsa-python.md']).toContain('See the map.');
  });
});

describe('conflicts', () => {
  it('refuses to overwrite when the branch moves during the commit', async () => {
    const { fake, client } = setup();
    const { view } = await viewOf(client);
    const plan = await planSave(view, {
      section: 'interview-questions',
      sectionName: 'Interview Questions',
      track: 'dsa-python',
      title: 'Racing',
      fileText: questionText('Racing'),
    });
    fake.beforeRefUpdate = () => {
      fake.beforeRefUpdate = undefined;
      fake.externalPush({ 'README.md': '# changed elsewhere\n' });
    };
    const error = await client.commit(plan).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'conflict', details: { reason: 'moved' } });
    expect(describeError(error, 'main')).toBe(
      'Someone else pushed to main while you were saving. Nothing was overwritten. Try again to commit on top of the latest version.',
    );
    // The other push survives and our commit never landed.
    expect(fake.files()['README.md']).toBe('# changed elsewhere\n');
    expect(fake.files()[`${QUESTION_DIR}/racing.md`]).toBeUndefined();

    // Trying again on top of the latest version works and still writes one commit.
    await client.commit(plan);
    expect(fake.files()[`${QUESTION_DIR}/racing.md`]).toBeDefined();
    expect(fake.files()['README.md']).toBe('# changed elsewhere\n');
  });

  it('refuses to overwrite a file that changed after it was opened', async () => {
    const { fake, client } = setup();
    const { plan: created } = await createQuestion(client, 'What is a closure?');
    const { view } = await viewOf(client);
    const plan = await planSave(view, {
      section: 'interview-questions',
      sectionName: 'Interview Questions',
      track: 'dsa-python',
      existingPath: created.path,
      title: 'What is a closure?',
      fileText: questionText('What is a closure?', 'Mine'),
    });
    fake.externalPush({
      [created.path]: '---\nquestion: Theirs\ndifficulty: easy\n---\n\nTheirs\n',
    });
    const commitsBefore = fake.commitsCreated;
    const error = await client.commit(plan).catch((e: unknown) => e);
    expect(error).toMatchObject({
      kind: 'conflict',
      details: { reason: 'changed', paths: [created.path] },
    });
    expect(describeError(error)).toMatch(
      /^Changed on GitHub after you opened it: .*what-is-a-closure\.md\. Nothing was overwritten/,
    );
    expect(fake.commitsCreated).toBe(commitsBefore);
    expect(fake.files()[created.path]).toContain('Theirs');
  });
});

describe('network', () => {
  it('retries failing GET requests with backoff before giving up', async () => {
    const { fake, client } = setup();
    let failures = 2;
    fake.intercept = (method, path) => {
      if (method === 'GET' && path.includes('/git/ref/') && failures > 0) {
        failures--;
        return new Response('{"message":"Bad gateway"}', { status: 502 });
      }
      return undefined;
    };
    await expect(client.snapshot()).resolves.toMatchObject({ commitSha: fake.headSha });
    expect(fake.requests.filter((r) => r.path.includes('/git/ref/'))).toHaveLength(3);
  });

  it('never sends the token anywhere but the Authorization header', async () => {
    const { fake, client } = setup();
    await createQuestion(client, 'Token check');
    for (const r of fake.requests) {
      expect(r.path).not.toContain(TOKEN);
      expect(JSON.stringify(r.body ?? {})).not.toContain(TOKEN);
    }
  });
});
