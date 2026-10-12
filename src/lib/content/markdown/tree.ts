/**
 * Minimal structural types for the mdast and hast trees we touch, plus a
 * walker. Kept local so the content layer needs no extra type packages.
 */

export interface UnistNode {
  type: string;
  children?: UnistNode[];
  value?: string;
  position?: { start: { line: number; column: number } };
}

export interface MdNode extends UnistNode {
  children?: MdNode[];
  depth?: number;
  ordered?: boolean;
  url?: string;
  lang?: string | null;
}

export interface HastElement extends UnistNode {
  type: 'element';
  tagName: string;
  properties: Record<string, unknown>;
  children: UnistNode[];
}

export function isElement(node: UnistNode | undefined, tagName?: string): node is HastElement {
  return node?.type === 'element' && (!tagName || (node as HastElement).tagName === tagName);
}

/**
 * Depth-first walk. Return 'skip' to not descend into a node's children.
 */
export function walk<T extends UnistNode>(
  node: T,
  visitor: (node: T, parent: T | undefined, index: number) => void | 'skip',
  parent?: T,
  index = 0,
): void {
  if (visitor(node, parent, index) === 'skip') return;
  const children = node.children as T[] | undefined;
  if (!children) return;
  for (let i = 0; i < children.length; i++) walk(children[i] as T, visitor, node, i);
}

/** Concatenated text of a node (text, inline code and raw values). */
export function toText(node: UnistNode | undefined): string {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(toText).join('');
}

export function classList(el: HastElement): string[] {
  const value = el.properties.className ?? el.properties.class;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}
