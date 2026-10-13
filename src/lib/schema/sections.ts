import { z } from 'zod';
import { dateSchema, difficultySchema, stringListSchema } from './common';
import { RESOURCE_TYPES } from './constants';

export { RESOURCE_TYPES } from './constants';

/** Front-matter shared by roadmaps, mind maps and resources: one title plus the admin date. */
const titledFrontmatterSchema = z.object({
  title: z.string().trim().min(1),
  updated: dateSchema.optional(),
});

export const roadmapFrontmatterSchema = titledFrontmatterSchema;
export const mindMapFrontmatterSchema = titledFrontmatterSchema;
export const resourcesFrontmatterSchema = titledFrontmatterSchema;

export const cheatSheetFrontmatterSchema = titledFrontmatterSchema.extend({
  description: z.string().trim().optional(),
});

export const questionFrontmatterSchema = z.object({
  question: z.string().trim().min(1),
  difficulty: difficultySchema,
  companies: stringListSchema,
  tags: stringListSchema,
  updated: dateSchema.optional(),
});

export const resourceLinkSchema = z.object({
  title: z.string().trim().min(1),
  url: z.url({ protocol: /^https?$/, message: 'must be an http(s) URL' }),
  type: z.enum(RESOURCE_TYPES),
  note: z.string().trim().default(''),
});
export type ResourceLink = z.infer<typeof resourceLinkSchema>;
