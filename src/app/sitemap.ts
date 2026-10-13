import type { MetadataRoute } from 'next';
import { getContent, pagePaths, SECTION_ROUTES } from '@/lib/content';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-static';

/** Every public page the build emits, at its canonical address. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [...pagePaths(getContent(), SECTION_ROUTES)]
    .sort()
    .map((path) => ({ url: `${siteUrl}${path === '/' ? '' : path}` || siteUrl }));
}
