'use client';

import type { EditorView } from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';

/**
 * CodeMirror 6 with markdown support, loaded lazily on first use. Colours
 * come from the site's CSS variables, so it follows light and dark mode.
 */
export function MarkdownEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange(value: string): void;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValue = useRef(value);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let view: EditorView | undefined;
    void (async () => {
      const [
        { basicSetup },
        { markdown },
        { EditorView: View },
        { EditorState },
        language,
        { tags },
      ] = await Promise.all([
        import('codemirror'),
        import('@codemirror/lang-markdown'),
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/language'),
        import('@lezer/highlight'),
      ]);
      if (cancelled || !host.current) return;
      const highlight = language.HighlightStyle.define([
        { tag: tags.heading, fontWeight: '700', color: 'var(--text)' },
        { tag: tags.strong, fontWeight: '700' },
        { tag: tags.emphasis, fontStyle: 'italic' },
        { tag: tags.strikethrough, textDecoration: 'line-through' },
        { tag: [tags.link, tags.url], color: 'var(--status-renamed)' },
        { tag: tags.monospace, color: 'var(--status-modified)' },
        { tag: tags.quote, color: 'var(--soft)', fontStyle: 'italic' },
        {
          tag: [tags.processingInstruction, tags.contentSeparator, tags.meta, tags.labelName],
          color: 'var(--muted)',
        },
      ]);
      const theme = View.theme({
        '&': {
          backgroundColor: 'var(--surface)',
          color: 'var(--text)',
          fontSize: '14px',
          border: '1px solid var(--border)',
          borderRadius: '10px',
        },
        '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '2px' },
        '.cm-scroller': {
          minHeight: '26rem',
          fontFamily: 'var(--font-code), ui-monospace, monospace',
        },
        '.cm-content': { caretColor: 'var(--text)', padding: '12px 0' },
        '.cm-gutters': {
          backgroundColor: 'var(--panel)',
          color: 'var(--muted)',
          border: 'none',
          borderRight: '1px solid var(--border)',
          borderRadius: '10px 0 0 10px',
        },
        '.cm-activeLine': {
          backgroundColor: 'color-mix(in srgb, var(--nav-active) 55%, transparent)',
        },
        '.cm-activeLineGutter': { backgroundColor: 'var(--nav-active)' },
        '.cm-cursor': { borderLeftColor: 'var(--text)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
          backgroundColor: 'color-mix(in srgb, var(--ring) 30%, transparent)',
        },
      });
      view = new View({
        parent: host.current,
        state: EditorState.create({
          doc: initialValue.current,
          extensions: [
            basicSetup,
            markdown(),
            View.lineWrapping,
            language.syntaxHighlighting(highlight),
            theme,
            View.contentAttributes.of({ 'aria-label': label }),
            View.updateListener.of((update) => {
              if (update.docChanged) onChangeRef.current(update.state.doc.toString());
            }),
          ],
        }),
      });
      viewRef.current = view;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [label]);

  // Outside changes (restoring or discarding a draft) replace the document.
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value, ready]);

  return (
    <div>
      <div ref={host} />
      {!ready && (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">
          Loading the editor...
        </p>
      )}
    </div>
  );
}
