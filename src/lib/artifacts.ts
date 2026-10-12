// Artifacts site helpers (used by scripts/build-artifacts.ts and tests).

/**
 * Posts the content height on load and whenever it changes. It also re-sends
 * it every second for the first 10s, in case the embedding page was still
 * hydrating (and not yet listening) when the first message went out.
 * Kept tiny and dependency-free.
 */
export const RESIZE_SCRIPT = `<script>(function(){var last=0,n=0;function h(){var d=document.documentElement,b=document.body;return Math.ceil(Math.max(d.getBoundingClientRect().height,b?b.scrollHeight:0))}function post(){var v=h();if(v!==last||n<10){last=v;parent.postMessage({type:'artifact:height',height:v},'*')}}if(window.ResizeObserver){new ResizeObserver(post).observe(document.documentElement)}addEventListener('load',post);setInterval(function(){n++;post()},1000);post()})();</script>`;

export function injectResizeScript(html: string): string {
  const close = html.search(/<\/body\s*>/i);
  return close === -1
    ? `${html}\n${RESIZE_SCRIPT}\n`
    : `${html.slice(0, close)}${RESIZE_SCRIPT}\n${html.slice(close)}`;
}
