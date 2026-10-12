import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chapterFrontmatterSchema,
  courseSchema,
  dateSchema,
  questionFrontmatterSchema,
  resourceLinkSchema,
  sectionsSchema,
  slugSchema,
  tracksSchema,
} from '@/lib/schema';
import { REAL_CONTENT } from './helpers';

const readMeta = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(REAL_CONTENT, '_meta', name), 'utf8')) as unknown;

describe('_meta files', () => {
  it('tracks.json holds the five tracks in order', () => {
    const tracks = tracksSchema.parse(readMeta('tracks.json'));
    expect(tracks.map((t) => t.slug)).toEqual([
      'frontend-development',
      'backend-development',
      'gen-ai-engineer',
      'dsa-python',
      'system-design',
    ]);
    expect(tracks[0]?.color).toEqual({ light: '#C2410C', dark: '#FDBA74' });
  });

  it('sections.json holds all six sections', () => {
    const sections = sectionsSchema.parse(readMeta('sections.json'));
    expect(sections).toHaveLength(6);
    expect(sections.filter((s) => s.group === 'practice').map((s) => s.slug)).toEqual([
      'interview-questions',
      'cheat-sheets',
    ]);
  });

  it('rejects duplicate tracks and bad colours', () => {
    const track = {
      slug: 'a',
      name: 'A',
      shortName: 'A',
      description: 'd',
      order: 1,
      color: { light: '#000000', dark: '#ffffff' },
      tint: { light: '#000000', dark: '#ffffff' },
    };
    expect(tracksSchema.safeParse([track, track]).success).toBe(false);
    expect(
      tracksSchema.safeParse([{ ...track, color: { light: 'red', dark: '#fff' } }]).success,
    ).toBe(false);
  });

  it('rejects a missing section', () => {
    const sections = sectionsSchema.parse(readMeta('sections.json'));
    expect(sectionsSchema.safeParse(sections.slice(1)).success).toBe(false);
  });
});

describe('common', () => {
  it('slugs are kebab-case without number prefixes', () => {
    expect(slugSchema.safeParse('two-sum').success).toBe(true);
    expect(slugSchema.safeParse('3sum').success).toBe(true);
    expect(slugSchema.safeParse('01-intro').success).toBe(false);
    expect(slugSchema.safeParse('Two-Sum').success).toBe(false);
    expect(slugSchema.safeParse('two--sum').success).toBe(false);
  });

  it('dates accept YYYY-MM-DD strings and YAML Date objects', () => {
    expect(dateSchema.parse('2026-01-31')).toBe('2026-01-31');
    expect(dateSchema.parse(new Date('2026-02-03T00:00:00Z'))).toBe('2026-02-03');
    expect(dateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(dateSchema.safeParse('31/01/2026').success).toBe(false);
  });
});

describe('learning notes', () => {
  it('_course.json defaults order and html', () => {
    expect(courseSchema.parse({ title: 'T' })).toEqual({
      title: 'T',
      description: '',
      order: [],
      html: {},
    });
  });

  it('_course.json rejects duplicates and non-chapter files in order', () => {
    expect(courseSchema.safeParse({ title: 'T', order: ['a.md', 'a.md'] }).success).toBe(false);
    expect(courseSchema.safeParse({ title: 'T', order: ['a.txt'] }).success).toBe(false);
  });

  it('chapters default to type note with empty lists', () => {
    expect(chapterFrontmatterSchema.parse({ title: 'Intro' })).toMatchObject({
      title: 'Intro',
      type: 'note',
      tags: [],
      companies: [],
    });
  });

  it('problems require a difficulty', () => {
    expect(chapterFrontmatterSchema.safeParse({ title: 'P', type: 'problem' }).success).toBe(false);
    expect(
      chapterFrontmatterSchema.safeParse({ title: 'P', type: 'problem', difficulty: 'hard' })
        .success,
    ).toBe(true);
  });

  it('rejects a missing title and an unknown type', () => {
    expect(chapterFrontmatterSchema.safeParse({}).success).toBe(false);
    expect(chapterFrontmatterSchema.safeParse({ title: 'x', type: 'essay' }).success).toBe(false);
  });
});

describe('sections', () => {
  it('a question with no companies parses with an empty list', () => {
    expect(
      questionFrontmatterSchema.parse({ question: 'Q?', difficulty: 'easy' }).companies,
    ).toEqual([]);
  });

  it('a question needs a valid difficulty', () => {
    expect(questionFrontmatterSchema.safeParse({ question: 'Q?' }).success).toBe(false);
    expect(
      questionFrontmatterSchema.safeParse({ question: 'Q?', difficulty: 'trivial' }).success,
    ).toBe(false);
  });

  it('resource links need http(s) URLs and a known type', () => {
    const ok = { title: 'Docs', url: 'https://example.com', type: 'docs' };
    expect(resourceLinkSchema.parse(ok).note).toBe('');
    expect(resourceLinkSchema.safeParse({ ...ok, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(resourceLinkSchema.safeParse({ ...ok, type: 'podcast' }).success).toBe(false);
  });
});
