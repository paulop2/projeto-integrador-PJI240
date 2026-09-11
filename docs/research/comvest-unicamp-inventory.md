# Inventário das questões Comvest/Unicamp no BLUEX

Levantamento feito em 11/09/2026 para a sub-issue [#31](https://github.com/paulop2/projeto-integrador-PJI240/issues/31), pertencente à epic [#2 — Importação e normalização de novas bancas](https://github.com/paulop2/projeto-integrador-PJI240/issues/2). Complementa a pesquisa [BLUEX e BLUEX-v2 como insumos para a pipeline Comvest/Fuvest](bluex-pipeline-sources.md) com números verificáveis do dataset fixado localmente.

## Resumo executivo

O **BLUEX** é a fonte de múltipla escolha da 1ª fase da Comvest/Unicamp: o recorte `questions/UNICAMP` tem **630 questões de 2018 a 2024**, todas com alternativas, sem JSON inválido e cobrindo nove matérias. O **BLUEXv2** cobre a **2ª fase discursiva** de 2022 a 2025 e está **fora do contrato de múltipla escolha** do produto; ele é registrado aqui apenas para proveniência e comparação, sem transportar questões para o aplicativo.

Dois problemas reais impedem um import direto e precisam de decisão antes da normalização: os **72 IDs de 2021 colidem** entre os dois dias e **duas questões têm gabarito `null`**. Esses casos estão isolados e são tratados explicitamente abaixo, sem inventar conteúdo. A comparação entre as fontes é estrutural: são fases distintas, sem questão importável em comum.

## Escopo

- **Dentro:** questões de múltipla escolha da 1ª fase da Comvest/Unicamp no BLUEX, com proveniência, inventário e comparação com o BLUEXv2.
- **Fora:** importar, normalizar ou gerar pacote para o produto; 2ª fase discursiva; copiar datasets, ZIP, Parquet ou conteúdo integral de questões para o repositório ou `public/data`; deploy.

## Proveniência

| Item | Valor |
| --- | --- |
| BLUEX (repositório) | `Portuguese-Benchmark-Datasets/BLUEX` |
| BLUEX commit fixado | `6cdd69bd8dc8d0144e6bb01501ccae312720a0e6` |
| BLUEX ZIP | `data/bluex_dataset.zip` — SHA-256 `5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2` |
| BLUEX extraído | `extracted/questions/UNICAMP` e `extracted/imgs/UNICAMP` |
| BLUEXv2 dataset commit | `9284b8cc1bf97abe9eb99bc915e6d390b560fe39` |
| BLUEXv2 Parquet | `data/train-00000-of-00001.parquet` (102.819.592 bytes) — SHA-256 `9F976DDEABEB1D223043F2529024C866A7E98B62547393230D47010C810320D6` |
| BLUEXv2 código commit | `df3125ed627968995865f4085c1b5d0a801f3796` |

O CLI confere o SHA-256 do ZIP antes de inventariar (`--expected-sha256`); o script do BLUEXv2 confere o SHA-256 do Parquet. Os hashes acima foram reconferidos no levantamento.

> O README do BLUEX cita 1.260 questões (2018–2024), enquanto a versão “BLUEX Revisited” publicada no Hugging Face cita 1.422 questões (2018–2025). O commit fixado aqui termina em 2024 e é o que foi inventariado; ingestões futuras devem fixar commit/hash, não o texto do README.

## Inventário do BLUEX — 1ª fase (múltipla escolha)

Artefato completo, somente metadados (sem enunciado nem texto das alternativas): `docs/research/data/comvest-unicamp-bluex-inventory.json`.

### Totais

- **630 questões**, 0 JSON inválido, 0 referência de imagem ausente.
- **Gabarito/resposta** presente em 628; `null` em 2 (ver anomalias).
- **Alternativas:** 629 questões com 4 alternativas; 1 com 3.
- **Imagens:** 245 questões com imagem, 349 referências, 348 caminhos distintos, 6 arquivos órfãos no disco.

### Por ano e dia

| Ano | Dia | Questões |
| --- | --- | --- |
| 2018 | — | 90 |
| 2019 | — | 90 |
| 2020 | — | 90 |
| 2021 | day1 | 72 |
| 2021 | day2 | 72 |
| 2022 | — | 72 |
| 2023 | — | 72 |
| 2024 | — | 72 |
| **Total** | | **630** |

### Por matéria (questões podem ter mais de uma)

| Matéria | Questões |
| --- | --- |
| mathematics | 118 |
| portuguese | 109 |
| history | 87 |
| physics | 78 |
| geography | 77 |
| biology | 74 |
| english | 68 |
| chemistry | 62 |
| philosophy | 8 |

### Anomalias (explícitas, sem correção inventada)

| Código | Ocorrências | Detalhe |
| --- | --- | --- |
| `duplicate-id` | 72 | Em 2021, `UNICAMP_2021_1`…`_72` repetem entre `day1` e `day2` porque o `id` não inclui o dia. |
| `empty-answer` | 2 | `UNICAMP_2019_60` (`2019/60.json`) e `UNICAMP_2021_48` (`2021/day2/48.json`) têm `"answer": null`. |
| `unexpected-alternative-count` | 1 | `UNICAMP_2019_53` (`2019/53.json`) tem 3 alternativas e gabarito `C`. |
| `orphan-image` | 6 | Arquivos de imagem em `imgs/UNICAMP/2021/day1/{33,35,38}` não referenciados por nenhuma questão. |

Nenhuma alternativa, matéria, imagem ou resposta foi criada para completar esses casos. A decisão de produto sobre a questão de 3 alternativas e sobre as 2 sem gabarito pertence ao importador (follow-up), que deve rejeitar ou representar os casos explicitamente.

### Qualidade de texto

Todos os arquivos `questions/UNICAMP` são UTF-8 válidos, com 0 caractere de substituição (`U+FFFD`). As expressões matemáticas aparecem como símbolos Unicode (por exemplo `⁴√2√3`), o que não constitui corrupção.

## BLUEXv2 — 2ª fase discursiva (fora de escopo)

Artefato: `docs/research/data/comvest-unicamp-bluexv2-summary.json`.

- 919 linhas no Parquet; **419 subquestões / 210 questões-pai** da Unicamp (2022–2025).
- Por ano: 2022 51/102 · 2023 51/101 · 2024 53/106 · 2025 55/110 (pais/subquestões).
- 225 subquestões com imagem (113 pais), 338 assets, 137 caminhos distintos.
- Todas as subquestões têm resposta esperada e critérios de correção; rótulos `a` (209) e `b` (210).

As linhas carregam `question_text`, `subquestion_text`, `expected_answer` e `marking_criteria` — formato discursivo, incompatível com o contrato de múltipla escolha. Não há alternativa objetiva a importar.

## Comparação BLUEX × BLUEXv2

| Dimensão | BLUEX | BLUEXv2 |
| --- | --- | --- |
| Fase | 1ª (objetiva) | 2ª (discursiva) |
| Anos | 2018–2024 | 2022–2025 |
| Formato | múltipla escolha | aberta, com rubrica |
| Escopo de produto | compatível | incompatível |
| IDs de questão em comum | 0 | 0 |

Os anos 2022–2024 aparecem nas duas fontes, mas em **fases distintas**. A interseção de IDs de questão é vazia; não existe questão importável em comum. O BLUEXv2 fica documentado como insumo de arquitetura (ligação questão–subquestão, imagens compartilhadas, respostas oficiais) e não como fonte do catálogo.

## Licenciamento e publicação

- **BLUEX:** o mantenedor do projeto registrou em 10/09/2026 que o dataset pode ser usado sob a licença Apache geral e retirou a licença do escopo da análise (ver [bluex-pipeline-sources.md](bluex-pipeline-sources.md), seção “Decisão de uso no projeto”). A revisão/hash deve ser fixada para reprodutibilidade.
- **BLUEXv2:** o README e o dataset card declaram **CC BY 4.0** para código e resultados; não há arquivo `LICENSE`. As questões de exame vêm de materiais públicos da Comvest e da Fuvest e exigem análise própria.
- **Conteúdo da Comvest:** a página oficial de provas comentadas autoriza reprodução **parcial**, nunca da prova inteira, com atribuição “Comvest / Vestibular Unicamp xxxx”. Antes de publicar questões no aplicativo, é necessário aplicar essa regra e verificar obras de terceiros embutidas em cada questão.

Este levantamento não publica nada em `public/data` nem no aplicativo; os artefatos são inventário de metadados em `docs/research`.

## Reprodução

```powershell
# Inventário da 1ª fase (confere o hash do ZIP e grava os metadados)
npm run inventory:comvest -- --source "<BLUEX>\extracted" `
  --zip "<BLUEX>\data\bluex_dataset.zip" `
  --expected-sha256 5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2 `
  --commit 6cdd69bd8dc8d0144e6bb01501ccae312720a0e6 `
  --out docs/research/data/comvest-unicamp-bluex-inventory.json --pretty

# Resumo da 2ª fase (fora de escopo; confere o hash do Parquet)
python scripts/inventory-bluexv2-unicamp.py `
  --parquet "<BLUEXv2-dataset>\data\train-00000-of-00001.parquet" `
  --expected-sha256 9F976DDEABEB1D223043F2529024C866A7E98B62547393230D47010C810320D6 `
  --commit 9284b8cc1bf97abe9eb99bc915e6d390b560fe39 `
  --bluex-inventory docs/research/data/comvest-unicamp-bluex-inventory.json `
  --out docs/research/data/comvest-unicamp-bluexv2-summary.json --pretty
```

Verificações automatizadas da lógica: `npm run typecheck` e `npx vitest run tests/comvest-inventory.test.ts`.

## Limitações e próximos passos

- O inventário é de **metadados**: não inclui enunciado, texto das alternativas nem bytes de imagem. O conteúdo integral permanece nos datasets externos.
- A decisão sobre a questão de 3 alternativas, as 2 sem gabarito e os 72 IDs colididos de 2021 é do importador (follow-up), não deste levantamento.
- Próximo passo: importar/normalizar as questões objetivas para o contrato `single-choice`, resolvendo os IDs de 2021 com o dia na chave e rejeitando os casos sem gabarito, conforme issue de follow-up vinculada à epic #2.
