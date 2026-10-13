import type { Metadata } from 'next';
import { siteName } from '@/lib/site';

export const OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: `${siteName}: a notebook for everything I'm learning`,
};

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
    // A page-level openGraph replaces the root one, so the image is repeated here.
    openGraph: { title: title ?? undefined, description, url: path, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
  };
}
