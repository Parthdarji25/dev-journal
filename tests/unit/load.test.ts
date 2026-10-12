import { describe, expect, it } from 'vitest';
import {
  ContentError,
  loadContent,
  recentItems,
  sectionCount,
  trackSummary,
  type ContentIssue,
} from '@/lib/content';
import { FIXTURES, makeContent, md } from './helpers';

describe('empty content', () => {
  it('loads the skeleton as empty lists without errors', () => {
    const content = loadContent(makeContent());
    expect(content.tracks).toHaveLength(5);
    expect(content.sections).toHaveLength(6);
    expect(content.courses).toEqual([]);
    expect(content.roadmaps).toEqual([]);
    expect(content.mindMaps).toEqual([]);
    expect(content.questions).toEqual([]);
    expect(content.cheatSheets).toEqual([]);
    expect(content.resources).toEqual([]);
    expect(recentItems(content)).toEqual([]);
    expect(trackSummary(content, 'system-design')).toBe('Coming soon');
    expect(sectionCount(content, 'roadmaps', 'dsa-python')).toBe(0);
  });

  it('also loads when the section folders do not exist at all', () => {
    const content = loadContent(makeContent({}, false));
    expect(content.courses).toEqual([]);
    expect(content.resources).toEqual([]);
  });

  it('throws when a _meta file is missing', () => {
    const root = makeContent();
    expect(() => loadContent(`${root}/does-not-exist`)).toThrow(ContentError);
  });
});

describe('fixtures', () => {
  const content = loadContent(FIXTURES);

  it('loads courses with chapters in _course.json order', () => {
    const css = content.courses.find((c) => c.slug === 'css-layout');
    expect(css).toMatchObject({
      track: 'frontend-development',
      title: 'CSS Layout',
      folder: 'learning-notes/frontend-development/css-layout',
      href: '/learning-notes/frontend-development/css-layout',
      updated: '2026-03-04',
    });
    expect(css?.chapters.map((c) => [c.slug, c.format])).toEqual([
      ['flexbox-basics', 'md'],
      ['grid-playground', 'html'],
    ]);
  });

  it('reads HTML chapter metadata from _course.json', () => {
    const chapter = content.courses.flatMap((c) => c.chapters).find((c) => c.format === 'html');
    expect(chapter).toMatchObject({
      title: 'Grid playground',
      description: 'Fixture HTML artifact chapter.',
      tags: ['grid', 'interactive'],
      updated: '2026-03-04',
      file: 'learning-notes/frontend-development/css-layout/grid-playground.html',
      href: '/learning-notes/frontend-development/css-layout/grid-playground',
    });
  });

  it('reads problem and case-study front-matter', () => {
    const chapters = content.courses.flatMap((c) => c.chapters);
    expect(chapters.find((c) => c.slug === 'two-sum')).toMatchObject({
      type: 'problem',
      difficulty: 'easy',
      companies: ['Acme Corp', 'Globex'],
      topic: 'Hashing',
    });
    expect(chapters.find((c) => c.slug === 'design-walkthrough')?.type).toBe('case-study');
  });

  it('loads a course with no chapters (partial data)', () => {
    const empty = content.courses.find((c) => c.slug === 'prompting-basics');
    expect(empty?.chapters).toEqual([]);
    expect(empty?.updated).toBeUndefined();
  });

  it('loads every other format', () => {
    expect(content.roadmaps[0]?.steps).toHaveLength(3);
    expect(content.mindMaps.map((m) => [m.slug, m.format, m.title])).toEqual([
      ['http', 'md', 'HTTP'],
      ['rest-overview', 'html', 'REST overview'],
    ]);
    expect(content.questions.map((q) => q.companies)).toEqual([[], ['Acme Corp']]);
    expect(content.cheatSheets.find((s) => s.slug === 'python-lists')?.groups.at(-1)).toEqual({
      title: 'Empty group',
      rows: [],
    });
    expect(content.cheatSheets.find((s) => s.format === 'html')?.title).toBe('Big O table');
    expect(content.resources[0]?.links.map((l) => l.type)).toEqual([
      'docs',
      'course',
      'video',
      'book',
    ]);
  });

  it('counts per section and summarises each track', () => {
    expect(sectionCount(content, 'learning-notes', 'frontend-development')).toBe(1);
    expect(sectionCount(content, 'roadmaps', 'frontend-development')).toBe(3);
    expect(sectionCount(content, 'resources', 'backend-development')).toBe(4);
    expect(trackSummary(content, 'frontend-development')).toBe('1 course, 1 roadmap');
    expect(trackSummary(content, 'backend-development')).toBe('2 mind maps, 4 resources');
    expect(trackSummary(content, 'dsa-python')).toBe('1 course, 2 cheat sheets');
  });

  it('lists recently updated items newest first, undated items left out', () => {
    const recent = recentItems(content, 3);
    expect(recent.map((r) => r.updated)).toEqual(['2026-03-09', '2026-03-08', '2026-03-07']);
    expect(recent[0]).toMatchObject({
      section: 'cheat-sheets',
      track: 'dsa-python',
      href: '/cheat-sheets/dsa-python/python-lists',
    });
    expect(recentItems(content, 100).some((r) => r.title === 'What is a token?')).toBe(false);
  });
});

