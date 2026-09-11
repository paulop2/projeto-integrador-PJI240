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

# Comvest/Unicamp (1ª fase)

Os pacotes `comvest/comvest-{ano}.json` e `comvest/comvest-2021-day{1,2}.json` foram
gerados pelo importador `scripts/import-comvest.ts` a partir do snapshot fixado do
dataset **BLUEX** (`Portuguese-Benchmark-Datasets/BLUEX`), recorte `questions/UNICAMP`
e `imgs/UNICAMP` da 1ª fase objetiva. O importador confere o SHA-256 do ZIP antes de
normalizar e nunca copia o dataset bruto, o ZIP ou o Parquet para `public/data`: só os
pacotes e as imagens efetivamente referenciadas são publicados.

Comando de reprodução:

```sh
npm run import:comvest -- --source "<BLUEX>/extracted" \
  --zip "<BLUEX>/data/bluex_dataset.zip" \
  --expected-sha256 5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2 \
  --commit 6cdd69bd8dc8d0144e6bb01501ccae312720a0e6 \
  --report docs/research/data/comvest-unicamp-import-report.json
```

| Item | Valor |
| ---- | ----- |
| Dataset | BLUEX (`Portuguese-Benchmark-Datasets/BLUEX`) |
| Commit fixado | `6cdd69bd8dc8d0144e6bb01501ccae312720a0e6` |
| SHA-256 do ZIP | `5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2` |
| Edições publicadas | 8 (2018, 2019, 2020, 2021 dia 1, 2021 dia 2, 2022, 2023, 2024) |
| Questões publicadas | 626 de 630 |
| Impressões/rejeições | 4 (ver abaixo) |
| Assets publicados | 333, referenciados por enunciados e alternativas |
| Assets ignorados | 21, explicitados no relatório de importação |

O identificador global segue literalmente `{examId}-{editionId}-{sourceQuestionId}`,
por exemplo `comvest-comvest-2021-day1-UNICAMP_2021_1`. A colisão de `id` de 2021 entre
`day1` e `day2` é resolvida incluindo o dia na edição (`comvest-2021-day1` e
`comvest-2021-day2`); nenhum identificador colide entre edições nem com o ENEM.

## Decisões e dados incompletos (sem conteúdo inventado)

- **Gabarito ausente.** `UNICAMP_2019_60` e `UNICAMP_2021_48` têm `"answer": null` na
  fonte e foram rejeitadas (`empty-answer`), nunca completadas por suposição.
- **Alternativas diferentes de quatro.** `UNICAMP_2019_53` tem três alternativas e
  gabarito `C`; ela é publicada pela regra do contrato (`≥ 2` alternativas e exatamente
  uma resposta), não por um padrão fixo de quatro ou cinco alternativas.
- **Alternativa com múltiplas imagens.** `UNICAMP_2021_41` tem três imagens por
  alternativa, o que o contrato `single-choice` atual não representa sem perder
  informação. A questão foi rejeitada (`alternative-image-count-unsupported`) e suas 13
  imagens foram ignoradas de forma explícita.
- **Imagem associada sem marcador.** `UNICAMP_2021_68` tem dois mapas no enunciado
  ("Cana-de-açúcar" e "Manga"), ambos anotados como `[IMAGE 0]`, e dois arquivos em
  `associated_images`; o segundo nunca é referenciado. Como publicar mostraria a figura
  errada para um dos mapas, a questão foi rejeitada
  (`unreferenced-associated-image`) em vez de representar o conteúdo incorretamente.
- **Disciplina única.** O contrato carrega um único `subjectId`; uma questão
  multidisciplinar mantém apenas a primeira matéria declarada pelo BLUEX
  (`subject[0]`), preservando a disciplina primária do anotador. A lista completa
  permanece no inventário de metadados.
- **Assets ignorados.** Seis arquivos de imagem órfãos de `2021/day1` (diretórios
  `33`, `35` e `38`) não são referenciados por nenhuma questão; as 13 imagens de
  `UNICAMP_2021_41` e as 2 de `UNICAMP_2021_68` pertencem a questões rejeitadas e
  também não são publicadas. A decisão está registrada em
  `docs/research/data/comvest-unicamp-import-report.json`.
- **Marcadores de imagem.** Todo `[IMAGE n]` é resolvido para o asset local
  correspondente; nenhum marcador permanece no texto publicado, nenhuma imagem
  referenciada fica órfã e toda imagem associada precisa ser referenciada por um
  marcador ou a questão é rejeitada.

## Atribuição e licenciamento

O conteúdo das questões é de titularidade da **Comvest / Vestibular Unicamp**. A
publicação segue a regra documentada em
[`docs/research/comvest-unicamp-inventory.md`](../../docs/research/comvest-unicamp-inventory.md):
reprodução parcial com atribuição. Os pacotes publicados reproduzem, por edição,
quase a totalidade da 1ª fase objetiva (por exemplo, 90/90 em 2018 e 72/72 em 2022);
a manutenção da atribuição e a checagem de obras de terceiros embutidas em cada
questão permanecem pendentes de revisão editorial/sign-off do mantenedor antes de
qualquer uso público amplo. A proveniência do dataset BLUEX é registrada por commit e
SHA-256 e o relatório de importação acompanha as contagens e rejeições.
