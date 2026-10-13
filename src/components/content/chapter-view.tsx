import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import path from 'node:path';
import { Chip, DifficultyChip, FormatBadge } from '@/components/ui/chip';
import { containerClass } from '@/components/ui/styles';
import { routes, type Chapter, type Course } from '@/lib/content';
import { readingMinutes, renderMarkdown, type RenderOptions } from '@/lib/content/markdown/render';
import { renderCaseStudy, renderProblem } from '@/lib/content/markdown/sections';
import { formatDate } from '@/lib/format';
import { trackClass } from '@/lib/nav';
import type { Track } from '@/lib/schema';
import { versionedArtifactUrl } from '@/lib/content/artifact-url';
import { ArtifactFrame } from './artifact-frame';
import { Breadcrumb } from './breadcrumb';
import { CaseStudySteps } from './case-study-steps';
import { CodeCopy } from './code-copy';
import { chapterTypeLabel } from './labels';
import { Reveal } from './reveal';
import { SearchFilters, searchBody } from './section-page';
import { Toc, type TocEntry } from './toc';

const BODY_ID = 'chapter-body';

/** Images next to a course live under /content/<course folder>/ (copied by scripts/copy-assets.ts). */
function assetResolver(folder: string): RenderOptions['resolveAsset'] {
  return (src) => `/${path.posix.normalize(`content/${folder}/${src}`)}`;
}

function Html({ html, className = 'prose-content' }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-4 scroll-mt-24 text-2xl">
      {children}
    </h2>
  );
}

async function noteBody({ chapter, options }: { chapter: Chapter; options: RenderOptions }) {
  const { html, headings } = await renderMarkdown(chapter.body, options);
  return { body: <Html html={html} />, toc: headings };
}

async function problemBody({ chapter, options }: { chapter: Chapter; options: RenderOptions }) {
  const p = await renderProblem(chapter.body, options);
  const toc: TocEntry[] = [];
  if (p.problem) toc.push({ id: 'problem', text: 'Problem', depth: 2 });
  if (p.approach || p.solution || p.complexity)
    toc.push({ id: 'solution', text: 'Solution', depth: 2 });
  for (const s of p.other) toc.push({ id: s.id, text: s.title, depth: 2 });

  const body = (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {chapter.difficulty && <DifficultyChip difficulty={chapter.difficulty} />}
        {chapter.topic && <Chip>{chapter.topic}</Chip>}
        {chapter.companies.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="ml-2 text-sm text-muted">Asked by</span>
            {chapter.companies.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </span>
        )}
      </div>
      {p.intro && <Html html={p.intro.html} />}
      {p.problem && (
        <section aria-labelledby="problem" className="mt-10 first:mt-0">
          <SectionHeading id="problem">Problem</SectionHeading>
          <Html html={p.problem.html} />
        </section>
      )}
      {(p.approach || p.solution || p.complexity) && (
        <div className="mt-10">
          <Reveal id="solution" showLabel="Show solution" hideLabel="Hide solution">
            {p.approach && (
              <section aria-labelledby="approach" className="mt-10 first:mt-0">
                <SectionHeading id="approach">Approach</SectionHeading>
                <Html html={p.approach.html} />
              </section>
            )}
            {p.solution && (
              <section aria-labelledby="solution-code" className="mt-10 first:mt-0">
                <SectionHeading id="solution-code">Solution</SectionHeading>
                <Html html={p.solution.html} />
              </section>
            )}
            {p.complexity && (
              <section aria-labelledby="complexity" className="mt-10 first:mt-0">
                <SectionHeading id="complexity">Complexity</SectionHeading>
                {p.complexity.time || p.complexity.space ? (
                  <div className="flex flex-wrap gap-2">
                    {p.complexity.time && (
                      <Chip className="font-mono">Time: {p.complexity.time}</Chip>
                    )}
                    {p.complexity.space && (
                      <Chip className="font-mono">Space: {p.complexity.space}</Chip>
                    )}
                  </div>
                ) : (
                  <Html html={p.complexity.html} />
                )}
              </section>
            )}
          </Reveal>
        </div>
      )}
      {p.other.map((s) => (
        <section key={s.id} aria-labelledby={s.id} className="mt-10 first:mt-0">
          <SectionHeading id={s.id}>{s.title}</SectionHeading>
          <Html html={s.html} />
        </section>
      ))}
    </>
  );
  return { body, toc };
}

async function caseStudyBody({ chapter, options }: { chapter: Chapter; options: RenderOptions }) {
  const c = await renderCaseStudy(chapter.body, options);
  const body = (
    <>
      {c.intro && <Html html={c.intro.html} className="prose-content mb-8" />}
      {c.steps.length > 0 && (
        <CaseStudySteps titles={c.steps.map((s) => s.title)}>
          {c.steps.map((s) => (
            <Html key={s.id} html={s.html} />
          ))}
        </CaseStudySteps>
      )}
    </>
  );
  return { body, toc: [] as TocEntry[] };
}