describe('invalid content', () => {
  it('throws a ContentError naming the file by default', () => {
    const root = makeContent({ 'interview-questions/dsa-python/q.md': md({ difficulty: 'easy' }) });
    expect(() => loadContent(root)).toThrow(/interview-questions\/dsa-python\/q\.md: question/);
  });

  it('collects errors and keeps loading the rest when asked', () => {
    const root = makeContent({
      'interview-questions/dsa-python/bad.md': '---\nquestion: [unclosed\n---\n',
      'interview-questions/dsa-python/good.md': md({ question: 'Fine?', difficulty: 'easy' }),
      'learning-notes/dsa-python/c/_course.json': JSON.stringify({
        title: 'C',
        order: ['gone.md', 'x.html'],
      }),
      'learning-notes/dsa-python/c/x.html': '<p>x</p>',
      'learning-notes/dsa-python/c/extra.md': md({ title: 'Extra' }),
    });
    const errors: ContentError[] = [];
    const warnings: ContentIssue[] = [];
    const content = loadContent(root, {
      onError: (e) => errors.push(e),
      onWarning: (w) => warnings.push(w),
    });
    expect(content.questions.map((q) => q.slug)).toEqual(['good']);
    expect(errors.map((e) => e.file)).toEqual([
      'learning-notes/dsa-python/c/_course.json',
      'learning-notes/dsa-python/c/_course.json',
      'interview-questions/dsa-python/bad.md',
    ]);
    expect(errors[0]?.problems[0]).toMatch(/"gone\.md" but the file does not exist/);
    expect(errors[1]?.problems[0]).toMatch(/every HTML chapter needs a title/);
    expect(errors[2]?.problems[0]).toMatch(/not valid YAML/);
    expect(warnings).toEqual([
      {
        file: 'learning-notes/dsa-python/c/extra.md',
        message: 'not listed in _course.json "order", shown last',
      },
    ]);
    expect(content.courses[0]?.chapters.map((c) => c.slug)).toEqual(['extra']);
  });

  it('rejects a course folder without _course.json', () => {
    const root = makeContent({ 'learning-notes/dsa-python/c/a.md': md({ title: 'A' }) });
    expect(() => loadContent(root)).toThrow(/course folder has no _course\.json/);
  });

  it('reports bad resource lines with their line number', () => {
    const root = makeContent({
      'resources/dsa-python.md': md({ title: 'R' }, '- [x](https://x.example.com)'),
    });
    expect(() => loadContent(root)).toThrow(
      /resources\/dsa-python\.md: line \d+: type is required/,
    );
  });
});
