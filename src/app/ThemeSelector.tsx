import { isThemePreference, type ThemePreference } from './theme';

const THEME_ORDER: readonly ThemePreference[] = ['light', 'dark', 'system'];

const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  light: 'Claro',
  dark: 'Escuro',
  system: 'Sistema',
};

interface ThemeSelectorProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}

export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  return (
    <span className="theme-select">
      <select
        aria-label="Tema"
        value={value}
        onChange={(event) => { if (isThemePreference(event.target.value)) onChange(event.target.value); }}
      >
        {THEME_ORDER.map((theme) => <option key={theme} value={theme}>{THEME_LABELS[theme]}</option>)}
      </select>
    </span>
  );
}
