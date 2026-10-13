import { notFound } from 'next/navigation';
import { ChapterView } from '@/components/content/chapter-view';
import { CourseView } from '@/components/content/course-view';
import { LearningNotesIndex } from '@/components/content/learning-notes-index';
import { getContent } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';

/*
 * One optional catch-all serves the index (/learning-notes), course pages
 * (/learning-notes/<track>/<course>) and chapters (.../<chapter>). Static
 * export rejects an empty generateStaticParams, and the index guarantees at
 * least one entry even when there is no content, so no placeholder is needed.
 */

type Props = { params: Promise<{ path?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  const { courses } = getContent();
  return [
    { path: [] },
    ...courses.map((c) => ({ path: [c.track, c.slug] })),
    ...courses.flatMap((c) => c.chapters.map((ch) => ({ path: [c.track, c.slug, ch.slug] }))),
  ];
}

function resolve(path: string[] = []) {
  const content = getContent();
  if (path.length === 0) return { kind: 'index' as const, content };
  const [trackSlug, courseSlug, chapterSlug] = path;
  const track = content.tracks.find((t) => t.slug === trackSlug);
  const course = content.courses.find((c) => c.track === trackSlug && c.slug === courseSlug);
  if (!track || !course || path.length > 3) return null;
  if (path.length === 2) return { kind: 'course' as const, content, track, course };
  const chapter = course.chapters.find((ch) => ch.slug === chapterSlug);
  return chapter ? { kind: 'chapter' as const, content, track, course, chapter } : null;
}

export async function generateMetadata({ params }: Props) {
  const r = resolve((await params).path);
  if (!r) return {};
  if (r.kind === 'index') {
    const section = r.content.sections.find((s) => s.slug === 'learning-notes');
    return pageMetadata('Learning Notes', section?.description ?? '', '/learning-notes');
  }
  if (r.kind === 'course') {
    return pageMetadata(
      r.course.title,
      r.course.description || `${r.track.name} notes`,
      r.course.href,
    );
  }
  return pageMetadata(
    `${r.chapter.title} · ${r.course.title}`,
    r.chapter.description || r.course.description || `${r.track.name} notes`,
    r.chapter.href,
  );
}

export default async function LearningNotesPage({ params }: Props) {
  const r = resolve((await params).path);
  if (!r) notFound();
  if (r.kind === 'index') return <LearningNotesIndex content={r.content} />;
  if (r.kind === 'course') return <CourseView course={r.course} track={r.track} />;
  return <ChapterView chapter={r.chapter} course={r.course} track={r.track} />;
}
