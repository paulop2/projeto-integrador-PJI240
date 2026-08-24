import type { Question } from '../contracts';

const choices = (values: string[]) =>
  values.map((text, index) => ({
    id: String.fromCharCode(97 + index),
    label: String.fromCharCode(65 + index),
    text,
    file: null,
  }));

export const demoQuestions: Question[] = [
  {
    id: 'enem-demo-2024-1', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', year: 2024,
    subjectId: 'matematica', kind: 'single-choice', files: [],
    context: 'Uma ciclovia tem 12 km. Uma pessoa percorreu 3/4 desse trajeto. Quantos quilômetros ela percorreu?',
    alternativesIntroduction: 'Assinale a alternativa correta.', alternatives: choices(['6 km', '8 km', '9 km', '10 km', '16 km']), answer: { optionIds: ['c'] },
  },
  {
    id: 'enem-demo-2024-2', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', year: 2024,
    subjectId: 'linguagens', kind: 'single-choice', files: [],
    context: '“A leitura do mundo precede a leitura da palavra.” Nessa afirmação, destaca-se a relação entre texto e',
    alternativesIntroduction: null, alternatives: choices(['memorização', 'experiência social', 'norma gramatical', 'sonoridade', 'tradução']), answer: { optionIds: ['b'] },
  },
  {
    id: 'enem-demo-2024-3', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', year: 2024,
    subjectId: 'ciencias-humanas', kind: 'single-choice', files: [],
    context: 'A ampliação das redes de transporte no século XIX contribuiu diretamente para',
    alternativesIntroduction: null, alternatives: choices(['reduzir o comércio', 'isolar centros urbanos', 'integrar mercados', 'eliminar migrações']), answer: { optionIds: ['c'] },
  },
  {
    id: 'enem-demo-2024-4', institutionId: 'inep', examId: 'enem', editionId: 'enem-2024', year: 2024,
    subjectId: 'ciencias-natureza', kind: 'single-choice', files: [],
    context: 'Em uma cadeia alimentar, os organismos que produzem matéria orgânica a partir de matéria inorgânica são',
    alternativesIntroduction: null, alternatives: choices(['decompositores', 'consumidores primários', 'produtores', 'predadores', 'parasitas']), answer: { optionIds: ['c'] },
  },
];
