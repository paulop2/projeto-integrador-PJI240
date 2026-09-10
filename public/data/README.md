# Proveniência dos dados

Os pacotes `enem/enem-2022.json` e `enem/enem-2023.json` foram gerados pelo
importador `scripts/import-enem.ts`, consumindo exclusivamente a API pública do
projeto enem.dev:

- catálogo de provas: `https://api.enem.dev/v1/exams`;
- listagem paginada: `https://api.enem.dev/v1/exams/{ano}/questions`;
- detalhe usado para reidratar registros incompletos:
  `https://api.enem.dev/v1/exams/{ano}/questions/{index}`;
- variantes oficiais de língua estrangeira:
  `https://api.enem.dev/v1/exams/{ano}/questions/{index}?language={ingles|espanhol}`.

Comandos de reprodução:

```sh
npm run import:enem -- --year 2022 --version 2 --force
npm run import:enem -- --year 2023 --version 2 --force
```

| Edição | Importada em | Questões publicadas | Questões rejeitadas |
| ------- | ------------ | -------------------- | -------------------- |
| 2022    | 2026-09-10   | 185                  | 0                    |
| 2023    | 2026-09-10   | 182                  | 1 (questão 132)     |

O manifesto registra o instante exato da geração, o SHA-256 e o tamanho em bytes
do corpo publicado. O teste `tests/data.test.ts` recalcula esses valores a partir
dos arquivos servidos.

## Limitações conhecidas da fonte

- Em 2026-08-23, o catálogo da API disponibilizava edições de 2009 a 2023; a
  tentativa de consultar 2024 retornou `404 not_found`. Por isso, 2023 é a edição
  real mais recente publicada neste MVP.
- Em 2026-09-10, a listagem sem filtro de idioma retornou Espanhol nas posições
  1 a 5. O importador consulta também o detalhe oficial com `language=ingles` e
  `language=espanhol`, publica as duas variantes nessas posições e mantém uma só
  cópia das demais questões comuns.
- As 180 questões retornadas para 2022 tinham conteúdo utilizável em todas as
  alternativas, inclusive após a reidratação pelo endpoint de detalhe; nenhuma
  precisou ser rejeitada.
- A API não possui as questões 34 e 174 da edição 2023: tanto a listagem quanto o
  endpoint de detalhe retornam ausência desses registros.
- A questão 132 possui quatro alternativas sem texto ou arquivo inclusive no
  endpoint de detalhe. Ela foi rejeitada pelo importador para não inventar dados e
  para preservar o contrato que exige conteúdo utilizável em cada alternativa.
- O pacote de 2023 contém, portanto, 177 das 180 posições da prova, mais as cinco
  variantes adicionais de Inglês das posições 1 a 5.

## Compatibilidade de IDs e progresso

Os pacotes da versão 1 publicaram a variante em Espanhol das questões 1 a 5 com
IDs `enem-enem-{ano}-{posição}`. A versão 2 preserva esses IDs e associa a eles
explicitamente `language: "espanhol"`, portanto o progresso existente continua
ligado ao mesmo conteúdo. As variantes em Inglês usam
`enem-enem-{ano}-{posição}-ingles`, impedindo que respostas, sessões ou progresso
de uma língua sejam atribuídos à outra. Questões comuns preservam seus IDs e usam
`language: null`.

Os enunciados, gabaritos e URLs de mídia não foram alterados editorialmente; o
importador apenas normaliza identificadores e valida a consistência estrutural.
