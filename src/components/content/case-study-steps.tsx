'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { buttonClass } from '@/components/ui/styles';

/** One step visible at a time, with numbered step pills and Previous/Next. Print shows all. */
export function CaseStudySteps({ titles, children }: { titles: string[]; children: ReactNode[] }) {
  const [index, setIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const last = titles.length - 1;

  function go(next: number) {
    setIndex(next);
    panelRef.current?.focus({ preventScroll: true });
  }

  return (
    <div>
      <nav aria-label="Case study steps" className="print:hidden">
        <ol className="flex flex-wrap gap-2">
          {titles.map((title, i) => (
            <li key={i}>
              <button
                type="button"
                aria-current={i === index ? 'step' : undefined}
                onClick={() => go(i)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors ${
                  i === index
                    ? 'border-(--tc) bg-(--tt) text-text'
                    : 'border-border bg-surface text-soft hover:bg-nav-active hover:text-text'
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                    i === index ? 'bg-(--tc) text-bg' : 'bg-panel text-soft'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="sr-only">Step {i + 1}: </span>
                {title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div ref={panelRef} tabIndex={-1} className="mt-6 outline-none">
        {children.map((child, i) => (
          <section
            key={i}
            aria-label={`Step ${i + 1} of ${titles.length}: ${titles[i]}`}
            className={i === index ? 'block' : 'hidden print:mt-10 print:block'}
          >
            <h2 className="mb-4 text-2xl">
              <span className="text-(--tc)">{i + 1}.</span> {titles[i]}
            </h2>
            {child}
          </section>
        ))}
      </div>

      {titles.length > 1 && (
        <div className="mt-8 flex items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className={`${buttonClass.secondary} disabled:pointer-events-none disabled:opacity-40`}
          >
            <ArrowLeft aria-hidden className="size-4" />
            Previous step
          </button>
          <span className="text-sm text-muted" aria-live="polite">
            Step {index + 1} of {titles.length}
          </span>
          <button
            type="button"
            disabled={index === last}
            onClick={() => go(index + 1)}
            className={`${buttonClass.secondary} disabled:pointer-events-none disabled:opacity-40`}
          >
            Next step
            <ArrowRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
