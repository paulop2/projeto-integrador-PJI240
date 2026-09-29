import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Question } from '../contracts';
import { demoQuestions } from './demoQuestions';
import type { QuestionSession } from './QuestionCard';
import { QuestionFeed } from './QuestionFeed';

const actions = { onActiveIndex: vi.fn(), onStart: vi.fn(), onPause: vi.fn(), onAnswer: vi.fn(), onTimeout: vi.fn(), onViewed: vi.fn() };

describe('QuestionFeed', () => {
  it('windows cards to the active item plus two neighbors on each side', () => {
    const questions: Question[] = Array.from({ length: 8 }, (_, index) => ({ ...demoQuestions[0]!, id: `q-${index}`, context: `Enunciado ${index}` }));
    render(<QuestionFeed questions={questions} activeIndex={4} sessions={{}} {...actions} />);
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.queryByText('Enunciado 1')).not.toBeInTheDocument();
    expect(screen.getByText('Enunciado 4')).toBeInTheDocument();
  });

  it('returns the feed to the first position when its questions change', () => {
    const props = { activeIndex: 0, sessions: {}, ...actions };
    const { rerender } = render(<QuestionFeed questions={demoQuestions.slice(0, 2)} {...props} />);
    const feed = screen.getByRole('main', { name: 'Questões' });
    feed.scrollTop = 480;

    rerender(<QuestionFeed questions={demoQuestions.slice(2)} {...props} />);

    expect(feed.scrollTop).toBe(0);
  });

  it('pauses the previous question and starts the new active one when the active index changes', () => {
    const onStart = vi.fn();
    const onPause = vi.fn();
    const questions: Question[] = Array.from({ length: 4 }, (_, index) => ({ ...demoQuestions[0]!, id: `q-${index}`, context: `Enunciado ${index}` }));
    const sessions: Record<string, QuestionSession> = {
      'q-0': { elapsedMs: 30_000, startedAt: Date.now(), selectedOptionId: null, outcome: null },
    };

    const { rerender } = render(<QuestionFeed questions={questions} activeIndex={0} sessions={sessions} {...actions} onStart={onStart} onPause={onPause} />);
    expect(onPause).not.toHaveBeenCalled();

    rerender(<QuestionFeed questions={questions} activeIndex={1} sessions={sessions} {...actions} onStart={onStart} onPause={onPause} />);

    expect(onPause).toHaveBeenCalledWith('q-0');
    expect(onStart).toHaveBeenCalledWith('q-1');
  });
});
