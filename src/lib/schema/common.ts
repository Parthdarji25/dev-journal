import { z } from 'zod';

/** lowercase-kebab-case, ASCII letters and digits only. */
export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Ordering prefixes such as `01-intro` or `2_setup` are not allowed: order lives in config. */
export const NUMBER_PREFIX_RE = /^\d+[-_.]/;

export const slugSchema = z
  .string()
  .regex(KEBAB_RE, 'must be lowercase-kebab-case (a-z, 0-9 and dashes)')
  .refine((s) => !NUMBER_PREFIX_RE.test(s), 'must not start with a number prefix');

/**
 * YYYY-MM-DD. YAML front-matter turns unquoted dates into Date objects, so
 * those are normalised back to the string form first.
 */
export const dateSchema = z.preprocess(
  (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : v),
  z.iso.date('must be a date in the form YYYY-MM-DD'),
);

export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof difficultySchema>;

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB colour');

/** A list of non-empty strings; a missing list reads as empty. */
export const stringListSchema = z.array(z.string().trim().min(1)).default([]);
