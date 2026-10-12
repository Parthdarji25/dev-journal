import { z } from 'zod';
import { dateSchema, difficultySchema, stringListSchema } from './common';

/** Front-matter shared by roadmaps, mind maps and resources: one title plus the admin date. */
export const titledFrontmatterSchema = z.object({
  title: z.string().trim().min(1),
  updated: dateSchema.optional(),
});
export type TitledFrontmatter = z.infer<typeof titledFrontmatterSchema>;

export const roadmapFrontmatterSchema = titledFrontmatterSchema;
export const mindMapFrontmatterSchema = titledFrontmatterSchema;
export const resourcesFrontmatterSchema = titledFrontmatterSchema;

export const cheatSheetFrontmatterSchema = titledFrontmatterSchema.extend({
  description: z.string().trim().optional(),
});
export type CheatSheetFrontmatter = z.infer<typeof cheatSheetFrontmatterSchema>;

export const questionFrontmatterSchema = z.object({
  question: z.string().trim().min(1),
  difficulty: difficultySchema,
  companies: stringListSchema,
  tags: stringListSchema,
  updated: dateSchema.optional(),
});
export type QuestionFrontmatter = z.infer<typeof questionFrontmatterSchema>;

export const RESOURCE_TYPES = ['docs', 'course', 'video', 'book'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const resourceLinkSchema = z.object({
  title: z.string().trim().min(1),
  url: z.url({ protocol: /^https?$/, message: 'must be an http(s) URL' }),
  type: z.enum(RESOURCE_TYPES),
  note: z.string().trim().default(''),
});
export type ResourceLink = z.infer<typeof resourceLinkSchema>;
