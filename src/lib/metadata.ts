import type { Metadata } from 'next';

/** Title, description and canonical URL for a public page. `path` starts with "/". */
export function pageMetadata(
  title: string | undefined,
  description: string,
  path: string,
): Metadata {
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { title: title ?? undefined, description, url: path },
  };
}
