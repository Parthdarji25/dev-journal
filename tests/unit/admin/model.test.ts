import { describe, expect, it } from 'vitest';
import { allPass, contentChecks } from '@/lib/admin/checks';
import { fromEditorDoc, todayIso, toEditorDoc } from '@/lib/admin/document';
import { listCourses, listItems, pageUrl, sectionCounts } from '@/lib/admin/paths';
import { renameTarget } from '@/lib/admin/plan';
import { isFineGrainedToken, parseRepoInput } from '@/lib/admin/session';
import { templateFor } from '@/lib/admin/templates';
import { findLinksTo, rewriteLinks } from '@/lib/content/link-refs';
import { parseTokenExpiry, type TreeFile } from '@/lib/github/client';
import { SECTION_SLUGS } from '@/lib/schema';

const TRACKS = [
  'frontend-development',
  'backend-development',
  'gen-ai-engineer',
  'dsa-python',
  'system-design',
];

describe('editor document', () => {
  const file =
    '---\nquestion: What is RAG?\ndifficulty: medium\ncompanies: [Acme]\nupdated: 2026-03-08\n---\n\nThe answer.\n';

  it('moves the title into its own field and hides managed keys', () => {
    expect(toEditorDoc('interview-questions', file)).toEqual({
      title: 'What is RAG?',
      text: '---\ndifficulty: medium\ncompanies: [Acme]\n---\n\nThe answer.\n',
    });
  });

  it('puts the title back and writes today as updated', () => {
    const doc = toEditorDoc('interview-questions', file);
    expect(
      fromEditorDoc('interview-questions', { ...doc, title: 'What is RAG, really?' }, '2026-10-13'),
    ).toBe(
      "---\nquestion: 'What is RAG, really?'\ndifficulty: medium\ncompanies: [Acme]\nupdated: '2026-10-13'\n---\n\nThe answer.\n",
    );
  });

  it('lets the title field win over a title typed in the text', () => {
    const out = fromEditorDoc(
      'mind-maps',
      { title: 'Field', text: '---\ntitle: Typed\n---\n\n# Root\n' },
      '2026-01-01',
    );
    expect(out).toContain('title: Field\n');
    expect(out).not.toContain('Typed');
  });

  it('keeps unparseable front-matter in the text and reports it as a failed check', () => {
    const broken = '---\ntitle: [oops\n---\n\nBody\n';
    expect(toEditorDoc('mind-maps', broken)).toEqual({ title: '', text: broken });
    expect(() => fromEditorDoc('mind-maps', { title: 'X', text: broken }, '2026-01-01')).toThrow();
    expect(contentChecks('mind-maps', broken)[0]).toMatchObject({ ok: false });
  });

  it('formats today as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('templates', () => {
  it.each(SECTION_SLUGS.flatMap((section) => TRACKS.map((track) => [section, track] as const)))(
    '%s / %s passes every check once titled',
    (section, track) => {
      const text = fromEditorDoc(
        section,
        { title: 'A title', text: templateFor(section, track) },
        '2026-10-13',
      );
      expect(contentChecks(section, text).filter((c) => !c.ok)).toEqual([]);
    },
  );

  it('uses the problem template for DSA notes and the case-study template for System Design', () => {
    expect(templateFor('learning-notes', 'dsa-python')).toContain('type: problem');
    expect(templateFor('learning-notes', 'dsa-python')).toContain('## Complexity');
    expect(templateFor('learning-notes', 'system-design')).toContain('type: case-study');
    expect(templateFor('learning-notes', 'frontend-development')).not.toContain('type:');
    expect(templateFor('interview-questions', 'gen-ai-engineer')).toContain('difficulty: medium');
  });

  it('flags a bad resource line', () => {
    const text = fromEditorDoc(
      'resources',
      { title: 'R', text: '- [Docs](https://x.example.com)\n' },
      '2026-10-13',
    );
    const checks = contentChecks('resources', text);
    expect(allPass(checks)).toBe(false);
    expect(checks.find((c) => c.id === 'resources')?.detail).toMatch(/type is required/);
  });
});

describe('paths', () => {
  const file = (path: string): [string, TreeFile] => [path, { path, sha: path, size: 1 }];
  const files = new Map([
    file('content/interview-questions/dsa-python/a.md'),
    file('content/interview-questions/dsa-python/b.md'),
    file('content/interview-questions/dsa-python/assets/x.png'),
    file('content/learning-notes/dsa-python/arrays/_course.json'),
    file('content/learning-notes/dsa-python/arrays/intro.md'),
    file('content/learning-notes/dsa-python/arrays/demo.html'),
    file('content/roadmaps/dsa-python.md'),
    file('content/mind-maps/dsa-python/.gitkeep'),
  ]);

  it('lists items, courses and counts per section', () => {
    expect(listItems(files, 'interview-questions', 'dsa-python').map((i) => i.fileName)).toEqual([
      'a.md',
      'b.md',
    ]);
    expect(
      listItems(files, 'learning-notes', 'dsa-python', 'arrays').map((i) => [i.fileName, i.format]),
    ).toEqual([
      ['demo.html', 'html'],
      ['intro.md', 'md'],
    ]);
    expect(listCourses(files, 'dsa-python')).toEqual(['arrays']);
    expect(sectionCounts(files, SECTION_SLUGS, 'dsa-python')).toEqual({
      'learning-notes': 1,
      roadmaps: 1,
      'mind-maps': 0,
      'interview-questions': 2,
      'cheat-sheets': 0,
      resources: 0,
    });
  });

  it('maps files to their public addresses', () => {
    expect(pageUrl('content/learning-notes/t/c/x.md')).toBe('/learning-notes/t/c/x');
    expect(pageUrl('content/learning-notes/t/c/_course.json')).toBe('/learning-notes/t/c');
    expect(pageUrl('content/interview-questions/t/q.md')).toBe('/interview-questions/t#q');
    expect(pageUrl('content/roadmaps/t.md')).toBe('/roadmap/t');
    expect(pageUrl('content/cheat-sheets/t/s.html')).toBe('/cheat-sheets/t/s');
    expect(pageUrl('README.md')).toBeNull();
  });

  it('previews a rename as the slugified name with the same extension', () => {
    expect(renameTarget('content/mind-maps/t/old.md', 'New Name!')).toBe(
      'content/mind-maps/t/new-name.md',
    );
    expect(renameTarget('content/cheat-sheets/t/a.html', 'Big O')).toBe(
      'content/cheat-sheets/t/big-o.html',
    );
  });
});

describe('links', () => {
  const md =
    'See [one](/mind-maps/t/a), [two](/mind-maps/t/a/#x) and [other](/mind-maps/t/b).\n\n[ref]: /mind-maps/t/a\n';

  it('rewrites links to a renamed page, keeping anchors', () => {
    const { markdown, count } = rewriteLinks(md, '/mind-maps/t/a', '/mind-maps/t/z');
    expect(count).toBe(3);
    expect(markdown).toBe(
      'See [one](/mind-maps/t/z), [two](/mind-maps/t/z#x) and [other](/mind-maps/t/b).\n\n[ref]: /mind-maps/t/z\n',
    );
  });

  it('unlinks references to a deleted page, keeping the text', () => {
    expect(rewriteLinks(md, '/mind-maps/t/a', null).markdown).toBe(
      'See one, two and [other](/mind-maps/t/b).\n\n',
    );
  });

  it('matches question anchors exactly', () => {
    const q = 'A [link](/interview-questions/t#q1) and [another](/interview-questions/t#q2).';
    expect(findLinksTo([{ file: 'f', markdown: q }], '/interview-questions/t#q1')).toHaveLength(1);
    expect(
      rewriteLinks(q, '/interview-questions/t#q1', '/interview-questions/t#renamed').markdown,
    ).toBe('A [link](/interview-questions/t#renamed) and [another](/interview-questions/t#q2).');
  });
});

describe('session', () => {
  it('accepts only fine-grained tokens', () => {
    expect(isFineGrainedToken('github_pat_abc123')).toBe(true);
    expect(isFineGrainedToken('ghp_classic')).toBe(false);
    expect(isFineGrainedToken('github_pat_')).toBe(false);
  });

  it('reads owner/repo from text or a GitHub URL', () => {
    expect(parseRepoInput('me/notes')).toEqual({ owner: 'me', repo: 'notes' });
    expect(parseRepoInput('https://github.com/me/notes.git')).toEqual({
      owner: 'me',
      repo: 'notes',
    });
    expect(parseRepoInput('just-a-name')).toBeNull();
  });

  it('parses the token expiry header in both GitHub formats', () => {
    expect(parseTokenExpiry('2026-12-31 00:00:00 UTC')).toBe('2026-12-31T00:00:00.000Z');
    expect(parseTokenExpiry('2026-12-31 01:00:00 +0100')).toBe('2026-12-31T00:00:00.000Z');
    expect(parseTokenExpiry(undefined)).toBeNull();
    expect(parseTokenExpiry('soon')).toBeNull();
  });
});
