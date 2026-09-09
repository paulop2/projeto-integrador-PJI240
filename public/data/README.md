# Proveniência dos dados

Os pacotes `enem/enem-2022.json` e `enem/enem-2023.json` foram gerados pelo
importador `scripts/import-enem.ts`, consumindo exclusivamente a API pública do
projeto enem.dev:

- catálogo de provas: `https://api.enem.dev/v1/exams`;
- listagem paginada: `https://api.enem.dev/v1/exams/{ano}/questions`;
- detalhe usado para reidratar registros incompletos:
  `https://api.enem.dev/v1/exams/{ano}/questions/{index}`.

Comandos de reprodução:

```sh
npm run import:enem -- --year 2022 --version 1 --force
npm run import:enem -- --year 2023 --version 1 --force
```

| Edição | Importada em | Questões publicadas | Questões rejeitadas |
| ------- | ------------ | -------------------- | -------------------- |
| 2022    | 2026-09-09   | 180                  | 0                    |
| 2023    | 2026-08-23   | 177                  | 1 (questão 132)     |

O manifesto registra o instante exato da geração, o SHA-256 e o tamanho em bytes
do corpo publicado. O teste `tests/data.test.ts` recalcula esses valores a partir
dos arquivos servidos.

## Limitações conhecidas da fonte

- Em 2026-08-23, o catálogo da API disponibilizava edições de 2009 a 2023; a
  tentativa de consultar 2024 retornou `404 not_found`. Por isso, 2023 é a edição
  real mais recente publicada neste MVP.
- Em 2026-09-09, a listagem de 2022 informou `total: 185`, mas a resposta
  paginada sem filtro de idioma retornou 180 índices distintos, de 1 a 180. As
  questões 1 a 5 vieram na variante em espanhol. O importador preserva a variante
  retornada pela fonte e não cria nem combina alternativas de idioma.
- As 180 questões retornadas para 2022 tinham conteúdo utilizável em todas as
  alternativas, inclusive após a reidratação pelo endpoint de detalhe; nenhuma
  precisou ser rejeitada.
- A API não possui as questões 34 e 174 da edição 2023: tanto a listagem quanto o
  endpoint de detalhe retornam ausência desses registros.
- A questão 132 possui quatro alternativas sem texto ou arquivo inclusive no
  endpoint de detalhe. Ela foi rejeitada pelo importador para não inventar dados e
  para preservar o contrato que exige conteúdo utilizável em cada alternativa.
- O pacote contém, portanto, 177 das 180 posições da prova. As questões 1 a 5 são
  a variante em espanhol retornada pela listagem sem filtro de idioma.

Os enunciados, gabaritos e URLs de mídia não foram alterados editorialmente; o
importador apenas normaliza identificadores e valida a consistência estrutural.
