import { z } from 'zod';
import { dateSchema, difficultySchema, stringListSchema } from './common';

const htmlChapterMetaSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(''),
  tags: stringListSchema,
  updated: dateSchema.optional(),
});

export const courseSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().default(''),
    /** Chapter file names (with extension) in reading order. */
    order: z.array(z.string().min(1)).default([]),
    /** Metadata for .html chapters, keyed by file name. */
    html: z.record(z.string(), htmlChapterMetaSchema).default({}),
  })
  .superRefine((course, ctx) => {
    const seen = new Set<string>();
    course.order.forEach((file, i) => {
      if (seen.has(file)) {
        ctx.addIssue({ code: 'custom', path: ['order', i], message: `"${file}" is listed twice` });
      }
      seen.add(file);
      if (!/\.(md|html)$/.test(file)) {
        ctx.addIssue({
          code: 'custom',
          path: ['order', i],
          message: `"${file}" must end in .md or .html`,
        });
      }
    });
    for (const key of Object.keys(course.html)) {
      if (!key.endsWith('.html')) {
        ctx.addIssue({
          code: 'custom',
          path: ['html', key],
          message: 'keys must be .html file names',
        });
      }
    }
  });

const CHAPTER_TYPES = ['note', 'problem', 'case-study'] as const;
export type ChapterType = (typeof CHAPTER_TYPES)[number];

export const chapterFrontmatterSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    tags: stringListSchema,
    type: z.enum(CHAPTER_TYPES).default('note'),
    updated: dateSchema.optional(),
    difficulty: difficultySchema.optional(),
    companies: stringListSchema,
    topic: z.string().trim().optional(),
  })
  .superRefine((fm, ctx) => {
    if (fm.type === 'problem' && !fm.difficulty) {
      ctx.addIssue({
        code: 'custom',
        path: ['difficulty'],
        message: 'problems need a difficulty: easy, medium or hard',
      });
    }
  });
