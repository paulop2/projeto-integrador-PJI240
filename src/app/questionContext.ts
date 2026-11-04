/**
 * Matches a Markdown image reference. Titles may contain parentheses, as in
 * ENEM 2010/168 (`![alt](url "imagem (Foto: Reprodução/Enem)")`), so the URL
 * part accepts one level of balanced parentheses before the closing one.
 */
const markdownImage = /!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g;

/**
 * enem.dev ships support images twice: as `![](url)` inside `context` and as
 * the `files` list the card already renders. The card shows `context` as plain
 * text, so the raw markup would appear to the student. Removing it leaves the
 * real text; when only images remain, returns `null` so the paragraph is
 * skipped.
 */
export const questionContextText = (context: string | null): string | null => {
  if (context === null) return null;
  const text = context.replace(markdownImage, '').trim();
  return text === '' ? null : text;
};
