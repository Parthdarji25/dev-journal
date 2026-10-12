import { z } from 'zod';
import { hexColorSchema, slugSchema } from './common';

const themePair = z.object({ light: hexColorSchema, dark: hexColorSchema });

export const trackSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  description: z.string().trim().min(1),
  order: z.number().int(),
  color: themePair,
  tint: themePair,
});
export type Track = z.infer<typeof trackSchema>;

export const tracksSchema = z
  .array(trackSchema)
  .min(1, 'at least one track is required')
  .superRefine((tracks, ctx) => {
    const seen = new Set<string>();
    tracks.forEach((t, i) => {
      if (seen.has(t.slug)) {
        ctx.addIssue({ code: 'custom', path: [i, 'slug'], message: `duplicate track "${t.slug}"` });
      }
      seen.add(t.slug);
    });
  });

export const SECTION_SLUGS = [
  'learning-notes',
  'roadmaps',
  'mind-maps',
  'interview-questions',
  'cheat-sheets',
  'resources',
] as const;
export type SectionSlug = (typeof SECTION_SLUGS)[number];

export const sectionSchema = z.object({
  slug: z.enum(SECTION_SLUGS),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  group: z.enum(['learn', 'practice']),
  order: z.number().int(),
});
export type Section = z.infer<typeof sectionSchema>;

export const sectionsSchema = z.array(sectionSchema).superRefine((sections, ctx) => {
  const slugs = sections.map((s) => s.slug);
  for (const slug of SECTION_SLUGS) {
    const count = slugs.filter((s) => s === slug).length;
    if (count !== 1) {
      ctx.addIssue({
        code: 'custom',
        message:
          count === 0
            ? `section "${slug}" is missing`
            : `section "${slug}" is listed ${count} times`,
      });
    }
  }
});
