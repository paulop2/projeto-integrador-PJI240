import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Question } from '../contracts';
import { demoQuestions } from './demoQuestions';
import { QuestionFeed } from './QuestionFeed';

describe('QuestionFeed', () => {
  it('windows cards to the active item plus two neighbors on each side', () => {
    const questions: Question[] = Array.from({ length: 8 }, (_, index) => ({ ...demoQuestions[0]!, id: `q-${index}`, context: `Enunciado ${index}` }));
    render(<QuestionFeed questions={questions} activeIndex={4} sessions={{}} onActiveIndex={vi.fn()} onStart={vi.fn()} onAnswer={vi.fn()} onTimeout={vi.fn()} onViewed={vi.fn()} />);
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.queryByText('Enunciado 1')).not.toBeInTheDocument();
    expect(screen.getByText('Enunciado 4')).toBeInTheDocument();
  });
});
