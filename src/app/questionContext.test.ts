import { describe, expect, it } from 'vitest';

import { questionContextText } from './questionContext';

describe('questionContextText', () => {
  it('keeps a context without images untouched', () => {
    expect(questionContextText('Analise a figura e responda.')).toBe('Analise a figura e responda.');
  });

  it('returns null for an absent context', () => {
    expect(questionContextText(null)).toBeNull();
  });

  it('removes an image reference that follows the text', () => {
    expect(questionContextText('Analise a figura.\n\n![](https://enem.dev/2009/questions/2/image.png)')).toBe('Analise a figura.');
  });

  it('removes an image reference that precedes the text', () => {
    expect(questionContextText('![](https://enem.dev/2009/questions/12/image.jpg)\n\nEm solução, os ânions do sabão.')).toBe('Em solução, os ânions do sabão.');
  });

  it('returns null when the context is only an image', () => {
    expect(questionContextText('![](https://enem.dev/2009/questions/14/image.png)')).toBeNull();
    expect(questionContextText('\n\n![](https://enem.dev/2009/questions/14/image.png)\n\n')).toBeNull();
  });

  it('removes an image whose title contains parentheses', () => {
    const context = 'Considere:\n\n![imagem (Foto: Reprodução/Enem)](https://enem.dev/2010/questions/168/image.png "imagem (Foto: Reprodução/Enem)")';
    expect(questionContextText(context)).toBe('Considere:');
  });

  it('removes multiple image references', () => {
    const context = '![](https://enem.dev/a.png)\n\nTexto\n\n![](https://enem.dev/b.png)';
    expect(questionContextText(context)).toBe('Texto');
  });

  it('removes the enem.dev broken-image placeholder', () => {
    expect(questionContextText('![](https://enem.dev/broken-image.svg)')).toBeNull();
    expect(questionContextText('![](https://enem.dev/broken-image.svg)\n\nDisponível em: www.laerte.art.br.')).toBe('Disponível em: www.laerte.art.br.');
  });
});
