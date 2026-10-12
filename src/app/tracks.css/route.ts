import { loadTracks } from '@/lib/content';
import { trackClass } from '@/lib/nav';

export const dynamic = 'force-static';

/**
 * Track colours come from content/_meta/tracks.json, so they are emitted as a
 * generated stylesheet (/tracks.css) instead of inline styles, which the CSP
 * would block. Each `.t-<slug>` scope sets --tc (colour) and --tt (tint).
 */
export function GET() {
  const css = loadTracks()
    .map((t) => {
      const cls = `.${trackClass(t.slug)}`;
      return [
        `${cls} { --tc: ${t.color.light}; --tt: ${t.tint.light}; }`,
        `.dark ${cls} { --tc: ${t.color.dark}; --tt: ${t.tint.dark}; }`,
      ].join('\n');
    })
    .join('\n');
  return new Response(`${css}\n`, { headers: { 'content-type': 'text/css; charset=utf-8' } });
}
