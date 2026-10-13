import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { SearchTrigger } from '@/components/search/search-trigger';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClass, containerClass } from '@/components/ui/styles';
import { TrackMark } from '@/components/ui/track-mark';
import { getContent, recentItems, SECTION_ROUTES, trackSummary } from '@/lib/content';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';
import { trackClass } from '@/lib/nav';

export const metadata = pageMetadata(
  undefined,
  "A notebook for everything I'm learning: notes, roadmaps, mind maps and interview practice.",
  '/',
);

export default function HomePage() {
  const content = getContent();
  const recent = recentItems(content, 8);
  const sectionName = new Map(content.sections.map((s) => [s.slug, s.name]));
  const trackName = new Map(content.tracks.map((t) => [t.slug, t.shortName]));

  return (
    <div className={containerClass}>
      <section className="max-w-3xl pt-12 pb-16 sm:pt-20">
        <p className="text-sm font-semibold tracking-wider text-muted uppercase">Learning notes</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
          A notebook for everything I&apos;m learning.
        </h1>
        <p className="mt-4 text-lg text-soft">
          Notes, roadmaps, mind maps and interview practice across {content.tracks.length} tracks,
          kept as plain files.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <SearchTrigger />
          <a href="#tracks" className={buttonClass.secondary}>
            Browse tracks
          </a>
        </div>
      </section>

      <section id="tracks" aria-labelledby="tracks-title" className="scroll-mt-24">
        <h2 id="tracks-title" className="text-2xl">
          Tracks
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.tracks.map((track) => (
            <li key={track.slug}>
              <Link
                href={`/tracks/${track.slug}`}
                className={`${trackClass(track.slug)} group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-(--tc)`}
              >
                <span aria-hidden className="h-1.5 bg-(--tc)" />
                <span className="flex flex-1 flex-col p-5">
                  <span className="font-heading text-lg font-semibold text-text">{track.name}</span>
                  <span className="mt-1 text-sm text-soft">{track.description}</span>
                  <span className="mt-4 text-sm font-semibold text-(--tc)">
                    {trackSummary(content, track.slug)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sections-title" className="mt-16">
        <h2 id="sections-title" className="text-2xl">
          Sections
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.sections.map((section) => (
            <li key={section.slug}>
              <Link
                href={SECTION_ROUTES[section.slug]}
                className="flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-nav-active"
              >
                <span className="flex items-center justify-between font-heading font-semibold text-text">
                  {section.name}
                  <ArrowRight aria-hidden className="size-4 text-muted" />
                </span>
                <span className="mt-1 text-sm text-soft">{section.description}</span>
                <code className="mt-3 font-mono text-xs text-muted">content/{section.slug}/</code>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-title" className="mt-16">
        <h2 id="recent-title" className="text-2xl">
          Recently updated
        </h2>
        <div className="mt-6">
          {recent.length === 0 ? (
            <EmptyState>Nothing yet, coming soon.</EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {recent.map((item) => (
                <li key={item.href + item.title}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-nav-active"
                  >
                    <TrackMark track={item.track} shape="dot" />
                    <span className="sr-only">{trackName.get(item.track)}:</span>
                    <span className="font-semibold text-text">{item.title}</span>
                    <Chip>{sectionName.get(item.section)}</Chip>
                    <span className="ml-auto text-sm text-muted">{formatDate(item.updated)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
