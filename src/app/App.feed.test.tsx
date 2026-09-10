import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Question } from '../contracts';
import { App } from './App';
import type { AuthPort } from './auth';
import { demoQuestions } from './demoQuestions';
import type { ActiveExamPort, ActiveExamState, PackagePort, QuestionSourcePort } from './ports';
import { MemoryProgressPort, MemoryStudySessionPort } from './ports';

const question = (id: string, editionId: string, year: number, subjectId: string, context: string): Question => ({
  ...demoQuestions[0]!, id, editionId, year, subjectId, context,
});

const editions: Record<string, Question[]> = {
  'enem-2022': [
    question('enem-2022-matematica', 'enem-2022', 2022, 'matematica', 'Matemática da edição 2022'),
    question('enem-2022-linguagens', 'enem-2022', 2022, 'linguagens', 'Linguagens da edição 2022'),
  ],
  'enem-2023': [
    question('enem-2023-matematica', 'enem-2023', 2023, 'matematica', 'Matemática da edição 2023'),
    question('enem-2023-humanas', 'enem-2023', 2023, 'ciencias-humanas', 'Humanas da edição 2023'),
  ],
};

const packages: PackagePort = {
  list: vi.fn().mockResolvedValue([
    { id: 'enem-2022', institutionId: 'inep', examId: 'enem', editionId: 'enem-2022', label: 'ENEM 2022', year: 2022, byteSize: 1, questionCount: 2, state: 'downloaded' },
    { id: 'enem-2023', institutionId: 'inep', examId: 'enem', editionId: 'enem-2023', label: 'ENEM 2023', year: 2023, byteSize: 1, questionCount: 2, state: 'downloaded' },
  ]),
  install: vi.fn(),
  remove: vi.fn(),
};

const authPort: AuthPort = {
  getSession: vi.fn().mockResolvedValue(null), signInEmail: vi.fn(), signUpEmail: vi.fn(), signInGoogle: vi.fn(), signOut: vi.fn(),
  requestPasswordReset: vi.fn(), resetPassword: vi.fn(), sendVerification: vi.fn(),
};
const authRuntime = { coordinator: undefined, sync: vi.fn().mockResolvedValue(true), clear: vi.fn() };

describe('active edition feed', () => {
  it('keeps the subject filter inside the selected edition and reloads from its first question', async () => {
    let active: ActiveExamState = { status: 'active', packageId: 'enem-2022', editionId: 'enem-2022' };
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn(async () => active),
      select: vi.fn(async (packageId, editionId) => {
        active = { status: 'active', packageId, editionId };
        return active;
      }),
    };
    const questionSource: QuestionSourcePort = {
      load: vi.fn(async () => active.status === 'active' ? editions[active.editionId] ?? [] : []),
    };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} questionSource={questionSource} packagePort={packages} activeExamPort={activeExamPort} authPort={authPort} authRuntime={authRuntime} />);
    await screen.findByText('Matemática da edição 2022');
    expect(screen.queryByText(/edição 2023/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.selectOptions(screen.getByLabelText('Matéria'), 'matematica');
    expect(screen.queryByText('Linguagens da edição 2022')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Prova')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Provas' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Estudar ENEM 2023' }));

    await waitFor(() => expect(screen.getByText('Matemática da edição 2023')).toBeInTheDocument());
    expect(activeExamPort.select).toHaveBeenCalledWith('enem-2023', 'enem-2023');
    expect(screen.queryByText(/edição 2022/)).not.toBeInTheDocument();
    expect(screen.queryByText('Humanas da edição 2023')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Questão 1 de 1' })).toBeInTheDocument();
  });

  it('does not fall back to demo questions when the active selection has no content', async () => {
    const questionSource: QuestionSourcePort = { load: vi.fn().mockResolvedValue([]) };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} questionSource={questionSource} authPort={authPort} authRuntime={authRuntime} />);

    expect(await screen.findByRole('heading', { name: 'Nenhuma questão por aqui' })).toBeInTheDocument();
    expect(screen.queryByText(/Uma ciclovia tem 12 km/)).not.toBeInTheDocument();
  });
});
