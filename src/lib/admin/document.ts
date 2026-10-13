/**
 * The editor shows the title in its own field and the rest of the file
 * (remaining front-matter + body) in CodeMirror. These helpers convert
 * between the file on GitHub and that pair.
 */
import matter from 'gray-matter';
import type { SectionSlug } from '@/lib/schema/meta';

export interface EditorDoc {
  title: string;
  /** Front-matter without title/question/updated, then the body. */
  text: string;
}

/** Interview questions keep their title in `question`, everything else in `title`. */
export function titleKey(section: SectionSlug): 'title' | 'question' {
  return section === 'interview-questions' ? 'question' : 'title';
}

const MANAGED_KEYS = ['title', 'question', 'updated'];

/** Today in YYYY-MM-DD (local time, as the author sees it). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function frontMatterText(data: Record<string, unknown>): string {
  return matter.stringify('', data, { flowLevel: 1 } as matter.GrayMatterOption<string, never>);
}

/** YAML front-matter (when `data` has keys) followed by the body. */
export function composeFile(data: Record<string, unknown>, body: string): string {
  const content = `${body.replace(/^\s*\n/, '').trimEnd()}\n`;
  return Object.keys(data).length ? `${frontMatterText(data)}${content}` : content;
}

/** Splits a file for the editor. Unparseable front-matter is left in the text for the author to fix. */
export function toEditorDoc(section: SectionSlug, fileText: string): EditorDoc {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(fileText, {});
  } catch {
    return { title: '', text: fileText };
  }
  const data = parsed.data as Record<string, unknown>;
  const title = data[titleKey(section)];
  const rest = Object.fromEntries(Object.entries(data).filter(([k]) => !MANAGED_KEYS.includes(k)));
  return {
    title: typeof title === 'string' ? title : '',
    text: composeFile(rest, parsed.content),
  };
}

/**
 * Builds the file to commit: the title field wins over any title in the
 * text, and `updated` is set to `today` (the admin writes it on every save).
 * Throws when the front-matter in the text is not valid YAML.
 */
export function fromEditorDoc(section: SectionSlug, doc: EditorDoc, today: string): string {
  const parsed = matter(doc.text, {});
  const rest = Object.fromEntries(
    Object.entries(parsed.data as Record<string, unknown>).filter(
      ([k]) => !MANAGED_KEYS.includes(k),
    ),
  );
  return composeFile(
    { [titleKey(section)]: doc.title.trim(), ...rest, updated: today },
    parsed.content,
  );
}
