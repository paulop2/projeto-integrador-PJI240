# Proveniência dos dados

Os pacotes `enem/enem-{ano}.json` cobrem todas as edições publicadas pela API
pública do projeto enem.dev e foram gerados pelo importador
`scripts/import-enem.ts`. O comando lê o catálogo de edições diretamente da API,
sem lista fixa de anos no código:

- catálogo de edições: `https://api.enem.dev/v1/exams`;
- listagem paginada: `https://api.enem.dev/v1/exams/{ano}/questions`;
- detalhe usado para reidratar registros incompletos:
  `https://api.enem.dev/v1/exams/{ano}/questions/{index}`;
- variantes oficiais de língua estrangeira:
  `https://api.enem.dev/v1/exams/{ano}/questions/{index}?language={ingles|espanhol}`.

Comando de reprodução (modo "todas"):

```sh
npm run import:enem -- --all --force --version 2 \
  --report docs/research/data/enem-import-report.json
```

O modo `--all` descobre as edições no catálogo da API, importa uma edição por
pacote e grava `public/data/manifest.json` ao final. Sem `--force`, uma edição já
publicada é ignorada; com `--force`, o pacote é regerado. Uma edição específica
continua disponível com `--year ANO`.

| Edição | Questões publicadas | Rejeitadas | Índices ausentes na fonte | Variante ausente     |
| ------ | ------------------- | ---------- | ------------------------- | -------------------- |
| 2009   | 179                 | 0          | 101                       | —                    |
| 2010   | 185                 | 0          | —                         | —                    |
| 2011   | 180                 | 0          | —                         | —                    |
| 2012   | 184                 | 0          | —                         | —                    |
| 2013   | 185                 | 0          | —                         | —                    |
| 2014   | 185                 | 0          | —                         | —                    |
| 2015   | 183                 | 0          | 145                       | —                    |
| 2016   | 184                 | 0          | —                         | —                    |
| 2017   | 185                 | 0          | —                         | —                    |
| 2018   | 184                 | 0          | 62                        | —                    |
| 2019   | 181                 | 0          | 98, 100, 128              | inglês da posição 5  |
| 2020   | 181                 | 0          | 144, 168, 179             | —                    |
| 2021   | 185                 | 0          | —                         | —                    |
| 2022   | 185                 | 0          | —                         | —                    |
| 2023   | 182                 | 1 (132)    | 34, 174                   | —                    |

Ao todo são 2748 questões publicadas, 1 rejeição, 11 lacunas e 1 variante de
idioma ausente, registradas por edição em
[`docs/research/data/enem-import-report.json`](../../docs/research/data/enem-import-report.json).

O manifesto registra o instante exato da geração, o SHA-256 e o tamanho em bytes
do corpo publicado. O teste `tests/data.test.ts` recalcula esses valores a partir
dos arquivos servidos e confere o relatório de importação contra o manifesto.

## Limitações conhecidas da fonte

- Em 2026-09-11, o catálogo da API disponibilizava as edições de 2009 a 2023. Uma
  edição futura passa a ser importada automaticamente por `--all` assim que
  aparecer em `/v1/exams`.
- Algumas edições repetem linhas idênticas na listagem paginada (por exemplo, as
  posições 91 a 95 em 2011 e a posição 95 em 2015). O importador descarta
  repetições idênticas e aborta apenas quando duas linhas divergem para o mesmo
  índice, para não escolher conteúdo arbitrariamente.
- A variante em inglês da posição 5 de 2019 retorna `404` na API. O importador
  registra a ausência e publica a variante em espanhol, em vez de falhar a edição
  inteira.
- A listagem sem filtro de idioma pode retornar apenas uma das variantes nas
  posições de língua estrangeira. O importador consulta o detalhe oficial com
  `language=ingles` e `language=espanhol` e publica cada variante disponível.
- A API omite posições em algumas edições (por exemplo, 101 em 2009, 62 em 2018 e
  34 e 174 em 2023). As lacunas são registradas no relatório e nada é inventado.
- A questão 132 de 2023 possui quatro alternativas sem texto ou arquivo inclusive
  no endpoint de detalhe. Ela é rejeitada (`incomplete-alternatives`) para
  preservar o contrato que exige conteúdo utilizável em cada alternativa.

## Compatibilidade de IDs e progresso

Os pacotes da versão 1 publicaram a variante em Espanhol das questões 1 a 5 com
IDs `enem-enem-{ano}-{posição}`. A versão 2 preserva esses IDs e associa a eles
explicitamente `language: "espanhol"`, portanto o progresso existente continua
ligado ao mesmo conteúdo. As variantes em Inglês usam
`enem-enem-{ano}-{posição}-ingles`, impedindo que respostas, sessões ou progresso
de uma língua sejam atribuídos à outra. Questões comuns preservam seus IDs e usam
`language: null`. Os identificadores incluem o ano, portanto não colidem entre
edições do ENEM nem com a Comvest/Unicamp ou a Fuvest/USP.

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

