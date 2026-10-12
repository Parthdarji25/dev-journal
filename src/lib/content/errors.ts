import type { z } from 'zod';

/** A problem with one content file or folder. `file` is relative to the content root. */
export class ContentError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`${file}: ${problems.join('; ')}`);
    this.name = 'ContentError';
  }
}

export interface ContentIssue {
  file: string;
  message: string;
}

/** Called for every invalid file. The default rethrows, so the build fails on bad content. */
export type OnContentError = (error: ContentError) => void;

export const throwOnError: OnContentError = (error) => {
  throw error;
};

export function zodProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
    return `${where}${issue.message}`;
  });
}

export function parseWith<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ContentError(file, zodProblems(result.error));
  return result.data;
}
