import { describe, expect, it } from 'vitest';
import {
  baseNameFor,
  checkFileName,
  DUPLICATE_NAME_MESSAGE,
  humanize,
  numberedAlternative,
  slugify,
  stem,
} from '@/lib/content/slug';
import { fileNameProblem } from '@/lib/content/validate';

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Big O Notation')).toBe('big-o-notation');
    expect(slugify('  Hello,   World!  ')).toBe('hello-world');
    expect(slugify('snake_case and camelCase')).toBe('snake-case-and-camelcase');
  });

  it('transliterates accented Latin to ASCII', () => {
    expect(slugify('Crème brûlée à la française')).toBe('creme-brulee-a-la-francaise');
    expect(slugify('Straße Øresund Łódź')).toBe('strasse-oresund-lodz');
  });

  it('transliterates Cyrillic and Greek', () => {
    expect(slugify('Привет мир')).toBe('privet-mir');
    expect(slugify('Ελληνικά')).toBe('ellinika');
  });

  it('spells out common symbols', () => {
    expect(slugify('C++ & Rust')).toBe('c-plus-plus-and-rust');
  });

  it('returns an empty string for symbols-only and unsupported scripts', () => {
    expect(slugify('!!! ??? ***')).toBe('');
    expect(slugify('---')).toBe('');
    expect(slugify('日本語')).toBe('');
    expect(slugify('🚀🔥')).toBe('');
  });

  it('never produces a number prefix', () => {
    expect(slugify('3 Sum')).toBe('3sum');
    expect(slugify('01 - Intro')).toBe('01intro');
    expect(slugify('2D arrays')).toBe('2d-arrays');
    expect(fileNameProblem(`${slugify('3 Sum')}.md`)).toBeNull();
  });

  it('caps long titles at a word boundary', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('baseNameFor', () => {
  it('uses the slug when the title has usable characters', () => {
    expect(baseNameFor('Two Sum', 'Learning Notes')).toBe('two-sum');
  });

  it('falls back to the section name plus a random suffix', () => {
    expect(baseNameFor('???', 'Interview Questions')).toMatch(/^interview-questions-[a-z0-9]{4}$/);
    expect(baseNameFor('日本語', 'Cheat Sheets')).toMatch(/^cheat-sheets-[a-z0-9]{4}$/);
  });

  it('gives different suffixes on different calls', () => {
    const names = new Set(Array.from({ length: 20 }, () => baseNameFor('', 'Mind Maps')));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('checkFileName', () => {
  it('accepts a free name', () => {
    expect(checkFileName('two-sum', new Set(['three-sum']))).toEqual({ ok: true, name: 'two-sum' });
  });

  it('blocks a duplicate and offers the next free number', () => {
    const result = checkFileName('two-sum', new Set(['two-sum', 'two-sum-2']));
    expect(result).toEqual({
      ok: false,
      name: 'two-sum',
      message: DUPLICATE_NAME_MESSAGE,
      alternative: 'two-sum-3',
    });
    expect(DUPLICATE_NAME_MESSAGE).toBe('A file with this name already exists');
  });

  it('treats names with different extensions as duplicates (compares stems)', () => {
    const taken = new Set(['intro.md', 'grid.html'].map(stem));
    expect(checkFileName('grid', taken).ok).toBe(false);
  });

  it('numberedAlternative starts at 2', () => {
    expect(numberedAlternative('a', new Set(['a']))).toBe('a-2');
  });
});

describe('helpers', () => {
  it('stem drops only the last extension', () => {
    expect(stem('two-sum.md')).toBe('two-sum');
    expect(stem('archive.tar.gz')).toBe('archive.tar');
    expect(stem('.gitkeep')).toBe('.gitkeep');
  });

  it('humanize turns a slug into a sentence-case title', () => {
    expect(humanize('big-o-table')).toBe('Big o table');
  });
});
