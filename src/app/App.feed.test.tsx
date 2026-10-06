import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ForeignLanguage, Question } from '../contracts';
import { App } from './App';
import type { AuthPort } from './auth';
import { demoQuestions } from './demoQuestions';
import type { ActiveExamPort, ActiveExamState, ForeignLanguagePreferencePort, PackagePort, QuestionSourcePort } from './ports';
import { MemoryForeignLanguagePreferencePort, MemoryProgressPort, MemoryStudySessionPort } from './ports';

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
  getSession: vi.fn().mockResolvedValue(null), signIn: vi.fn(), signOut: vi.fn(),
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
    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    await screen.findByText('Matemática da edição 2022');
    expect(screen.queryByText(/edição 2023/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.selectOptions(screen.getByLabelText('Matéria'), 'matematica');
    expect(screen.queryByText('Linguagens da edição 2022')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Prova')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Provas' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Estudar ENEM 2023' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
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

  it('shows onboarding instead of demo content when there are no downloaded exams', async () => {
    const packagePort: PackagePort = {
      list: vi.fn().mockResolvedValue([
        { id: 'enem-2023', institutionId: 'inep', examId: 'enem', editionId: 'enem-2023', label: 'ENEM 2023', year: 2023, byteSize: 1, questionCount: 2, state: 'available' },
      ]),
      install: vi.fn(),
      remove: vi.fn(),
    };
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'empty' }),
      select: vi.fn(),
    };
    const questionSource: QuestionSourcePort = { load: vi.fn().mockResolvedValue(demoQuestions) };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} questionSource={questionSource} packagePort={packagePort} activeExamPort={activeExamPort} authPort={authPort} authRuntime={authRuntime} />);

    expect(await screen.findByRole('heading', { name: 'Baixe uma prova para começar a estudar.' })).toBeInTheDocument();
    expect(screen.queryByText(/Uma ciclovia tem 12 km/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver provas disponíveis' }));
    expect(await screen.findByRole('dialog', { name: 'Provas' })).toBeInTheDocument();
  });

  it('requires an explicit choice when multiple exams are downloaded and then loads only that edition', async () => {
    let active: ActiveExamState = { status: 'selection-required' };
    const packagePort: PackagePort = {
      list: vi.fn().mockResolvedValue([
        { id: 'enem-2022', institutionId: 'inep', examId: 'enem', editionId: 'enem-2022', label: 'ENEM 2022', year: 2022, byteSize: 1, questionCount: 2, state: 'downloaded' },
        { id: 'enem-2023', institutionId: 'inep', examId: 'enem', editionId: 'enem-2023', label: 'ENEM 2023', year: 2023, byteSize: 1, questionCount: 2, state: 'downloaded' },
      ]),
      install: vi.fn(),
      remove: vi.fn(),
    };
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn(async () => active),
      select: vi.fn(async (packageId, editionId) => {
        active = { status: 'active', packageId, editionId };
        return active;
      }),
    };
    const questionSource: QuestionSourcePort = {
      load: vi.fn(async () => active.status === 'active' ? editions[active.editionId] ?? [] : Object.values(editions).flat()),
    };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} questionSource={questionSource} packagePort={packagePort} activeExamPort={activeExamPort} authPort={authPort} authRuntime={authRuntime} />);

    expect(await screen.findByRole('heading', { name: 'Escolha uma prova baixada para continuar estudando.' })).toBeInTheDocument();
    expect(screen.queryByText(/edição 2022|edição 2023/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Escolher prova' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Estudar ENEM 2022' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    expect(await screen.findByText('Matemática da edição 2022')).toBeInTheDocument();
    expect(screen.queryByText(/edição 2023/)).not.toBeInTheDocument();
  });

  it('requires one language, composes it with the subject filter, and restores it after reload', async () => {
    const languageQuestions: Question[] = [
      question('enem-enem-2023-6', 'enem-2023', 2023, 'matematica', 'Questão comum de matemática'),
      { ...question('enem-enem-2023-1', 'enem-2023', 2023, 'linguagens', 'Questão em espanhol'), language: 'espanhol' },
      { ...question('enem-enem-2023-1-ingles', 'enem-2023', 2023, 'linguagens', 'Questão em inglês'), language: 'ingles' },
    ];
    const questionSource: QuestionSourcePort = { load: vi.fn().mockResolvedValue(languageQuestions) };
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' }),
      select: vi.fn(),
    };
    let saved: ForeignLanguage | null = null;
    const preference: ForeignLanguagePreferencePort = {
      load: vi.fn(async () => saved),
      save: vi.fn(async (language) => { saved = language; }),
    };
    const props = {
      progressPort: new MemoryProgressPort(), sessionPort: new MemoryStudySessionPort(), questionSource,
      activeExamPort, foreignLanguagePreferencePort: preference, authPort, authRuntime,
    };

    const first = render(<App {...props} />);
    expect(await screen.findByRole('heading', { name: 'Escolha o idioma estrangeiro para estudar.' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByText(/Questão em inglês|Questão em espanhol|Questão comum/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Inglês' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    expect(await screen.findByText('Questão em inglês')).toBeInTheDocument();
    expect(screen.getByText('Questão comum de matemática')).toBeInTheDocument();
    expect(screen.queryByText('Questão em espanhol')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.selectOptions(screen.getByLabelText('Matéria'), 'linguagens');
    expect(screen.queryByText('Questão comum de matemática')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Espanhol' }));
    expect(await screen.findByText('Questão em espanhol')).toBeInTheDocument();
    expect(screen.queryByText('Questão em inglês')).not.toBeInTheDocument();
    expect(preference.save).toHaveBeenLastCalledWith('espanhol');

    first.unmount();
    render(<App {...props} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    expect(await screen.findByText('Questão em espanhol')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Escolha o idioma estrangeiro para estudar.' })).not.toBeInTheDocument();
  });

  it('does not show a language control for an edition without variants', async () => {
    const questionSource: QuestionSourcePort = { load: vi.fn().mockResolvedValue(editions['enem-2022']) };
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2022', editionId: 'enem-2022' }),
      select: vi.fn(),
    };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} questionSource={questionSource} activeExamPort={activeExamPort} foreignLanguagePreferencePort={new MemoryForeignLanguagePreferencePort('ingles')} authPort={authPort} authRuntime={authRuntime} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    expect(await screen.findByText('Matemática da edição 2022')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.queryByRole('group', { name: 'Idioma estrangeiro' })).not.toBeInTheDocument();
  });

  it('keeps stored answers isolated between language variant IDs', async () => {
    const spanish = { ...question('enem-enem-2023-1', 'enem-2023', 2023, 'linguagens', 'Resposta em espanhol'), language: 'espanhol' as const };
    const english = { ...question('enem-enem-2023-1-ingles', 'enem-2023', 2023, 'linguagens', 'Answer in English'), language: 'ingles' as const };
    const sessions = new MemoryStudySessionPort();
    await sessions.save(spanish.id, { elapsedMs: 0, startedAt: 1, selectedOptionId: 'c', outcome: 'correct', struckOptionIds: [] });
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' }),
      select: vi.fn(),
    };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={sessions} questionSource={{ load: vi.fn().mockResolvedValue([spanish, english]) }} activeExamPort={activeExamPort} foreignLanguagePreferencePort={new MemoryForeignLanguagePreferencePort('ingles')} authPort={authPort} authRuntime={authRuntime} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    const englishCard = (await screen.findByText('Answer in English')).closest('article');
    if (!englishCard) throw new Error('English question card was not rendered');
    expect(within(englishCard).getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Espanhol' }));
    const spanishCard = (await screen.findByText('Resposta em espanhol')).closest('article');
    if (!spanishCard) throw new Error('Spanish question card was not rendered');
    expect(within(spanishCard).getByRole('radio', { name: /9 km/ })).toBeChecked();
  });

  it('restores accumulated active time from the session and reports it when answering', async () => {
    const sessions = new MemoryStudySessionPort();
    await sessions.save('enem-2023-matematica', { elapsedMs: 42_000, startedAt: null, selectedOptionId: null, outcome: null, struckOptionIds: [] });
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' }),
      select: vi.fn(),
    };
    const questionSource: QuestionSourcePort = { load: vi.fn().mockResolvedValue(editions['enem-2023']) };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={sessions} questionSource={questionSource} activeExamPort={activeExamPort} authPort={authPort} authRuntime={authRuntime} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    const first = await screen.findByRole('region', { name: 'Questão 1 de 2' });
    expect(within(first).getByRole('timer')).toHaveAccessibleName('2:18 restantes');

    await userEvent.click(within(first).getAllByRole('radio')[0]!);

    await waitFor(async () => {
      const stored = (await sessions.load())['enem-2023-matematica'];
      expect(stored).toMatchObject({ startedAt: null, selectedOptionId: 'a', outcome: 'incorrect' });
      expect(stored?.elapsedMs).toBeGreaterThanOrEqual(42_000);
      expect(stored?.elapsedMs).toBeLessThanOrEqual(180_000);
    });
  });

  it('persists a per-question strike draft across reload without recording progress', async () => {
    const sessions = new MemoryStudySessionPort();
    const progress = new MemoryProgressPort();
    const append = vi.spyOn(progress, 'append');
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' }),
      select: vi.fn(),
    };
    const props = {
      progressPort: progress, sessionPort: sessions,
      questionSource: { load: vi.fn().mockResolvedValue(editions['enem-2023']) } as QuestionSourcePort,
      activeExamPort, authPort, authRuntime,
    };

    const first = render(<App {...props} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    const card = (await screen.findByText('Matemática da edição 2023')).closest('article');
    if (!card) throw new Error('Question card was not rendered');
    await userEvent.click(within(card).getByRole('button', { name: 'Riscar alternativa A' }));
    expect(within(card).getByRole('button', { name: 'Desmarcar rascunho da alternativa A' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () => {
      const stored = (await sessions.load())['enem-2023-matematica'];
      expect(stored?.struckOptionIds).toEqual(['a']);
      expect(stored).toMatchObject({ selectedOptionId: null, outcome: null });
    });
    expect(append).not.toHaveBeenCalled();

    first.unmount();
    render(<App {...props} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    const reloaded = (await screen.findByText('Matemática da edição 2023')).closest('article');
    if (!reloaded) throw new Error('Question card was not rendered after reload');
    expect(within(reloaded).getByRole('button', { name: 'Desmarcar rascunho da alternativa A' })).toHaveAttribute('aria-pressed', 'true');
    const other = screen.getByText('Humanas da edição 2023').closest('article');
    if (!other) throw new Error('Second question card was not rendered');
    expect(within(other).getByRole('button', { name: 'Riscar alternativa A' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the feed and starts no timer until Começar agora is acionado', async () => {
    const sessions = new MemoryStudySessionPort();
    const progress = new MemoryProgressPort();
    const append = vi.spyOn(progress, 'append');
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' }),
      select: vi.fn(),
    };
    const questionSource: QuestionSourcePort = { load: vi.fn().mockResolvedValue(editions['enem-2023']) };

    render(<App progressPort={progress} sessionPort={sessions} questionSource={questionSource} activeExamPort={activeExamPort} authPort={authPort} authRuntime={authRuntime} />);

    const start = await screen.findByRole('button', { name: 'Começar agora' });
    expect(screen.queryByText('Matemática da edição 2023')).not.toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    await waitFor(async () => expect(await sessions.load()).toEqual({}));
    expect(append).not.toHaveBeenCalled();

    await userEvent.click(start);
    expect(await screen.findByText('Matemática da edição 2023')).toBeInTheDocument();
    expect(screen.getAllByRole('timer').length).toBeGreaterThan(0);
  });

  it('returns to the start screen after a reload', async () => {
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' }),
      select: vi.fn(),
    };
    const props = {
      progressPort: new MemoryProgressPort(), sessionPort: new MemoryStudySessionPort(),
      questionSource: { load: vi.fn().mockResolvedValue(editions['enem-2023']) } as QuestionSourcePort,
      activeExamPort, authPort, authRuntime,
    };

    const first = render(<App {...props} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    expect(await screen.findByText('Matemática da edição 2023')).toBeInTheDocument();

    first.unmount();
    render(<App {...props} />);
    expect(await screen.findByRole('button', { name: 'Começar agora' })).toBeInTheDocument();
    expect(screen.queryByText('Matemática da edição 2023')).not.toBeInTheDocument();
  });

  it('keeps the session started when a different downloaded exam is removed', async () => {
    const activeExamPort: ActiveExamPort = {
      initialize: vi.fn().mockResolvedValue({ status: 'active', packageId: 'enem-2022', editionId: 'enem-2022' }),
      select: vi.fn(),
    };

    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} questionSource={{ load: vi.fn().mockResolvedValue(editions['enem-2022']) }} packagePort={packages} activeExamPort={activeExamPort} authPort={authPort} authRuntime={authRuntime} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Começar agora' }));
    expect(await screen.findByText('Matemática da edição 2022')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Provas' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remover ENEM 2023 do dispositivo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar provas' }));

    expect(screen.getByText('Matemática da edição 2022')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Começar agora' })).not.toBeInTheDocument();
  });
});