function htmlBody({ chapter }: { chapter: Chapter }) {
  return {
    body: (
      <>
        {chapter.description && <p className="mb-4 text-lg text-soft">{chapter.description}</p>}
        {chapter.tags.length > 0 && (
          <ul aria-label="Tags" className="mb-6 flex flex-wrap gap-2">
            {chapter.tags.map((t) => (
              <li key={t}>
                <Chip>{t}</Chip>
              </li>
            ))}
          </ul>
        )}
        <ArtifactFrame src={versionedArtifactUrl(chapter.file)} title={chapter.title} />
      </>
    ),
    toc: [] as TocEntry[],
  };
}

function ChapterList({ course, current }: { course: Course; current: string }) {
  return (
    <ol className="space-y-0.5">
      {course.chapters.map((ch) => (
        <li key={ch.slug}>
          <Link
            href={ch.href}
            aria-current={ch.slug === current ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-2 rounded-md px-2 text-sm ${
              ch.slug === current
                ? 'bg-nav-active font-semibold text-text'
                : 'text-soft hover:bg-nav-active hover:text-text'
            }`}
          >
            <FormatBadge format={ch.format} />
            <span className="min-w-0 truncate">{ch.title}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** "note", "problem", "case study" or "HTML chapter". */
function neighbourLabel(chapter: Chapter): string {
  const label = chapterTypeLabel(chapter);
  return label === 'HTML' ? 'HTML chapter' : label.toLowerCase();
}

function PrevNext({ prev, next }: { prev?: Chapter; next?: Chapter }) {
  if (!prev && !next) return null;
  const card =
    'flex min-h-11 flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-(--tc)';
  return (
    <nav
      aria-label="Previous and next chapter"
      className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2 print:hidden"
    >
      {prev ? (
        <Link href={prev.href} rel="prev" className={card}>
          <span className="flex items-center gap-1 text-xs font-semibold text-muted">
            <ArrowLeft aria-hidden className="size-3.5" />
            Previous {neighbourLabel(prev)}
          </span>
          <span className="mt-1 font-semibold text-text">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} rel="next" className={`${card} sm:items-end sm:text-right`}>
          <span className="flex items-center gap-1 text-xs font-semibold text-muted">
            Next {neighbourLabel(next)}
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
          <span className="mt-1 font-semibold text-text">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}

export async function ChapterView({
  chapter,
  course,
  track,
}: {
  chapter: Chapter;
  course: Course;
  track: Track;
}) {
  const options: RenderOptions = {
    resolveAsset: assetResolver(course.folder),
    eagerFirstImage: true,
  };
  const { body, toc } =
    chapter.format === 'html'
      ? htmlBody({ chapter })
      : chapter.type === 'problem'
        ? await problemBody({ chapter, options })
        : chapter.type === 'case-study'
          ? await caseStudyBody({ chapter, options })
          : await noteBody({ chapter, options });

  const index = course.chapters.findIndex((c) => c.slug === chapter.slug);
  const meta = [
    chapterTypeLabel(chapter),
    chapter.updated && `Last updated ${formatDate(chapter.updated)}`,
    chapter.format === 'md' && `~${readingMinutes(chapter.body)} min read`,
  ].filter(Boolean);

  return (
    <div className={`${containerClass} ${trackClass(track.slug)}`}>
      <div className="pt-6">
        <Breadcrumb
          items={[
            { label: 'Learning Notes', href: '/learning-notes' },
            { label: track.name, href: routes.track(track.slug) },
            { label: course.title, href: course.href },
          ]}
        />
      </div>

      {/* The right column only when there is a table of contents (HTML chapters have none). */}
      <div
        className={`mt-4 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] ${
          toc.length > 0 ? 'xl:grid-cols-[15rem_minmax(0,1fr)_13rem]' : ''
        }`}
      >
        <aside className="print:hidden">
          <details className="rounded-lg border border-border bg-surface p-2 lg:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center px-2 font-semibold">
              Chapters ({course.chapters.length})
            </summary>
            <nav aria-label="Course chapters" className="mt-2">
              <ChapterList course={course} current={chapter.slug} />
            </nav>
          </details>
          <nav aria-label="Course chapters" className="sticky top-24 hidden lg:block">
            <p className="mb-2 px-2 text-xs font-semibold tracking-wider text-muted uppercase">
              {course.title}
            </p>
            <ChapterList course={course} current={chapter.slug} />
          </nav>
        </aside>

        <article
          id={BODY_ID}
          className="min-w-0"
          {...searchBody(`${chapter.title} · ${course.title}`)}
        >
          <SearchFilters section="learning-notes" track={track.slug} />
          <p className="text-sm text-muted">{meta.join(' · ')}</p>
          <h1 className="mt-2 mb-8 text-3xl font-bold sm:text-4xl">{chapter.title}</h1>
          {body}
          <PrevNext prev={course.chapters[index - 1]} next={course.chapters[index + 1]} />
        </article>

        {toc.length > 0 && (
          <aside className="hidden xl:block print:hidden">
            <div className="sticky top-24">
              <Toc entries={toc.map((h) => ({ id: h.id, text: h.text, depth: h.depth }))} />
            </div>
          </aside>
        )}
      </div>
      <CodeCopy targetId={BODY_ID} />
    </div>
  );
}
