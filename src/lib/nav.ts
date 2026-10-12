import type { Content } from '@/lib/content/types';
import { routes, SECTION_ROUTES } from '@/lib/content/routes';

export interface NavItem {
  href: string;
  label: string;
  description: string;
  /** Track slug for track-coloured marks; undefined for sections. */
  track?: string;
}

export interface NavGroup {
  id: 'learn' | 'practice' | 'tracks';
  label: string;
  items: NavItem[];
}

/** LEARN / PRACTICE from sections.json, TRACKS from tracks.json. */
export function buildNav(content: Pick<Content, 'sections' | 'tracks'>): NavGroup[] {
  const sectionItems = (group: 'learn' | 'practice') =>
    content.sections
      .filter((s) => s.group === group)
      .map((s) => ({ href: SECTION_ROUTES[s.slug], label: s.name, description: s.description }));
  return [
    { id: 'learn', label: 'Learn', items: sectionItems('learn') },
    { id: 'practice', label: 'Practice', items: sectionItems('practice') },
    {
      id: 'tracks',
      label: 'Tracks',
      items: content.tracks.map((t) => ({
        href: routes.track(t.slug),
        label: t.name,
        description: t.description,
        track: t.slug,
      })),
    },
  ];
}

/** Whether `pathname` is the item's page or below it. */
export function isCurrent(item: NavItem, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === item.href || path.startsWith(`${item.href}/`);
}

/** CSS class that scopes a track's colour variables (see app/tracks.css). */
export function trackClass(track: string): string {
  return `t-${track}`;
}
