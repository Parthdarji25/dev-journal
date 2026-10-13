import { ResourcesView } from '@/components/content/resources-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { firstTrack, sectionMetadata } from '@/lib/section-routes';

export function generateMetadata() {
  return sectionMetadata('resources', firstTrack());
}

export default function ResourcesIndexPage() {
  const track = firstTrack();
  const list = getContent().resources.find((r) => r.track === track.slug);
  return (
    <SectionPage section="resources" track={track} isIndex>
      {list ? <ResourcesView list={list} indexed={false} /> : null}
    </SectionPage>
  );
}
