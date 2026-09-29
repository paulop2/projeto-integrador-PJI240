import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Question } from '../contracts';
import { QuestionCard, type QuestionSession } from './QuestionCard';

const question: Question = {
  id: 'enem-2024-1', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', year: 2024,
  subjectId: 'matematica', language: null, kind: 'single-choice', context: 'Enunciado', files: [], alternativesIntroduction: null,
  alternatives: [
    { id: 'a', label: 'A', text: 'Um', file: null }, { id: 'b', label: 'B', text: 'Dois', file: null },
    { id: 'c', label: 'C', text: 'Três', file: null }, { id: 'd', label: 'D', text: 'Quatro', file: null },
  ], answer: { optionIds: ['b'] },
};
const session: QuestionSession = { elapsedMs: 0, startedAt: 1, selectedOptionId: null, outcome: null, struckOptionIds: [] };
const actions = { onStart: vi.fn(), onPause: vi.fn(), onAnswer: vi.fn(), onTimeout: vi.fn(), onViewed: vi.fn(), onToggleStrike: vi.fn() };

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

  it('pauses the timer as soon as it stops being the active question', () => {
    const onPause = vi.fn();
    const running: QuestionSession = { elapsedMs: 0, startedAt: Date.now(), selectedOptionId: null, outcome: null, struckOptionIds: [] };
    const { rerender } = render(<QuestionCard question={question} position={1} total={1} active session={running} {...actions} onPause={onPause} />);
    expect(onPause).not.toHaveBeenCalled();

    rerender(<QuestionCard question={question} position={1} total={1} active={false} session={running} {...actions} onPause={onPause} />);
    expect(onPause).toHaveBeenCalledWith(question.id);
  });

  it('resumes from the accumulated time when it becomes active and shows the remaining time', () => {
    const onStart = vi.fn();
    const paused: QuestionSession = { elapsedMs: 42_000, startedAt: null, selectedOptionId: null, outcome: null, struckOptionIds: [] };
    const { rerender } = render(<QuestionCard question={question} position={1} total={1} active={false} session={paused} {...actions} onStart={onStart} />);
    expect(screen.getByRole('timer')).toHaveAccessibleName('2:18 restantes');
    expect(onStart).not.toHaveBeenCalled();

    rerender(<QuestionCard question={question} position={1} total={1} active session={paused} {...actions} onStart={onStart} />);
    expect(onStart).toHaveBeenCalledWith(question.id);
  });

  it('reports the active elapsed time when answering, excluding pauses', async () => {
    const onAnswer = vi.fn();
    const partial: QuestionSession = { elapsedMs: 10_000, startedAt: Date.now() - 5_000, selectedOptionId: null, outcome: null, struckOptionIds: [] };
    render(<QuestionCard question={question} position={1} total={1} active session={partial} {...actions} onAnswer={onAnswer} />);

    await userEvent.click(screen.getByLabelText(/Dois/));

    const elapsed = onAnswer.mock.calls[0]![2] as number;
    expect(elapsed).toBeGreaterThanOrEqual(15_000);
    expect(elapsed).toBeLessThan(15_500);
  });

  it('toggles a strike draft without answering the question', async () => {
    const onAnswer = vi.fn();
    const onToggleStrike = vi.fn();
    render(<QuestionCard question={question} position={1} total={1} active session={session} {...actions} onAnswer={onAnswer} onToggleStrike={onToggleStrike} />);

    const strike = screen.getByRole('button', { name: 'Riscar alternativa B' });
    expect(strike).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(strike);

    expect(onToggleStrike).toHaveBeenCalledWith(question.id, 'b');
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('marks a struck alternative with aria-pressed, a textual indicator and line-through', () => {
    render(<QuestionCard question={question} position={1} total={1} active session={{ ...session, struckOptionIds: ['b'] }} {...actions} />);

    expect(screen.getByRole('button', { name: 'Desmarcar rascunho da alternativa B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('riscada')).toBeInTheDocument();
    expect(screen.getByText(/Dois/).closest('.alternative')).toHaveClass('is-struck');
  });

  it('toggles the draft control with the keyboard', async () => {
    const onToggleStrike = vi.fn();
    render(<QuestionCard question={question} position={1} total={1} active session={session} {...actions} onToggleStrike={onToggleStrike} />);

    screen.getByRole('button', { name: 'Riscar alternativa A' }).focus();
    await userEvent.keyboard(' ');

    expect(onToggleStrike).toHaveBeenCalledWith(question.id, 'a');
  });

  it('keeps the struck draft visible but disables the control when the question is locked', () => {
    render(<QuestionCard question={question} position={1} total={1} active session={{ ...session, selectedOptionId: 'a', outcome: 'incorrect', struckOptionIds: ['b'] }} {...actions} />);

    expect(screen.getByRole('button', { name: 'Desmarcar rascunho da alternativa B' })).toBeDisabled();
    expect(screen.getByText('riscada')).toBeInTheDocument();
  });

  it('still allows selecting a struck alternative', async () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={question} position={1} total={1} active session={{ ...session, struckOptionIds: ['b'] }} {...actions} onAnswer={onAnswer} />);

    await userEvent.click(screen.getByLabelText(/Dois/));

    expect(onAnswer).toHaveBeenCalledWith(question, 'b', expect.any(Number));
  });
});
