import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthPanel } from './AuthPanel';

const actions = { onEmailLogin: vi.fn(), onSignUp: vi.fn(), onGoogle: vi.fn(), onLogout: vi.fn(), onForgot: vi.fn(), onReset: vi.fn(), onVerify: vi.fn(), onClose: vi.fn() };

describe('AuthPanel', () => {
  it('submits email and password login and offers Google', async () => {
    render(<AuthPanel user={null} busy={false} error={null} message={null} online {...actions} />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'aluna@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'segura123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(actions.onEmailLogin).toHaveBeenCalledWith('aluna@example.com', 'segura123');
    expect(screen.getByRole('button', { name: /Continuar com Google/ })).toBeEnabled();
  });

  it('exposes offline and backend errors to assistive technology', () => {
    render(<AuthPanel user={null} busy={false} error="Credenciais inválidas" message={null} online={false} {...actions} />);
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    expect(screen.getByRole('alert')).toHaveTextContent('Credenciais inválidas');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  it('logs out an authenticated account without hiding its identity', async () => {
    render(<AuthPanel user={{ id: '1', name: 'Ana', email: 'ana@example.com' }} busy={false} error={null} message={null} online {...actions} />);
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(actions.onLogout).toHaveBeenCalledOnce();
  });
});
