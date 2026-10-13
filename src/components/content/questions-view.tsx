import path from 'node:path';
import type { Question } from '@/lib/content';
import type { Track } from '@/lib/schema';
import { renderMarkdown } from '@/lib/content/markdown/render';
import { CodeCopy } from './code-copy';
import { QuestionBrowser } from './question-browser';
import { SearchFilters, searchBody } from './section-page';

export async function QuestionsView({
  track,
  questions,
  indexed = true,
}: {
  track: Track;
  questions: Question[];
  indexed?: boolean;
}) {
  // Images next to the questions live under /content/interview-questions/<track>/assets/.
  const resolveAsset = (src: string) =>
    `/${path.posix.normalize(`content/interview-questions/${track.slug}/${src}`)}`;
  const answers = await Promise.all(questions.map((q) => renderMarkdown(q.body, { resolveAsset })));
  return (
    <div id="question-list" {...(indexed ? searchBody(`${track.name} interview questions`) : {})}>
      {indexed && <SearchFilters section="interview-questions" track={track.slug} />}
      <QuestionBrowser
        items={questions.map((q) => ({
          slug: q.slug,
          question: q.question,
          difficulty: q.difficulty,
          companies: q.companies,
        }))}
        answers={answers.map((a, i) => (
          <div
            key={questions[i]?.slug}
            className="prose-content"
            dangerouslySetInnerHTML={{ __html: a.html }}
          />
        ))}
      />
      <CodeCopy targetId="question-list" />
    </div>
  );
}
