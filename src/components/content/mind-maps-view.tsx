import type { MindMap } from '@/lib/content';
import type { MindNode } from '@/lib/content/markdown/parse';
import { versionedArtifactUrl } from '@/lib/content/artifact-url';
import { ArtifactFrame } from './artifact-frame';
import { ItemPills } from './item-pills';
import { MindMapCanvas } from './mind-map-canvas';
import { SearchFilters, searchBody } from './section-page';

function Outline({ nodes }: { nodes: MindNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {nodes.map((n, i) => (
        <li key={i}>
          {n.title}
          {n.children.length > 0 && <Outline nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

/** Map selector plus the selected map. Only a map's own page is indexed for search. */
export function MindMapsView({
  maps,
  selected,
  indexed,
}: {
  maps: MindMap[];
  selected: MindMap;
  indexed: boolean;
}) {
  return (
    <div>
      <ItemPills label="Mind maps" items={maps} selected={selected.slug} />
      <div {...(indexed ? searchBody(selected.title) : {})}>
        {indexed && <SearchFilters section="mind-maps" track={selected.track} />}
        <h3 className="mb-4 text-xl">{selected.title}</h3>
        {selected.format === 'html' || !selected.root ? (
          <ArtifactFrame src={versionedArtifactUrl(selected.file)} title={selected.title} />
        ) : (
          <>
            <MindMapCanvas root={selected.root} title={selected.title} />
            <details className="mt-4 rounded-lg border border-border bg-surface p-4">
              <summary className="min-h-11 cursor-pointer content-center font-semibold">
                Outline
              </summary>
              <div className="mt-3 text-soft">
                <p className="font-semibold text-text">{selected.root.title}</p>
                <Outline nodes={selected.root.children} />
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
