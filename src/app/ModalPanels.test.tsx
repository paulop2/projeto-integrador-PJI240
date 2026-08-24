import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthPanel } from './AuthPanel';
import { emptyMetrics } from './progress';
import { StatsPanel } from './StatsPanel';

const actions = { onEmailLogin: vi.fn(), onSignUp: vi.fn(), onGoogle: vi.fn(), onLogout: vi.fn(), onForgot: vi.fn(), onReset: vi.fn(), onVerify: vi.fn() };

describe('modal panels', () => {
  it('focuses the dialog, traps tab and closes with Escape', async () => {
    const close = vi.fn();
    render(<AuthPanel user={null} busy={false} error={null} message={null} online onClose={close} {...actions} />);
    const dialog = screen.getByRole('dialog', { name: 'Entrar' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Fechar conta' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Reenviar verificação' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });

  it('restores focus to the trigger after statistics close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Abrir métricas</button>{open && <StatsPanel stats={{ total: emptyMetrics(), bySubject: [], byExam: [] }} onClose={() => setOpen(false)} />}</>;
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir métricas' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Estatísticas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar estatísticas' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
