import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { rehypeShiki } from './shiki';
import { isElement, toText, walk, type HastElement, type UnistNode } from './tree';

interface Heading {
  depth: 2 | 3;
  id: string;
  text: string;
}

export interface Rendered {
  html: string;
  headings: Heading[];
}

export interface RenderOptions {
  /** Rewrites relative image URLs (e.g. "assets/a.webp") to public URLs. */
  resolveAsset?: (src: string) => string;
  /** Whether the first image may load eagerly (true for the top of a chapter). */
  eagerFirstImage?: boolean;
}

const CALLOUTS = { TIP: 'Tip', NOTE: 'Note', WARNING: 'Warning' } as const;
const CALLOUT_RE = /^\s*\[!(TIP|NOTE|WARNING)\][ \t]*\n?/i;

/** `> [!TIP]` blockquotes become `<div class="callout callout-tip">`. Runs after sanitize. */
function rehypeCallouts() {
  return (tree: UnistNode) => {
    walk(tree, (node) => {
      if (!isElement(node, 'blockquote')) return;
      const first = node.children.find((c) => isElement(c)) as HastElement | undefined;
      const text = first && isElement(first, 'p') ? first.children[0] : undefined;
      const match = text?.type === 'text' ? CALLOUT_RE.exec(text.value ?? '') : null;
      if (!first || !text || !match) return;
      const kind = (match[1] ?? 'NOTE').toUpperCase() as keyof typeof CALLOUTS;
      text.value = (text.value ?? '').slice(match[0].length);
      if (!text.value) first.children.shift();
      if (first.children.length === 0) node.children.splice(node.children.indexOf(first), 1);
      const el = node as HastElement;
      el.tagName = 'div';
      el.properties = { className: ['callout', `callout-${kind.toLowerCase()}`], role: 'note' };
      el.children = [
        {
          type: 'element',
          tagName: 'p',
          properties: { className: ['callout-title'] },
          children: [{ type: 'text', value: CALLOUTS[kind] }],
        } as HastElement,
        ...el.children,
      ];
    });
  };
}

/**
 * Images: a "WIDTHxHEIGHT" title sets the intrinsic size (admin writes it),
 * relative sources are resolved, and only the first image may load eagerly.
 */
function rehypeImages(options: RenderOptions) {
  return () => (tree: UnistNode) => {
    let seen = 0;
    walk(tree, (node) => {
      if (!isElement(node, 'img')) return;
      const props = node.properties;
      const title = typeof props.title === 'string' ? props.title : '';
      const size = /^(\d{1,5})x(\d{1,5})$/.exec(title.trim());
      if (size) {
        props.width = Number(size[1]);
        props.height = Number(size[2]);
        delete props.title;
      }
      const src = typeof props.src === 'string' ? props.src : '';
      if (src && options.resolveAsset && !/^(?:[a-z]+:|\/|#)/i.test(src)) {
        props.src = options.resolveAsset(src);
      }
      const eager = seen === 0 && options.eagerFirstImage;
      props.loading = eager ? 'eager' : 'lazy';
      props.decoding = eager ? 'auto' : 'async';
      seen++;
    });
  };
}

function rehypeCollectHeadings(headings: Heading[]) {
  return () => (tree: UnistNode) => {
    walk(tree, (node) => {
      if (isElement(node, 'h2') || isElement(node, 'h3')) {
        const id = node.properties.id;
        if (typeof id === 'string') {
          headings.push({ depth: node.tagName === 'h2' ? 2 : 3, id, text: toText(node).trim() });
        }
        return 'skip';
      }
    });
  };
}

/** Markdown to sanitised HTML. Raw HTML in the source is dropped, never rendered. */
export async function renderMarkdown(
  markdown: string,
  options: RenderOptions = {},
): Promise<Rendered> {
  const headings: Heading[] = [];
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    // Everything below adds trusted markup, so it runs after sanitising.
    .use(rehypeSlug)
    .use(rehypeCollectHeadings(headings))
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: { className: ['heading-anchor'], ariaLabel: 'Link to this section' },
      content: { type: 'text', value: '#' },
    })
    .use(rehypeCallouts)
    .use(rehypeImages(options))
    .use(rehypeShiki)
    .use(rehypeStringify)
    .process(markdown);
  return { html: String(file), headings };
}

/** Rough reading time at 200 words a minute, never below 1. */
export function readingMinutes(markdown: string): number {
  const words = markdown.match(/[\p{L}\p{N}_'-]+/gu)?.length ?? 0;
  return Math.max(1, Math.round(words / 200));
}
