import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthPanel } from './AuthPanel';

const actions = { onLogin: vi.fn(), onLogout: vi.fn(), onClose: vi.fn() };
describe('AuthPanel', () => {
  it('starts the identity flow from the optional account panel', async () => {
    render(<AuthPanel user={null} busy={false} error={null} message={null} online {...actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar ou criar conta' }));
    expect(actions.onLogin).toHaveBeenCalledOnce();
    expect(screen.getByText(/conta é opcional/i)).toBeInTheDocument();
  });
  it('exposes offline and backend errors to assistive technology', () => {
    render(<AuthPanel user={null} busy={false} error="Acesso indisponível" message={null} online={false} {...actions} />);
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    expect(screen.getByRole('alert')).toHaveTextContent('Acesso indisponível');
    expect(screen.getByRole('button', { name: 'Entrar ou criar conta' })).toBeDisabled();
  });
  it('logs out an authenticated account without hiding its identity', async () => {
    render(<AuthPanel user={{ id: '1', name: 'Ana', email: 'ana@example.com' }} busy={false} error={null} message={null} online {...actions} />);
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(actions.onLogout).toHaveBeenCalledOnce();
  });
});
