import type { ForeignLanguage } from '../contracts';

const LANGUAGE_LABELS: Readonly<Record<ForeignLanguage, string>> = {
  ingles: 'Inglês',
  espanhol: 'Espanhol',
};

interface ForeignLanguageSelectorProps {
  available: readonly ForeignLanguage[];
  value: ForeignLanguage | null;
  onChange: (language: ForeignLanguage) => void;
  compact?: boolean;
}

export function ForeignLanguageSelector({ available, value, onChange, compact = false }: ForeignLanguageSelectorProps) {
  return (
    <fieldset className={`language-selector${compact ? ' language-selector--compact' : ''}`}>
      <legend>Idioma estrangeiro</legend>
      {!compact && <p>Escolha um idioma para ver as questões correspondentes desta prova.</p>}
      <div className="language-options">
        {available.map((language) => (
          <label key={language}>
            <input
              type="radio"
              name={compact ? 'filter-foreign-language' : 'required-foreign-language'}
              value={language}
              checked={value === language}
              onChange={() => onChange(language)}
            />
            <span>{LANGUAGE_LABELS[language]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
