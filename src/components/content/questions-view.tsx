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
  const answers = await Promise.all(questions.map((q) => renderMarkdown(q.body)));
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
