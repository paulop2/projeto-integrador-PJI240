# Proveniência dos dados

O pacote `enem/enem-2023.json` foi gerado em 2026-08-23 pelo importador
`scripts/import-enem.ts`, consumindo exclusivamente a API pública oficial do
projeto enem.dev:

- catálogo de provas: `https://api.enem.dev/v1/exams`;
- listagem paginada: `https://api.enem.dev/v1/exams/2023/questions`;
- detalhe usado para reidratar registros incompletos:
  `https://api.enem.dev/v1/exams/2023/questions/{index}`.

Comando de reprodução:

```sh
npm run import:enem -- --year 2023 --version 1 --force
```

O manifesto registra o instante exato da geração, o SHA-256 e o tamanho em bytes
do corpo publicado. O teste `tests/data.test.ts` recalcula esses valores a partir
dos arquivos servidos.

## Limitações conhecidas da fonte

- Em 2026-08-23, o catálogo da API disponibilizava edições de 2009 a 2023; a
  tentativa de consultar 2024 retornou `404 not_found`. Por isso, 2023 é a edição
  real mais recente publicada neste MVP.
- A API não possui as questões 34 e 174 da edição 2023: tanto a listagem quanto o
  endpoint de detalhe retornam ausência desses registros.
- A questão 132 possui quatro alternativas sem texto ou arquivo inclusive no
  endpoint de detalhe. Ela foi rejeitada pelo importador para não inventar dados e
  para preservar o contrato que exige conteúdo utilizável em cada alternativa.
- O pacote contém, portanto, 177 das 180 posições da prova. As questões 1 a 5 são
  a variante em espanhol retornada pela listagem sem filtro de idioma.

Os enunciados, gabaritos e URLs de mídia não foram alterados editorialmente; o
importador apenas normaliza identificadores e valida a consistência estrutural.
