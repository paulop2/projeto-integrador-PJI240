# Inventário das questões Fuvest/USP no BLUEX

Levantamento da sub-issue [#36](https://github.com/paulop2/projeto-integrador-PJI240/issues/36), pertencente à epic [#2 — Importação e normalização de novas bancas](https://github.com/paulop2/projeto-integrador-PJI240/issues/2). Complementa [BLUEX e BLUEX-v2 como insumos para a pipeline Comvest/Fuvest](bluex-pipeline-sources.md) com números verificáveis do recorte `questions/USP` do snapshot BLUEX fixado localmente, no mesmo seam já usado pela [Comvest](comvest-unicamp-inventory.md).

## Resumo executivo

O recorte `questions/USP` do **BLUEX** contém **630 questões objetivas de 1ª fase da Fuvest, de 2018 a 2024, 90 por ano**. Todas as questões têm 5 alternativas, exceto uma com zero alternativas; o gabarito está presente em 629 e ausente em uma. Não há JSON inválido nem `id` duplicado. A extensão reutiliza o mesmo normalizador da Comvest, mudando apenas a banca, o identificador global, o prefixo de assets e a contagem esperada de alternativas.

O snapshot também tem particularidades que o importador trata explicitamente, sem inventar conteúdo: **33 questões com alternativas-imagem**, seis delas com marcadores `[IMAGE n]` apontando para imagens ausentes na fonte; uma questão com duas imagens numa única alternativa; uma questão com imagem associada nunca referenciada; e **28 arquivos de imagem órfãos** no disco. O resultado do import é **620 questões publicadas e 10 rejeitadas**, com 440 assets publicados e 52 ignorados.

## Escopo

- **Dentro:** questões objetivas de 1ª fase da Fuvest/USP no BLUEX, com proveniência, inventário e normalização para o contrato de runtime.
- **Fora:** 2ª fase e redação; segmentação por PDF e OCR (etapas seguintes da arquitetura); copiar o dataset bruto, ZIP ou Parquet para o repositório ou `public/data`; deploy.

## Proveniência

| Item | Valor |
| --- | --- |
| BLUEX (repositório) | `Portuguese-Benchmark-Datasets/BLUEX` |
| BLUEX commit fixado | `6cdd69bd8dc8d0144e6bb01501ccae312720a0e6` |
| BLUEX ZIP | `data/bluex_dataset.zip` — SHA-256 `5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2` |
| BLUEX extraído | `extracted/questions/USP` e `extracted/imgs/USP` |
| Layout por ano | 1 dia por ano (diferente da Comvest 2021, que tem `day1`/`day2`) |

O CLI confere o SHA-256 do ZIP antes de inventariar (`--expected-sha256`) e registra o commit na proveniência.

## Inventário do BLUEX — 1ª fase (múltipla escolha)

Artefato completo, somente metadados (sem enunciado nem texto das alternativas): `docs/research/data/fuvest-usp-bluex-inventory.json`.

### Totais

- **630 questões**, 0 JSON inválido, 0 referência de imagem ausente, 0 `id` duplicado.
- **Gabarito/resposta** presente em 629; `null` em 1 (`USP_2022_54`, `2022/54.json`).
- **Alternativas:** 629 questões com 5 alternativas; 1 com zero alternativas (`USP_2021_25`, `2021/25.json`).
- **Tipo de alternativa:** 597 questões com alternativas textuais (`string`) e 33 com alternativas-imagem (`images`).
- **Imagens:** 291 questões com imagem, 465 referências, 464 caminhos distintos, 28 arquivos órfãos no disco.

### Por ano

| Ano | Questões |
| --- | --- |
| 2018 | 90 |
| 2019 | 90 |
| 2020 | 90 |
| 2021 | 90 |
| 2022 | 90 |
| 2023 | 90 |
| 2024 | 90 |
| **Total** | **630** |

### Por matéria (questões podem ter mais de uma)

| Matéria | Questões |
| --- | --- |
| portuguese | 109 |
| history | 96 |
| geography | 94 |
| mathematics | 87 |
| chemistry | 85 |
| physics | 79 |
| biology | 75 |
| english | 50 |
| philosophy | 10 |

### Anomalias da fonte (explícitas, sem correção inventada)

| Código | Ocorrências | Detalhe |
| --- | --- | --- |
| `empty-answer` | 1 | `USP_2022_54` (`2022/54.json`) tem `"answer": null`. |
| `unexpected-alternative-count` | 1 | `USP_2021_25` (`2021/25.json`) tem zero alternativas. |
| `image-reference-missing` | 6 | `USP_2018_19`, `USP_2018_21`, `USP_2018_25`, `USP_2023_6`, `USP_2023_23`, `USP_2023_59`: alternativas-imagem referenciam `[IMAGE 1..5]`, mas a fonte lista apenas um arquivo em `associated_images`. |
| `alternative-image-count-unsupported` | 1 | `USP_2020_8` (`2020/8.json`) referencia duas imagens na mesma alternativa. |
| `unreferenced-associated-image` | 1 | `USP_2022_73` (`2022/73.json`) tem uma imagem associada que nenhum marcador referencia. |
| `orphan-image` | 28 | Arquivos em `imgs/USP/{2018,2022,2023}` não referenciados por nenhuma questão. |

Nenhuma alternativa, matéria, imagem ou resposta foi criada para completar esses casos. As decisões de publicação pertencem ao importador, que as registra explicitamente no relatório.

## Estado após a importação

O comando `npm run import:fuvest` publica 7 edições (`fuvest-2018` a `fuvest-2024`).

| Métrica | Valor |
| --- | --- |
| Questões na fonte | 630 |
| Questões publicadas | 620 |
| Questões rejeitadas | 10 (ver acima) |
| Assets publicados | 440 |
| Assets ignorados | 52 |

Por edição: 2018 87 · 2019 90 · 2020 89 · 2021 89 · 2022 88 · 2023 87 · 2024 90.

O identificador global segue literalmente `{examId}-{editionId}-{sourceQuestionId}`, por exemplo `fuvest-fuvest-2018-USP_2018_1`. Nenhum identificador colide entre as edições da Fuvest, com a Comvest ou com o ENEM.

## Licenciamento e publicação

- **BLUEX:** o mantenedor do projeto registrou em 10/09/2026 que o dataset pode ser usado sob a licença Apache geral (ver [bluex-pipeline-sources.md](bluex-pipeline-sources.md), seção “Decisão de uso no projeto”). A revisão/hash é fixada para reprodutibilidade.
- **Conteúdo da Fuvest:** os enunciados, alternativas, gabaritos e imagens são de titularidade da **Fuvest/USP**. Diferentemente da Comvest, **não foi localizada nesta entrega uma autorização pública equivalente** para reprodução; a atribuição é preservada em `public/data/fuvest/ATTRIBUTION.md` e a checagem de obras de terceiros embutidas em cada questão permanece pendente de revisão editorial/sign-off do mantenedor antes de qualquer uso público amplo.

Este levantamento não publica o dataset bruto; os artefatos são inventário de metadados em `docs/research` e os pacotes normalizados referenciados acima.

## Reprodução

```powershell
# Inventário da 1ª fase da Fuvest (confere o hash do ZIP e grava os metadados)
npm run inventory:fuvest -- --source "<BLUEX>\extracted" `
  --zip "<BLUEX>\data\bluex_dataset.zip" `
  --expected-sha256 5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2 `
  --commit 6cdd69bd8dc8d0144e6bb01501ccae312720a0e6 `
  --out docs/research/data/fuvest-usp-bluex-inventory.json --pretty

# Import e publicação dos pacotes
npm run import:fuvest -- --source "<BLUEX>\extracted" `
  --zip "<BLUEX>\data\bluex_dataset.zip" `
  --expected-sha256 5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2 `
  --commit 6cdd69bd8dc8d0144e6bb01501ccae312720a0e6 `
  --report docs/research/data/fuvest-usp-import-report.json
```

Verificações automatizadas: `npm run typecheck`, `npm test` e `npx vitest run tests/fuvest-inventory.test.ts tests/fuvest-normalizer.test.ts`.

## Limitações e próximos passos

- O inventário é de **metadados**: não inclui enunciado, texto das alternativas nem bytes de imagem. O conteúdo integral permanece no dataset externo.
- As 10 questões rejeitadas e os 52 assets ignorados estão detalhados em `docs/research/data/fuvest-usp-import-report.json`; nenhum foi completado por suposição.
- A 2ª fase da Fuvest e a extração por PDF/OCR continuam fora deste incremento.
