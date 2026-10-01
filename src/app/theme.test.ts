import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME, THEME_STORAGE_KEY, LocalThemePreferencePort, applyTheme, effectiveTheme, initialTheme, isThemePreference, readStoredTheme } from './theme';

describe('theme helpers', () => {
  it('accepts only known preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it('resolves the effective theme for system', () => {
    expect(effectiveTheme('light')).toBe('light');
    expect(effectiveTheme('dark')).toBe('dark');
    expect(effectiveTheme('system', () => ({ matches: true }))).toBe('light');
    expect(effectiveTheme('system', () => ({ matches: false }))).toBe('dark');
    expect(effectiveTheme('system')).toBe(DEFAULT_THEME);
  });

  it('applies the preference to the document root and theme-color meta', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#0d1018');
    document.head.append(meta);

    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.getAttribute('content')).toBe('#f5f2ea');

    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.getAttribute('content')).toBe('#0d1018');

    meta.remove();
    delete document.documentElement.dataset.theme;
  });

  it('reads and writes the stored preference', async () => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    const port = new LocalThemePreferencePort();
    expect(await port.load()).toBeNull();

    await port.save('system');
    expect(readStoredTheme()).toBe('system');
    expect(await port.load()).toBe('system');

    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it('reads the applied theme before local storage', () => {
    document.documentElement.dataset.theme = 'light';
    expect(initialTheme()).toBe('light');
    delete document.documentElement.dataset.theme;
  });
});
