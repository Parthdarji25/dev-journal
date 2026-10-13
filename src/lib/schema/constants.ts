// Plain constants shared with client components (no zod import, so no zod in the browser bundle).

export const RESOURCE_TYPES = ['docs', 'course', 'video', 'book'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
