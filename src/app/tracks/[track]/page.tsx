import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { containerClass } from '@/components/ui/styles';
import { TrackMark } from '@/components/ui/track-mark';
import { getContent, routes, sectionItems } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import { trackClass } from '@/lib/nav';
import type { SectionSlug } from '@/lib/schema';

type Props = { params: Promise<{ track: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getContent().tracks.map((t) => ({ track: t.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { track } = await params;
  const t = getContent().tracks.find((x) => x.slug === track);
  return t ? pageMetadata(t.name, t.description, routes.track(t.slug)) : {};
}

/** Learning Notes has no per-track page; its index has one panel per track. */
function sectionHref(section: SectionSlug, track: string): string {
  return section === 'learning-notes'
    ? `/learning-notes#${track}`
    : routes.sectionTrack(section, track);
}

export default async function TrackHubPage({ params }: Props) {
  const { track: slug } = await params;
  const content = getContent();
  const track = content.tracks.find((t) => t.slug === slug);
  if (!track) notFound();

  return (
    <div className={containerClass}>
      <section
        aria-labelledby="track-title"
        className={`${trackClass(track.slug)} mt-8 rounded-xl border border-border border-t-4 border-t-(--tc) bg-(--tt) p-6 sm:p-10`}
      >
        <p className="text-xs font-semibold tracking-wider text-(--tc) uppercase">Track</p>
        <h1 id="track-title" className="mt-2 text-3xl font-bold sm:text-4xl">
          {track.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-soft">{track.description}</p>
        <nav aria-label="Other tracks" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {content.tracks
              .filter((t) => t.slug !== track.slug)
              .map((t) => (
                <li key={t.slug}>
                  <Link
                    href={routes.track(t.slug)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-soft hover:bg-nav-active hover:text-text"
                  >
                    <TrackMark track={t.slug} />
                    {t.shortName}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {content.sections.map((section) => {
          const items = sectionItems(content, section.slug, track.slug);
          return (
            <section
              key={section.slug}
              aria-labelledby={`${section.slug}-title`}
              className="flex flex-col rounded-xl border border-border bg-surface p-5"
            >
              <h2 id={`${section.slug}-title`} className="text-lg">
                {section.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{section.description}</p>
              <div className="mt-4 flex flex-1 flex-col">
                {items.length === 0 ? (
                  <EmptyState>Coming soon</EmptyState>
                ) : (
                  <>
                    <ul className="space-y-1">
                      {items.slice(0, 3).map((item, i) => (
                        <li key={`${item.href}-${i}`}>
                          <Link
                            href={item.href}
                            className="flex min-h-11 items-center gap-2 rounded-md px-2 text-soft hover:bg-nav-active hover:text-text"
                          >
                            <TrackMark track={track.slug} shape="dot" />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={sectionHref(section.slug, track.slug)}
                      className="mt-auto inline-flex min-h-11 items-center gap-1 pt-3 text-sm font-semibold text-text hover:underline"
                    >
                      Open {section.name}
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
