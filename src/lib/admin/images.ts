/**
 * Images uploaded in the editor: raster images become WebP (at most 1600px
 * wide) in the browser; SVGs are sanitised. Any input size is accepted.
 */
import { checkFileName, slugify } from '@/lib/content/slug';
import { textToBytes } from '@/lib/github/encoding';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const MAX_WIDTH = 1600;

export interface PreparedImage {
  /** File name inside assets/ (slugified, .webp or .svg). */
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Removes anything that can run code from an SVG: scripts, foreignObject,
 * embedded documents, event handler attributes, javascript: URLs and
 * DOCTYPE/entity declarations. Returns the cleaned text.
 */
export function sanitizeSvg(svg: string): string {
  return (
    svg
      // DOCTYPE with an internal subset (entities) and processing instructions other than <?xml.
      .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, '')
      .replace(/<\?(?!xml\b)[\s\S]*?\?>/gi, '')
      // Elements that run code or load documents, with or without content.
      .replace(
        /<(script|foreignObject|iframe|embed|object|handler|listener)\b[\s\S]*?<\/\1\s*>/gi,
        '',
      )
      .replace(/<(script|foreignObject|iframe|embed|object|handler|listener)\b[^>]*\/?>/gi, '')
      // Event handler attributes (onload=, onclick=, ...).
      .replace(/\s+on[a-z][\w:-]*\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      // Attributes whose value is a javascript: (or vbscript:/data:text/html) URL, even when obfuscated.
      .replace(
        /\s+[\w:-]+\s*=\s*("\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript):[^\s>]*)/gi,
        '',
      )
      // <set>/<animate> that could write a javascript: URL into href.
      .replace(/<(set|animate)\b[^>]*attributeName\s*=\s*["'](?:xlink:)?href["'][^>]*\/?>/gi, '')
  );
}

/** Width and height of an SVG from its attributes or, failing that, its viewBox. */
export function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const attr = (name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(root)?.[1];
  const px = (v?: string) =>
    v && /^\s*[\d.]+\s*(px)?\s*$/.test(v) ? Math.round(Number.parseFloat(v)) : 0;
  let width = px(attr('width'));
  let height = px(attr('height'));
  const viewBox = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if ((!width || !height) && viewBox?.length === 4) {
    const [, , vw = 0, vh = 0] = viewBox;
    if (width && vw) height = Math.round((width * vh) / vw);
    else if (height && vh) width = Math.round((height * vw) / vh);
    else {
      width = Math.round(vw);
      height = Math.round(vh);
    }
  }
  return { width: width || 800, height: height || 600 };
}

/** A free name in the assets folder: slugified, with the given extension, numbered if taken. */
export function assetName(
  original: string,
  ext: '.webp' | '.svg',
  taken: ReadonlySet<string>,
): string {
  const base = slugify(original.replace(/\.[^.]+$/, '')) || 'image';
  const check = checkFileName(base, taken);
  return `${check.ok ? base : check.alternative}${ext}`;
}

/** The markdown line for an image, with its intrinsic size in the title. */
export function imageMarkdown(alt: string, src: string, width: number, height: number): string {
  return `![${alt.replace(/[[\]]/g, '')}](${src} "${width}x${height}")`;
}

async function toWebp(file: Blob): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  let blob: Blob | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  }
  bitmap.close();
  if (!blob || blob.type !== 'image/webp') {
    throw new Error(
      'This browser cannot create WebP images. Try a recent Chrome, Edge, Firefox or Safari.',
    );
  }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** Converts (raster) or sanitises (SVG) an uploaded image for the assets folder. */
export async function prepareImage(file: File, taken: ReadonlySet<string>): Promise<PreparedImage> {
  if (!isImageFile(file.name)) {
    throw new Error(`"${file.name}" is not a supported image (png, jpg, webp, gif or svg).`);
  }
  if (file.name.toLowerCase().endsWith('.svg')) {
    const clean = sanitizeSvg(await file.text());
    const { width, height } = svgSize(clean);
    return { name: assetName(file.name, '.svg', taken), bytes: textToBytes(clean), width, height };
  }
  const webp = await toWebp(file);
  return { name: assetName(file.name, '.webp', taken), ...webp };
}
