import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';
import type { AuthPort } from './auth';
import { MemoryProgressPort, MemoryStudySessionPort } from './ports';

describe('authenticated offline lifecycle', () => {
  it('starts sync after login and clears only account progress on logout', async () => {
    const user = { id: 'u1', name: 'Ana', email: 'ana@example.com' };
    const authPort: AuthPort = {
      getSession: vi.fn().mockResolvedValue(null), signInEmail: vi.fn().mockResolvedValue(user), signUpEmail: vi.fn(),
      signInGoogle: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined), requestPasswordReset: vi.fn(),
      resetPassword: vi.fn(), sendVerification: vi.fn(),
    };
    const coordinator = { start: vi.fn(), stop: vi.fn() };
    const runtime = { coordinator, sync: vi.fn().mockResolvedValue(true), clear: vi.fn().mockResolvedValue(undefined) };
    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} authPort={authPort} authRuntime={runtime} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/plataforma offline/i);
    await userEvent.click(screen.getByRole('button', { name: /Entrar ou criar conta/i }));
    await userEvent.type(screen.getByLabelText('E-mail'), user.email);
    await userEvent.type(screen.getByLabelText('Senha'), 'segura123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(coordinator.start).toHaveBeenCalled());
    expect(runtime.sync).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(runtime.clear).toHaveBeenCalledOnce());
    expect(authPort.signOut).toHaveBeenCalledOnce();
    expect(coordinator.stop).toHaveBeenCalled();
    expect(screen.getByText(/provas baixadas continuam disponíveis/i)).toBeInTheDocument();
  });

  it('probes the session once on reconnect and starts sync when the cookie is authenticated', async () => {
    const user = { id: 'u2', name: 'Bia', email: 'bia@example.com' };
    let resolveReconnect!: (value: typeof user) => void;
    const reconnect = new Promise<typeof user>((resolve) => { resolveReconnect = resolve; });
    const getSession = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => reconnect);
    const authPort: AuthPort = {
      getSession, signInEmail: vi.fn(), signUpEmail: vi.fn(), signInGoogle: vi.fn(), signOut: vi.fn(),
      requestPasswordReset: vi.fn(), resetPassword: vi.fn(), sendVerification: vi.fn(),
    };
    const coordinator = { start: vi.fn(), stop: vi.fn() };
    const runtime = { coordinator, sync: vi.fn().mockResolvedValue(true), clear: vi.fn() };
    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} authPort={authPort} authRuntime={runtime} />);
    await waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: /Entrar ou criar conta/i })).toBeEnabled());

    act(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online')); });
    expect(getSession).toHaveBeenCalledTimes(2);
    await act(async () => resolveReconnect(user));
    await waitFor(() => expect(coordinator.start).toHaveBeenCalledOnce());
    expect(runtime.sync).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Conta de Bia/i })).toBeInTheDocument();
  });
});
