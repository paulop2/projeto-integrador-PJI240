import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ThemeSelector } from './ThemeSelector';

describe('ThemeSelector', () => {
  it('shows the current theme and reports changes', async () => {
    const onChange = vi.fn();
    render(<ThemeSelector value="dark" onChange={onChange} />);

    const select = screen.getByLabelText('Tema');
    expect(select).toHaveValue('dark');
    expect(screen.getByRole('option', { name: 'Claro' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Escuro' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sistema' })).toBeInTheDocument();

    await userEvent.selectOptions(select, 'system');
    expect(onChange).toHaveBeenCalledWith('system');
  });
});
