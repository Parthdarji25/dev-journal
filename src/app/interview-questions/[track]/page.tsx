import { notFound } from 'next/navigation';
import { QuestionsView } from '@/components/content/questions-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { findTrack, sectionMetadata, trackParams } from '@/lib/section-routes';

type Props = { params: Promise<{ track: string }> };

export const dynamicParams = false;
export const generateStaticParams = trackParams;

export async function generateMetadata({ params }: Props) {
  return sectionMetadata('interview-questions', findTrack((await params).track));
}

export default async function InterviewQuestionsTrackPage({ params }: Props) {
  const track = findTrack((await params).track);
  if (!track) notFound();
  const questions = getContent().questions.filter((q) => q.track === track.slug);
  return (
    <SectionPage section="interview-questions" track={track}>
      {questions.length ? <QuestionsView track={track} questions={questions} /> : null}
    </SectionPage>
  );
}
