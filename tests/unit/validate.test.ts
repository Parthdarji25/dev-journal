import { describe, expect, it } from 'vitest';
import { validateContent } from '@/lib/content/validate';
import { FIXTURES, makeContent, md, REAL_CONTENT } from './helpers';

const messages = (root: string) =>
  validateContent(root).errors.map((e) => `${e.file}: ${e.message}`);

describe('validateContent', () => {
  it('passes the real content folder', () => {
    expect(validateContent(REAL_CONTENT).errors).toEqual([]);
  });

  it('passes the fixtures', () => {
    const report = validateContent(FIXTURES);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('passes an empty skeleton', () => {
    expect(messages(makeContent())).toEqual([]);
  });

  it('fails on an unknown section folder, naming it', () => {
    expect(messages(makeContent({ 'blog/x.md': 'x' }))).toEqual([
      expect.stringMatching(/^blog: unknown section folder "blog"/),
    ]);
  });

  it('fails on an unknown track folder, naming it', () => {
    expect(messages(makeContent({ 'mind-maps/devops/x.md': md({ title: 'X' }) }))).toEqual([
      'mind-maps/devops: unknown track folder "devops" (not in _meta/tracks.json)',
    ]);
    expect(messages(makeContent({ 'roadmaps/devops.md': md({ title: 'X' }) }))[0]).toMatch(
      /^roadmaps\/devops\.md: unknown track file/,
    );
  });

  it('fails on bad file names and wrong extensions', () => {
    const errors = messages(
      makeContent({
        'cheat-sheets/dsa-python/01-lists.md': md({ title: 'L' }),
        'cheat-sheets/dsa-python/My Sheet.md': md({ title: 'S' }),
        'interview-questions/dsa-python/q.html': '<p>q</p>',
        'learning-notes/dsa-python/Bad_Course/_course.json': JSON.stringify({ title: 'B' }),
        'learning-notes/dsa-python/stray.md': md({ title: 'S' }),
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/01-lists\.md: file names must not start with a number prefix/),
        expect.stringMatching(/My Sheet\.md: file names must be lowercase/),
        expect.stringMatching(/q\.html: interview-questions only holds \.md files/),
        expect.stringMatching(/Bad_Course: course folder names must be lowercase/),
        expect.stringMatching(/stray\.md: chapters belong in a course folder/),
      ]),
    );
  });

  it('checks assets folders', () => {
    const errors = messages(
      makeContent({
        'mind-maps/dsa-python/assets/diagram.png': 'png',
        'mind-maps/dsa-python/assets/notes.txt': 'x',
      }),
    );
    expect(errors).toEqual([expect.stringMatching(/assets\/notes\.txt: only images/)]);
  });

  it('reports schema errors and broken links together', () => {
    const errors = messages(
      makeContent({
        'interview-questions/dsa-python/q.md': md({ question: 'Q', difficulty: 'impossible' }),
        'roadmaps/dsa-python.md': md(
          { title: 'R' },
          '1. **Arrays** - Start. [Notes](/learning-notes/dsa-python/arrays)',
        ),
      }),
    );
    expect(errors).toEqual([
      expect.stringMatching(/^interview-questions\/dsa-python\/q\.md: difficulty:/),
      expect.stringMatching(
        /^roadmaps\/dsa-python\.md:5: broken link "\/learning-notes\/dsa-python\/arrays"/,
      ),
    ]);
  });

  it('stops after a broken _meta file', () => {
    const root = makeContent({ '_meta/tracks.json': '[{"slug": "Bad Slug"}]' });
    const report = validateContent(root);
    expect(report.content).toBeUndefined();
    expect(report.errors[0]?.file).toBe('_meta/tracks.json');
  });
});
