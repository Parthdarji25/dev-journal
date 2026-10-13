import type { CheatSheet } from '@/lib/content';
import { versionedArtifactUrl } from '@/lib/content/artifact-url';
import { ArtifactFrame } from './artifact-frame';
import { CheatSheetBrowser } from './cheat-sheet-browser';
import { ItemPills } from './item-pills';
import { SearchFilters, searchBody } from './section-page';

/** Sheet selector plus the selected sheet. Only a sheet's own page is indexed for search. */
export function CheatSheetsView({
  sheets,
  selected,
  indexed,
}: {
  sheets: CheatSheet[];
  selected: CheatSheet;
  indexed: boolean;
}) {
  return (
    <div>
      <ItemPills label="Cheat sheets" items={sheets} selected={selected.slug} />
      <div {...(indexed ? searchBody(selected.title) : {})}>
        {indexed && <SearchFilters section="cheat-sheets" track={selected.track} />}
        <h3 className="text-xl">{selected.title}</h3>
        {selected.description && <p className="mt-1 text-soft">{selected.description}</p>}
        <div className="mt-6">
          {selected.format === 'html' ? (
            <ArtifactFrame src={versionedArtifactUrl(selected.file)} title={selected.title} />
          ) : (
            <CheatSheetBrowser groups={selected.groups} />
          )}
        </div>
      </div>
    </div>
  );
}
