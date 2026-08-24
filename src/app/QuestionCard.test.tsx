import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Question } from '../contracts';
import { QuestionCard, type QuestionSession } from './QuestionCard';

const question: Question = {
  id: 'enem-2024-1', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', year: 2024,
  subjectId: 'matematica', kind: 'single-choice', context: 'Enunciado', files: [], alternativesIntroduction: null,
  alternatives: [
    { id: 'a', label: 'A', text: 'Um', file: null }, { id: 'b', label: 'B', text: 'Dois', file: null },
    { id: 'c', label: 'C', text: 'Três', file: null }, { id: 'd', label: 'D', text: 'Quatro', file: null },
  ], answer: { optionIds: ['b'] },
};
const session: QuestionSession = { startedAt: 1, selectedOptionId: null, outcome: null };
const actions = { onStart: vi.fn(), onAnswer: vi.fn(), onTimeout: vi.fn(), onViewed: vi.fn() };

describe('QuestionCard', () => {
  it('renders however many alternatives the contract provides and answers by id', async () => {
    render(<QuestionCard question={question} position={1} total={1} active session={session} {...actions} />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    await userEvent.click(screen.getByLabelText(/Dois/));
    expect(actions.onAnswer).toHaveBeenCalledWith(question, 'b', expect.any(Number));
  });

  it('shows a controlled state for a future question kind', () => {
    render(<QuestionCard question={{ ...question, kind: 'essay', alternatives: [], answer: {} }} position={1} total={1} active={false} session={session} {...actions} />);
    expect(screen.getByText('Formato em breve')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('locks alternatives after an answer', () => {
    render(<QuestionCard question={question} position={1} total={1} active session={{ ...session, selectedOptionId: 'a', outcome: 'incorrect' }} {...actions} />);
    expect(screen.getByRole('group')).toBeDisabled();
    expect(screen.getByText(/resposta correta está destacada/i)).toBeInTheDocument();
  });
});
