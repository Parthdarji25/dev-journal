import { notFound } from 'next/navigation';
import { RoadmapView } from '@/components/content/roadmap-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { findTrack, sectionMetadata, trackParams } from '@/lib/section-routes';

type Props = { params: Promise<{ track: string }> };

export const dynamicParams = false;
export const generateStaticParams = trackParams;

export async function generateMetadata({ params }: Props) {
  return sectionMetadata('roadmaps', findTrack((await params).track));
}

export default async function RoadmapTrackPage({ params }: Props) {
  const track = findTrack((await params).track);
  if (!track) notFound();
  const roadmap = getContent().roadmaps.find((r) => r.track === track.slug);
  return (
    <SectionPage section="roadmaps" track={track}>
      {roadmap ? <RoadmapView roadmap={roadmap} /> : null}
    </SectionPage>
  );
}
