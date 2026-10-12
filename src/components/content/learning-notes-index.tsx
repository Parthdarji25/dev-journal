import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { containerClass } from '@/components/ui/styles';
import { routes, type Content } from '@/lib/content';
import { plural } from '@/lib/format';
import { chapterTypeLabel } from './labels';
import { TrackFilter } from './track-filter';
import { TrackPanel } from './track-panel';

export function LearningNotesIndex({ content }: { content: Content }) {
  const section = content.sections.find((s) => s.slug === 'learning-notes');
  return (
    <div className={containerClass}>
      <header className="pt-10 pb-8">
        <h1 className="text-3xl font-bold sm:text-4xl">{section?.name ?? 'Learning Notes'}</h1>
        {section && <p className="mt-2 text-lg text-soft">{section.description}</p>}
      </header>

      <TrackFilter
        tracks={content.tracks.map((t) => ({ slug: t.slug, name: t.shortName }))}
        targetId="note-panels"
      />

      <div id="note-panels" className="mt-8 space-y-6">
        {content.tracks.map((track) => {
          const courses = content.courses.filter((c) => c.track === track.slug);
          return (
            <TrackPanel
              key={track.slug}
              id={track.slug}
              track={track}
              folder={`content/learning-notes/${track.slug}/`}
              footer={
                <Link
                  href={routes.track(track.slug)}
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-text hover:underline"
                >
                  Open track hub
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              }
            >
              {courses.length === 0 ? (
                <EmptyState>{track.name} notes are coming soon.</EmptyState>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.map((course) => {
                    const types = [...new Set(course.chapters.map(chapterTypeLabel))];
                    return (
                      <li key={course.slug}>
                        <Link
                          href={course.href}
                          className="flex h-full flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-(--tc)"
                        >
                          <code className="font-mono text-xs text-muted">{course.slug}/</code>
                          <span className="mt-1 font-heading font-semibold text-text">
                            {course.title}
                          </span>
                          <span className="mt-2 text-sm text-soft">
                            {plural(course.chapters.length, 'chapter')}
                            {types.length > 0 && ` · ${types.join(', ')}`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TrackPanel>
          );
        })}
      </div>
    </div>
  );
}
