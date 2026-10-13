import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import type { Roadmap } from '@/lib/content';
import { SearchFilters, searchBody } from './section-page';

/** Numbered vertical steps in the track colour, joined by a line. No progress tracking. */
export function RoadmapView({ roadmap, indexed = true }: { roadmap: Roadmap; indexed?: boolean }) {
  if (roadmap.steps.length === 0) {
    return <EmptyState>The steps of this roadmap are coming soon.</EmptyState>;
  }
  return (
    <div {...(indexed ? searchBody(roadmap.title) : {})}>
      {indexed && <SearchFilters section="roadmaps" track={roadmap.track} />}
      <p className="mb-6 font-heading text-lg font-semibold text-soft">{roadmap.title}</p>
      <ol className="relative">
        {roadmap.steps.map((step, i) => (
          <li
            key={i}
            id={`step-${i + 1}`}
            className="relative flex scroll-mt-24 gap-4 pb-8 last:pb-0"
          >
            {i < roadmap.steps.length - 1 && (
              <span
                aria-hidden
                className="absolute top-10 bottom-0 left-[19px] w-0.5 bg-(--tc) opacity-40"
              />
            )}
            <span
              aria-hidden
              className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-(--tc) font-heading font-bold text-bg"
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-1.5">
              <h3 className="text-lg">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              {step.description && <p className="mt-1 text-soft">{step.description}</p>}
              {step.link && (
                <Link
                  href={step.link.href}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-text hover:underline"
                >
                  {step.link.label}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
