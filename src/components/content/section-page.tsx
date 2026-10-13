import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { containerClass } from '@/components/ui/styles';
import { getContent, sectionCount, SECTION_ROUTES } from '@/lib/content';
import type { SectionSlug, Track } from '@/lib/schema';
import { CategoryBar } from './category-bar';
import { TrackPanel } from './track-panel';

/** What a section calls its items, for "<Track> <noun> are coming soon." */
const EMPTY_NOUN: Record<Exclude<SectionSlug, 'learning-notes'>, string> = {
  roadmaps: 'roadmap is',
  'mind-maps': 'mind maps are',
  'interview-questions': 'questions are',
  'cheat-sheets': 'cheat sheets are',
  resources: 'resources are',
};

/** Content folder shown in the panel heading. */
function folderFor(section: SectionSlug, track: string): string {
  return section === 'roadmaps' || section === 'resources'
    ? `content/${section}/${track}.md`
    : `content/${section}/${track}/`;
}

/**
 * Shared layout of the category-bar sections: title, the track bar and one
 * track panel. `children` is the track's content; null renders the empty state.
 */
export function SectionPage({
  section,
  track,
  isIndex = false,
  children,
}: {
  section: Exclude<SectionSlug, 'learning-notes'>;
  track: Track;
  isIndex?: boolean;
  children: ReactNode | null;
}) {
  const content = getContent();
  const meta = content.sections.find((s) => s.slug === section);
  return (
    <div className={containerClass}>
      <header className="pt-10 pb-8">
        <h1 className="text-3xl font-bold sm:text-4xl">{meta?.name}</h1>
        {meta && <p className="mt-2 text-lg text-soft">{meta.description}</p>}
      </header>

      <CategoryBar
        base={SECTION_ROUTES[section]}
        selected={track.slug}
        redirectFromIndex={isIndex}
        tracks={content.tracks.map((t) => ({
          slug: t.slug,
          name: t.shortName,
          count: sectionCount(content, section, t.slug),
        }))}
      />

      <div className="mt-8">
        <TrackPanel track={track} folder={folderFor(section, track.slug)}>
          {children ?? (
            <EmptyState>
              {track.name} {EMPTY_NOUN[section]} coming soon.
            </EmptyState>
          )}
        </TrackPanel>
      </div>
    </div>
  );
}

/** Hidden Pagefind filter markers for an indexed region. */
export function SearchFilters({ section, track }: { section: SectionSlug; track: string }) {
  return (
    <>
      <span hidden data-pagefind-filter={`section:${section}`} />
      <span hidden data-pagefind-filter={`track:${track}`} />
    </>
  );
}

/** Attributes that make an element a Pagefind-indexed region with an explicit result title. */
export function searchBody(title: string) {
  return { 'data-pagefind-body': '', 'data-pagefind-meta': `title:${title}` };
}