# Fuvest/USP (1ª fase)

Os pacotes `fuvest/fuvest-{ano}.json` foram gerados pelo importador
`scripts/import-fuvest.ts` a partir do mesmo snapshot fixado do dataset **BLUEX**
(`Portuguese-Benchmark-Datasets/BLUEX`), agora no recorte `questions/USP` e
`imgs/USP` da 1ª fase objetiva. O importador reutiliza a lógica comum de
`scripts/bluex-import.ts` e o normalizador parametrizado por banca
(`src/data/bluex-normalizer.ts`); a Fuvest difere apenas na identidade, no prefixo
de assets e na contagem esperada de cinco alternativas. O SHA-256 do ZIP é
conferido antes de normalizar e o dataset bruto nunca é copiado para `public/data`.

Comando de reprodução:

```sh
npm run import:fuvest -- --source "<BLUEX>/extracted" \
  --zip "<BLUEX>/data/bluex_dataset.zip" \
  --expected-sha256 5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2 \
  --commit 6cdd69bd8dc8d0144e6bb01501ccae312720a0e6 \
  --report docs/research/data/fuvest-usp-import-report.json
```

| Item | Valor |
| ---- | ----- |
| Dataset | BLUEX (`Portuguese-Benchmark-Datasets/BLUEX`) |
| Commit fixado | `6cdd69bd8dc8d0144e6bb01501ccae312720a0e6` |
| SHA-256 do ZIP | `5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2` |
| Edições publicadas | 7 (2018 a 2024) |
| Questões publicadas | 620 de 630 |
| Rejeições | 10 (ver abaixo) |
| Assets publicados | 440, referenciados por enunciados e alternativas |
| Assets ignorados | 52, explicitados no relatório de importação |

O identificador global segue literalmente `{examId}-{editionId}-{sourceQuestionId}`,
por exemplo `fuvest-fuvest-2018-USP_2018_1`. Nenhum identificador colide entre as
edições da Fuvest, com a Comvest ou com o ENEM.

## Decisões e dados incompletos (sem conteúdo inventado)

- **Gabarito ausente.** `USP_2022_54` tem `"answer": null` na fonte e foi rejeitada
  (`empty-answer`), nunca completada por suposição.
- **Sem alternativas.** `USP_2021_25` tem zero alternativas com gabarito `A` e foi
  rejeitada (`unknown-answer`), pois o contrato exige pelo menos duas alternativas e
  uma resposta correspondente.
- **Alternativas-imagem órfãs de marcador.** `USP_2018_19`, `USP_2018_21`,
  `USP_2018_25`, `USP_2023_6`, `USP_2023_23` e `USP_2023_59` referenciam
  `[IMAGE 1..5]`, mas a fonte lista só um arquivo em `associated_images`. Foram
  rejeitadas (`image-reference-missing`) para não exibir a figura errada.
- **Múltiplas imagens na mesma alternativa.** `USP_2020_8` referencia duas imagens
  em uma alternativa, o que o contrato `single-choice` não representa; a questão foi
  rejeitada (`alternative-image-count-unsupported`) e suas 10 imagens ignoradas.
- **Imagem associada sem marcador.** `USP_2022_73` tem uma imagem associada que
  nenhum `[IMAGE n]` referencia; a questão foi rejeitada
  (`unreferenced-associated-image`) em vez de representar o conteúdo incorretamente.
- **Disciplina única.** O contrato carrega um único `subjectId`; uma questão
  multidisciplinar mantém apenas a primeira matéria declarada pelo BLUEX
  (`subject[0]`). A lista completa permanece no inventário de metadados.
- **Assets ignorados.** 28 imagens órfãs no disco e as imagens de questões rejeitadas
  não são publicadas; a decisão está registrada em
  `docs/research/data/fuvest-usp-import-report.json`.
- **Marcadores de imagem.** Todo `[IMAGE n]` é resolvido para o asset local
  correspondente; nenhum marcador permanece no texto publicado, nenhuma imagem
  referenciada fica órfã e toda imagem associada precisa ser referenciada por um
  marcador ou a questão é rejeitada.

## Atribuição e licenciamento

O conteúdo das questões é de titularidade da **Fuvest / Vestibular USP**. A
atribuição e a proveniência são preservadas em `fuvest/ATTRIBUTION.md`. Diferentemente
da Comvest, não foi localizada nesta entrega uma autorização pública equivalente; a
checagem de obras de terceiros embutidas em cada questão e o sign-off editorial do
mantenedor permanecem pendentes antes de qualquer uso público amplo.
