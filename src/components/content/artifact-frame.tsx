'use client';

import { Maximize2, Minimize2, RotateCw, ShieldCheck } from 'lucide-react';
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
  const [fullSize, setFullSize] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /** Leaves Full size, and the browser's fullscreen with it. */
  function closeFullSize() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setFullSize(false);
  }

  // Full size fills the screen with the frame. Esc, or leaving the browser's
  // fullscreen (back gesture, browser UI), closes it; the page stays put behind.
  useEffect(() => {
    if (!fullSize) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullSize(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFullSize();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKey);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKey);
      root.style.overflow = overflow;
    };
  }, [fullSize]);

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

  function toggleFullSize() {
    if (fullSize) {
      closeFullSize();
      return;
    }
    setFullSize(true);
    // The browser's own fullscreen where it allows it (not on iPhone); the
    // fixed layout fills the screen either way.
    wrapperRef.current?.requestFullscreen?.().catch(() => {});
  }

  const toolButton =
    'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-soft hover:bg-nav-active hover:text-text';

  return (
    <div
      ref={wrapperRef}
      className={`artifact-frame overflow-hidden bg-surface ${
        fullSize ? 'fixed inset-0 z-60 flex flex-col' : 'rounded-xl border border-border'
      }`}
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
        <button type="button" onClick={toggleFullSize} className={toolButton} disabled={!src}>
          {fullSize ? (
            <Minimize2 aria-hidden className="size-4" />
          ) : (
            <Maximize2 aria-hidden className="size-4" />
          )}
          {fullSize ? 'Exit full size' : 'Full size'}
        </button>
      </div>
      <div className={fullSize ? 'relative min-h-0 flex-1' : 'relative'}>
        {src && (
          <iframe
            key={attempt}
            ref={frameRef}
            src={src}
            title={title}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="lazy"
            // Full size: fill the space below the toolbar, whatever height the content reported.
            className={`block w-full border-0 bg-white ${
              fullSize ? 'absolute inset-0 h-full!' : 'h-120'
            } ${state === 'failed' ? 'invisible' : ''}`}
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
