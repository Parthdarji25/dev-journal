import { notFound } from 'next/navigation';
import { ResourcesView } from '@/components/content/resources-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { findTrack, sectionMetadata, trackParams } from '@/lib/section-routes';

type Props = { params: Promise<{ track: string }> };

export const dynamicParams = false;
export const generateStaticParams = trackParams;

export async function generateMetadata({ params }: Props) {
  return sectionMetadata('resources', findTrack((await params).track));
}

export default async function ResourcesTrackPage({ params }: Props) {
  const track = findTrack((await params).track);
  if (!track) notFound();
  const list = getContent().resources.find((r) => r.track === track.slug);
  return (
    <SectionPage section="resources" track={track}>
      {list ? <ResourcesView list={list} /> : null}
    </SectionPage>
  );
}
