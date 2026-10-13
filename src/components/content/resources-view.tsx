import { EmptyState } from '@/components/ui/empty-state';
import type { ResourceList } from '@/lib/content';
import { ResourceBrowser } from './resource-browser';
import { SearchFilters, searchBody } from './section-page';

export function ResourcesView({ list, indexed = true }: { list: ResourceList; indexed?: boolean }) {
  if (list.links.length === 0)
    return <EmptyState>Links for this track are coming soon.</EmptyState>;
  return (
    <div {...(indexed ? searchBody(list.title) : {})}>
      {indexed && <SearchFilters section="resources" track={list.track} />}
      <ResourceBrowser links={list.links} />
    </div>
  );
}
