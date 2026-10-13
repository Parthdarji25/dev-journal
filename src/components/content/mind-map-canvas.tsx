'use client';

import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import type { INode, IPureNode } from 'markmap-common';
import type { Markmap } from 'markmap-view';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { buttonClass } from '@/components/ui/styles';
import type { MindNode } from '@/lib/content/markdown/parse';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Markmap renders node content as HTML, so titles are escaped. */
function toMarkmap(node: MindNode): IPureNode {
  return {
    content: escapeHtml(node.title),
    children: node.children.map(toMarkmap),
    payload: { fold: 0 },
  };
}

function setFold(node: INode, depth: number, fold: 0 | 1) {
  node.payload = { ...node.payload, fold: depth > 0 && node.children.length > 0 ? fold : 0 };
  for (const child of node.children) setFold(child, depth + 1, fold);
}

/**
 * The map drawn with Markmap in the track colour. markmap-view (and d3) load
 * lazily from here, so only mind-map pages pay for them.
 */
export function MindMapCanvas({ root, title }: { root: MindNode; title: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mapRef = useRef<Markmap | null>(null);
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const svg = svgRef.current;
    let disposed = false;
    let map: Markmap | null = null;
    void import('markmap-view').then(({ Markmap }) => {
      if (disposed || !svg) return;
      const color = getComputedStyle(svg).getPropertyValue('--tc').trim() || '#888888';
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map = Markmap.create(
        svg,
        {
          color: () => color,
          duration: reduce ? 0 : 300,
          embedGlobalCSS: false,
          maxWidth: 260,
          paddingX: 10,
        },
        toMarkmap(root),
      );
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      disposed = true;
      map?.destroy();
      mapRef.current = null;
      if (svg) svg.replaceChildren();
    };
    // Recreate on theme change so the track colour follows light/dark.
  }, [root, resolvedTheme]);

  async function foldAll(fold: 0 | 1) {
    const map = mapRef.current;
    if (!map?.state.data) return;
    setFold(map.state.data, 0, fold);
    await map.renderData();
    await map.fit();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void foldAll(0)}
          disabled={!ready}
          className={buttonClass.secondary}
        >
          <ChevronsUpDown aria-hidden className="size-4" />
          Expand all
        </button>
        <button
          type="button"
          onClick={() => void foldAll(1)}
          disabled={!ready}
          className={buttonClass.secondary}
        >
          <ChevronsDownUp aria-hidden className="size-4" />
          Collapse all
        </button>
      </div>
      <svg
        ref={svgRef}
        role="img"
        aria-label={`Mind map: ${title}. The same content is listed in the outline below.`}
        className="markmap block h-[420px] w-full rounded-lg border border-border bg-surface sm:h-[520px]"
      />
    </div>
  );
}
