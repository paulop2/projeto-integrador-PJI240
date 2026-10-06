import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import type { AuthPort } from './auth';
import { MemoryProgressPort, MemoryStudySessionPort, MemoryThemePreferencePort } from './ports';

const authPort: AuthPort = {
  getSession: vi.fn().mockResolvedValue(null), signIn: vi.fn(), signOut: vi.fn(),
};
const authRuntime = { coordinator: undefined, sync: vi.fn().mockResolvedValue(true), clear: vi.fn() };

afterEach(() => { delete document.documentElement.dataset.theme; });

describe('theme preference', () => {
  it('restores the saved preference and applies it to the document', async () => {
    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} themePreferencePort={new MemoryThemePreferencePort('light')} authPort={authPort} authRuntime={authRuntime} />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(screen.getByLabelText('Tema')).toHaveValue('light');
  });

  it('persists a new preference when the selector changes', async () => {
    const themePreferencePort = new MemoryThemePreferencePort('dark');
    const save = vi.spyOn(themePreferencePort, 'save');
    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} themePreferencePort={themePreferencePort} authPort={authPort} authRuntime={authRuntime} />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await userEvent.selectOptions(screen.getByLabelText('Tema'), 'system');

    expect(save).toHaveBeenCalledWith('system');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('system'));
  });

  it('defaults to dark when nothing is stored', async () => {
    render(<App progressPort={new MemoryProgressPort()} sessionPort={new MemoryStudySessionPort()} themePreferencePort={new MemoryThemePreferencePort(null)} authPort={authPort} authRuntime={authRuntime} />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(screen.getByLabelText('Tema')).toHaveValue('dark');
  });
});
