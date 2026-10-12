'use client';

import { Maximize2, RotateCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MAX_HEIGHT = 4000;
const LOAD_TIMEOUT_MS = 10_000;

type State = 'loading' | 'ready' | 'failed';

/**
 * An uploaded HTML artifact, served from the separate artifacts origin and
 * sandboxed without same-origin access. The artifacts build injects a script
 * that posts { type: 'artifact:height', height } so the frame fits its
 * content (up to 4000px, then it scrolls inside). No message within 10s of
 * the frame coming into view counts as a failed load.
 */
export function ArtifactFrame({ src, title }: { src: string; title: string }) {
  const [state, setState] = useState<State>(src ? 'loading' : 'failed');
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!src) return;
    const frame = frameRef.current;
    let timer = 0;
    const onMessage = (e: MessageEvent) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data as { type?: unknown; height?: unknown } | null;
      if (data?.type !== 'artifact:height' || typeof data.height !== 'number') return;
      window.clearTimeout(timer);
      frame.style.height = `${Math.min(Math.max(Math.ceil(data.height), 120), MAX_HEIGHT)}px`;
      setState('ready');
    };
    window.addEventListener('message', onMessage);
    // Lazy frames only start loading near the viewport, so the timeout starts there too.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        timer = window.setTimeout(
          () => setState((s) => (s === 'loading' ? 'failed' : s)),
          LOAD_TIMEOUT_MS,
        );
      }
    });
    if (frame) observer.observe(frame);
    return () => {
      window.removeEventListener('message', onMessage);
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [src, attempt]);

  function reload() {
    setState(src ? 'loading' : 'failed');
    setAttempt((n) => n + 1);
  }

  function fullSize() {
    const el = wrapperRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen();
    else if (src) window.open(src, '_blank', 'noopener,noreferrer');
  }

  const toolButton =
    'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-soft hover:bg-nav-active hover:text-text';

  return (
    <div
      ref={wrapperRef}
      className="artifact-frame overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-panel px-2">
        <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold text-muted">
          <ShieldCheck aria-hidden className="size-4" />
          Sandboxed
        </span>
        <span className="ml-auto" />
        <button type="button" onClick={reload} className={toolButton}>
          <RotateCw aria-hidden className="size-4" />
          Reload
        </button>
        <button type="button" onClick={fullSize} className={toolButton} disabled={!src}>
          <Maximize2 aria-hidden className="size-4" />
          Full size
        </button>
      </div>
      <div className="relative">
        {src && (
          <iframe
            key={attempt}
            ref={frameRef}
            src={src}
            title={title}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="lazy"
            className={`block h-[480px] w-full border-0 bg-white ${state === 'failed' ? 'invisible' : ''}`}
          />
        )}
        {state === 'failed' && (
          <div
            role="alert"
            className={`${src ? 'absolute inset-0' : ''} flex min-h-60 flex-col items-center justify-center gap-3 p-6 text-center`}
          >
            <p className="text-soft">This artifact could not be loaded</p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-text hover:bg-nav-active"
            >
              <RotateCw aria-hidden className="size-4" />
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
