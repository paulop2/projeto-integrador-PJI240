import type { ThemePreferencePort } from './ports';

export type ThemePreference = 'light' | 'dark' | 'system';

export const DEFAULT_THEME = 'dark' as const;
export const THEME_STORAGE_KEY = 'maratona.theme';

const THEME_COLORS: Readonly<Record<'light' | 'dark', string>> = {
  light: '#f5f2ea',
  dark: '#0d1018',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readStoredTheme(storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): ThemePreference | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function effectiveTheme(
  preference: ThemePreference,
  matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>,
): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  if (!matchMedia) return DEFAULT_THEME;
  try {
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return DEFAULT_THEME;
  }
}

export function initialTheme(win: Window = window): ThemePreference {
  const applied = win.document.documentElement.dataset.theme;
  if (isThemePreference(applied)) return applied;
  try {
    return readStoredTheme(win.localStorage) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(preference: ThemePreference, win: Window = window): void {
  const root = win.document.documentElement;
  root.dataset.theme = preference;
  const effective = effectiveTheme(preference, (query) => win.matchMedia(query));
  const meta = win.document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[effective]);
}

export function watchSystemTheme(win: Window, onChange: () => void): () => void {
  try {
    const media = win.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  } catch {
    return () => undefined;
  }
}

export class LocalThemePreferencePort implements ThemePreferencePort {
  constructor(private readonly storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {}
  async load() { return readStoredTheme(this.storage); }
  async save(theme: ThemePreference) {
    try { this.storage?.setItem(THEME_STORAGE_KEY, theme); } catch { return; }
  }
}
