import { getContent } from '@/lib/content';
import { buildNav } from '@/lib/nav';
import { siteName } from '@/lib/site';
import { SiteHeader } from './site-header';

export function Header() {
  return <SiteHeader nav={buildNav(getContent())} siteName={siteName} />;
}
