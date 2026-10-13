import { QuestionsView } from '@/components/content/questions-view';
import { SectionPage } from '@/components/content/section-page';
import { getContent } from '@/lib/content';
import { firstTrack, sectionMetadata } from '@/lib/section-routes';

export function generateMetadata() {
  return sectionMetadata('interview-questions', firstTrack());
}

export default function InterviewQuestionsIndexPage() {
  const track = firstTrack();
  const questions = getContent().questions.filter((q) => q.track === track.slug);
  return (
    <SectionPage section="interview-questions" track={track} isIndex>
      {questions.length ? (
        <QuestionsView track={track} questions={questions} indexed={false} />
      ) : null}
    </SectionPage>
  );
}
