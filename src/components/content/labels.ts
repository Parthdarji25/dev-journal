import type { Chapter } from '@/lib/content/types';

/** "Note", "Problem", "Case study" or "HTML" (uploaded artifacts). */
export function chapterTypeLabel(chapter: Pick<Chapter, 'format' | 'type'>): string {
  if (chapter.format === 'html') return 'HTML';
  return { note: 'Note', problem: 'Problem', 'case-study': 'Case study' }[chapter.type];
}
