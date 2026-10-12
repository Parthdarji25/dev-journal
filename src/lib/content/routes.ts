import type { SectionSlug } from '@/lib/schema';

/** URL base of each section. Content folders and URLs differ only for roadmaps. */
export const SECTION_ROUTES: Record<SectionSlug, string> = {
  'learning-notes': '/learning-notes',
  roadmaps: '/roadmap',
  'mind-maps': '/mind-maps',
  'interview-questions': '/interview-questions',
  'cheat-sheets': '/cheat-sheets',
  resources: '/resources',
};

export const routes = {
  home: () => '/',
  track: (track: string) => `/tracks/${track}`,
  section: (section: SectionSlug) => SECTION_ROUTES[section],
  sectionTrack: (section: SectionSlug, track: string) => `${SECTION_ROUTES[section]}/${track}`,
  course: (track: string, course: string) => `/learning-notes/${track}/${course}`,
  chapter: (track: string, course: string, chapter: string) =>
    `/learning-notes/${track}/${course}/${chapter}`,
  mindMap: (track: string, map: string) => `/mind-maps/${track}/${map}`,
  cheatSheet: (track: string, sheet: string) => `/cheat-sheets/${track}/${sheet}`,
  /** Questions have no page of their own; they are anchors on the track page. */
  question: (track: string, slug: string) => `/interview-questions/${track}#${slug}`,
};

/** Strip query, hash and trailing slash so "/a/b/?x#y" compares as "/a/b". */
export function normalizePath(href: string): string {
  const path = href.split(/[?#]/)[0] ?? '';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
