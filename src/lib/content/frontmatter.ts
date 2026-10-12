import matter from 'gray-matter';
import type { z } from 'zod';
import { ContentError, parseWith } from './errors';

export interface Parsed<T> {
  data: T;
  body: string;
}

/** Splits front-matter from the body and validates it with `schema`. */
export function parseFrontmatter<T>(raw: string, schema: z.ZodType<T>, file: string): Parsed<T> {
  let parsed: matter.GrayMatterFile<string>;
  try {
    // Passing options turns off gray-matter's shared cache, which hands out the same mutable object.
    parsed = matter(raw.replace(/^\uFEFF/, ''), {});
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new ContentError(file, [`front-matter is not valid YAML: ${reason}`]);
  }
  return { data: parseWith(schema, parsed.data, file), body: parsed.content };
}

/** Parses a JSON config file and validates it with `schema`. */
export function parseJson<T>(raw: string, schema: z.ZodType<T>, file: string): T {
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new ContentError(file, [`not valid JSON: ${(error as Error).message}`]);
  }
  return parseWith(schema, value, file);
}

/** Text of the <title> element of an uploaded HTML artifact, if it has one. */
export function htmlTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const text = match?.[1]
    ?.replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}
