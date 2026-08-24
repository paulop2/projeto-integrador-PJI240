import { useEffect, useRef } from 'react';

import type { Question } from '../contracts';
import { QuestionCard, type QuestionSession } from './QuestionCard';

interface Props {
  questions: Question[];
  activeIndex: number;
  sessions: Record<string, QuestionSession>;
  onActiveIndex: (index: number) => void;
  onStart: (questionId: string) => void;
  onAnswer: (question: Question, optionId: string, elapsedMs: number) => void;
  onTimeout: (question: Question) => void;
  onViewed: (question: Question) => void;
}

const blankSession: QuestionSession = { startedAt: null, selectedOptionId: null, outcome: null };

export function QuestionFeed({ questions, activeIndex, sessions, onActiveIndex, ...actions }: Props) {
  const feedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const index = visible?.target.getAttribute('data-index');
      if (index !== undefined && index !== null) onActiveIndex(Number(index));
    }, { root, threshold: [0.55, 0.75] });
    root.querySelectorAll('[data-index]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [onActiveIndex, questions]);

  return (
    <main ref={feedRef} className="question-feed" aria-label="Questões">
      {questions.map((question, index) => (
        <section className="question-slide" data-index={index} key={question.id} aria-label={`Questão ${index + 1} de ${questions.length}`}>
          {Math.abs(index - activeIndex) <= 2 ? (
            <QuestionCard
              question={question}
              position={index + 1}
              total={questions.length}
              active={index === activeIndex}
              session={sessions[question.id] ?? blankSession}
              {...actions}
            />
          ) : <div className="question-placeholder" aria-hidden="true" />}
        </section>
      ))}
    </main>
  );
}
