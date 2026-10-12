import Link from 'next/link';
import { FormatBadge } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { containerClass } from '@/components/ui/styles';
import { routes, type Course } from '@/lib/content';
import { formatDate, plural } from '@/lib/format';
import { trackClass } from '@/lib/nav';
import type { Track } from '@/lib/schema';
import { Breadcrumb } from './breadcrumb';
import { chapterTypeLabel } from './labels';

export function CourseView({ course, track }: { course: Course; track: Track }) {
  return (
    <div className={`${containerClass} ${trackClass(track.slug)} max-w-4xl`}>
      <div className="pt-6">
        <Breadcrumb
          items={[
            { label: 'Learning Notes', href: '/learning-notes' },
            { label: track.name, href: routes.track(track.slug) },
          ]}
        />
      </div>
      <header className="border-b border-border pt-4 pb-8">
        <p className="text-xs font-semibold tracking-wider text-(--tc) uppercase">{track.name}</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{course.title}</h1>
        {course.description && <p className="mt-3 text-lg text-soft">{course.description}</p>}
        <p className="mt-4 text-sm text-muted">
          {plural(course.chapters.length, 'chapter')}
          {course.updated && ` · Last updated ${formatDate(course.updated)}`}
        </p>
      </header>

      <section aria-labelledby="chapters-title" className="mt-8">
        <h2 id="chapters-title" className="sr-only">
          Chapters
        </h2>
        {course.chapters.length === 0 ? (
          <EmptyState>Chapters for this course are coming soon.</EmptyState>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {course.chapters.map((chapter, i) => (
              <li key={chapter.slug}>
                <Link
                  href={chapter.href}
                  className="flex min-h-11 items-start gap-4 px-4 py-4 hover:bg-nav-active"
                >
                  <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-sm text-muted">
                    {i + 1}
                  </span>
                  <FormatBadge format={chapter.format} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-text">{chapter.title}</span>
                    {chapter.description && (
                      <span className="block text-sm text-soft">{chapter.description}</span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 pt-0.5 text-xs font-semibold text-muted">
                    {chapterTypeLabel(chapter)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
