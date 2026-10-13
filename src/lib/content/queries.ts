import { plural } from '@/lib/format';
import type { SectionSlug } from '@/lib/schema';
import { SECTION_ROUTES } from './routes';
import type { Content, RecentItem } from './types';

/** The count shown on a track's category-bar pill and section block. */
export function sectionCount(content: Content, section: SectionSlug, track: string): number {
  switch (section) {
    case 'learning-notes':
      return content.courses.filter((c) => c.track === track).length;
    case 'roadmaps':
      return content.roadmaps.find((r) => r.track === track)?.steps.length ?? 0;
    case 'mind-maps':
      return content.mindMaps.filter((m) => m.track === track).length;
    case 'interview-questions':
      return content.questions.filter((q) => q.track === track).length;
    case 'cheat-sheets':
      return content.cheatSheets.filter((s) => s.track === track).length;
    case 'resources':
      return content.resources.find((r) => r.track === track)?.links.length ?? 0;
  }
}

/** e.g. "2 courses, 1 roadmap" or "Coming soon". */
export function trackSummary(content: Content, track: string): string {
  const courses = sectionCount(content, 'learning-notes', track);
  const hasRoadmap = sectionCount(content, 'roadmaps', track) > 0;
  const maps = sectionCount(content, 'mind-maps', track);
  const questions = sectionCount(content, 'interview-questions', track);
  const sheets = sectionCount(content, 'cheat-sheets', track);
  const links = sectionCount(content, 'resources', track);
  const parts = [
    courses && plural(courses, 'course'),
    hasRoadmap && '1 roadmap',
    maps && plural(maps, 'mind map'),
    questions && plural(questions, 'question'),
    sheets && plural(sheets, 'cheat sheet'),
    links && plural(links, 'resource'),
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(', ') : 'Coming soon';
}

/** Every dated item across all sections, newest first. Undated items are left out. */
export function recentItems(content: Content, limit = 8): RecentItem[] {
  const items: (RecentItem | null)[] = [
    ...content.courses.flatMap((c) =>
      c.chapters.map((ch) =>
        ch.updated
          ? {
              section: 'learning-notes' as const,
              track: ch.track,
              title: `${c.title}: ${ch.title}`,
              href: ch.href,
              updated: ch.updated,
            }
          : null,
      ),
    ),
    ...content.roadmaps.map((r) =>
      r.updated
        ? {
            section: 'roadmaps' as const,
            track: r.track,
            title: r.title,
            href: r.href,
            updated: r.updated,
          }
        : null,
    ),
    ...content.mindMaps.map((m) =>
      m.updated
        ? {
            section: 'mind-maps' as const,
            track: m.track,
            title: m.title,
            href: m.href,
            updated: m.updated,
          }
        : null,
    ),
    ...content.questions.map((q) =>
      q.updated
        ? {
            section: 'interview-questions' as const,
            track: q.track,
            title: q.title,
            href: q.href,
            updated: q.updated,
          }
        : null,
    ),
    ...content.cheatSheets.map((s) =>
      s.updated
        ? {
            section: 'cheat-sheets' as const,
            track: s.track,
            title: s.title,
            href: s.href,
            updated: s.updated,
          }
        : null,
    ),
    ...content.resources.map((r) =>
      r.updated
        ? {
            section: 'resources' as const,
            track: r.track,
            title: r.title,
            href: r.href,
            updated: r.updated,
          }
        : null,
    ),
  ];
  return items
    .filter((i): i is RecentItem => i !== null)
    .sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** All URLs the static build will emit for this content (used by the link checker). */
export function pagePaths(
  content: Content,
  sectionRoutes: Record<SectionSlug, string>,
): Set<string> {
  const paths = new Set<string>(['/']);
  for (const [section, route] of Object.entries(sectionRoutes)) {
    paths.add(route);
    // Learning Notes has no page per track: its index filters the tracks in place.
    if (section === 'learning-notes') continue;
    for (const t of content.tracks) paths.add(`${route}/${t.slug}`);
  }
  for (const t of content.tracks) paths.add(`/tracks/${t.slug}`);
  for (const c of content.courses) {
    paths.add(c.href);
    for (const ch of c.chapters) paths.add(ch.href);
  }
  for (const m of content.mindMaps) paths.add(m.href);
  for (const s of content.cheatSheets) paths.add(s.href);
  return paths;
}

export interface SectionItem {
  title: string;
  href: string;
}

/** A track's items in one section, in display order (track hubs show the first few). */
export function sectionItems(content: Content, section: SectionSlug, track: string): SectionItem[] {
  const page = `${SECTION_ROUTES[section]}/${track}`;
  switch (section) {
    case 'learning-notes':
      return content.courses
        .filter((c) => c.track === track)
        .map((c) => ({ title: c.title, href: c.href }));
    case 'roadmaps':
      return (content.roadmaps.find((r) => r.track === track)?.steps ?? []).map((s, i) => ({
        title: s.title,
        href: `${page}#step-${i + 1}`,
      }));
    case 'mind-maps':
      return content.mindMaps
        .filter((m) => m.track === track)
        .map((m) => ({ title: m.title, href: m.href }));
    case 'interview-questions':
      return content.questions
        .filter((q) => q.track === track)
        .map((q) => ({ title: q.title, href: q.href }));
    case 'cheat-sheets':
      return content.cheatSheets
        .filter((s) => s.track === track)
        .map((s) => ({ title: s.title, href: s.href }));
    case 'resources':
      return (content.resources.find((r) => r.track === track)?.links ?? []).map((l) => ({
        title: l.title,
        href: page,
      }));
  }
}
