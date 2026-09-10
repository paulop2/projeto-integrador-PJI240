import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Question } from '../contracts';
import { App } from './App';
import type { AuthPort } from './auth';
import { demoQuestions } from './demoQuestions';
import type { ActiveExamPort, ActiveExamState, PackagePort, QuestionSourcePort } from './ports';
import { MemoryForeignLanguagePreferencePort, MemoryProgressPort, MemoryStudySessionPort } from './ports';

const question = (id: string, editionId: string, year: number, subjectId: string, context: string): Question => ({
  ...demoQuestions[0]!, id, editionId, year, subjectId, context, language: null,
});

const editions: Record<string, Question[]> = {
  'enem-2022': [
    question('enem-enem-2022-1', 'enem-2022', 2022, 'matematica', 'Matemática ENEM 2022'),
    question('enem-enem-2022-2', 'enem-2022', 2022, 'linguagens', 'Linguagens ENEM 2022'),
  ],
  'enem-2023': [
    question('enem-enem-2023-1', 'enem-2023', 2023, 'matematica', 'Matemática ENEM 2023'),
    question('enem-enem-2023-2', 'enem-2023', 2023, 'ciencias-humanas', 'Humanas ENEM 2023'),
  ],
};

const packages: PackagePort = {
  list: vi.fn().mockResolvedValue([
    { id: 'enem-2022-completo', institutionId: 'inep', examId: 'enem', editionId: 'enem-2022', label: 'ENEM 2022', year: 2022, byteSize: 1, questionCount: 2, state: 'downloaded' },
    { id: 'enem-2023-completo', institutionId: 'inep', examId: 'enem', editionId: 'enem-2023', label: 'ENEM 2023', year: 2023, byteSize: 1, questionCount: 2, state: 'downloaded' },
  ]),
  install: vi.fn(),
  remove: vi.fn(),
};

const authPort: AuthPort = {
  getSession: vi.fn().mockResolvedValue(null), signInEmail: vi.fn(), signUpEmail: vi.fn(), signInGoogle: vi.fn(), signOut: vi.fn(),
  requestPasswordReset: vi.fn(), resetPassword: vi.fn(), sendVerification: vi.fn(),
};
const authRuntime = { coordinator: undefined, sync: vi.fn().mockResolvedValue(true), clear: vi.fn() };

describe('multi-exam feed', () => {
  it('never crosses editions when filtering by a shared subject or switching the active exam', async () => {
    let active: ActiveExamState = { status: 'active', packageId: 'enem-2022-completo', editionId: 'enem-2022' };
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

    render(<App
      progressPort={new MemoryProgressPort()}
      sessionPort={new MemoryStudySessionPort()}
      questionSource={questionSource}
      packagePort={packages}
      activeExamPort={activeExamPort}
      foreignLanguagePreferencePort={new MemoryForeignLanguagePreferencePort(null)}
      authPort={authPort}
      authRuntime={authRuntime}
    />);

    await screen.findByText('Matemática ENEM 2022');

    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.selectOptions(screen.getByLabelText('Matéria'), 'matematica');
    expect(screen.getByText('Matemática ENEM 2022')).toBeInTheDocument();
    expect(screen.queryByText('Linguagens ENEM 2022')).not.toBeInTheDocument();
    expect(screen.queryByText('Matemática ENEM 2023')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Provas' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Estudar ENEM 2023' }));

    expect(await screen.findByText('Matemática ENEM 2023')).toBeInTheDocument();
    expect(activeExamPort.select).toHaveBeenCalledWith('enem-2023-completo', 'enem-2023');
    expect(screen.queryByText('Matemática ENEM 2022')).not.toBeInTheDocument();
    expect(screen.queryByText('Humanas ENEM 2023')).not.toBeInTheDocument();
  });
});
