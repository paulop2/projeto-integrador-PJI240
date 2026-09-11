# Catálogo de provas disponíveis

Rastreamento de quais bancas e edições já estão publicadas no projeto. A fonte de
verdade dos dados é [`public/data/manifest.json`](../../public/data/manifest.json);
os pacotes ficam em `public/data/<banca>/<edição>.json`. Ao adicionar, remover ou
atualizar uma edição, ajuste o manifesto e esta tabela na mesma mudança.

Última geração do manifesto: `2026-09-11T04:41:04.535Z`.

## Resumo por banca

| Banca | Prova (`examId`) | Instituição | Edições | Anos | Questões |
| --- | --- | --- | --- | --- | --- |
| ENEM | `enem` | INEP | 2 | 2022–2023 | 367 |
| Comvest / Unicamp (1ª fase) | `comvest` | Unicamp (Comvest) | 8 | 2018–2024 | 626 |
| Fuvest / USP (1ª fase) | `fuvest` | USP (Fuvest) | 7 | 2018–2024 | 620 |
| **Total** | | | **17** | **2018–2024** | **1 613** |

## Edições publicadas

| Edição (`editionId`) | Banca | Ano | Questões | Versão | Arquivo |
| --- | --- | --- | --- | --- | --- |
| `enem-2022` | ENEM | 2022 | 185 | 2 | `/data/enem/enem-2022.json` |
| `enem-2023` | ENEM | 2023 | 182 | 2 | `/data/enem/enem-2023.json` |
| `comvest-2018` | Comvest | 2018 | 90 | 1 | `/data/comvest/comvest-2018.json` |
| `comvest-2019` | Comvest | 2019 | 89 | 1 | `/data/comvest/comvest-2019.json` |
| `comvest-2020` | Comvest | 2020 | 90 | 1 | `/data/comvest/comvest-2020.json` |
| `comvest-2021-day1` | Comvest | 2021 (dia 1) | 71 | 1 | `/data/comvest/comvest-2021-day1.json` |
| `comvest-2021-day2` | Comvest | 2021 (dia 2) | 70 | 1 | `/data/comvest/comvest-2021-day2.json` |
| `comvest-2022` | Comvest | 2022 | 72 | 1 | `/data/comvest/comvest-2022.json` |
| `comvest-2023` | Comvest | 2023 | 72 | 1 | `/data/comvest/comvest-2023.json` |
| `comvest-2024` | Comvest | 2024 | 72 | 1 | `/data/comvest/comvest-2024.json` |
| `fuvest-2018` | Fuvest | 2018 | 87 | 1 | `/data/fuvest/fuvest-2018.json` |
| `fuvest-2019` | Fuvest | 2019 | 90 | 1 | `/data/fuvest/fuvest-2019.json` |
| `fuvest-2020` | Fuvest | 2020 | 89 | 1 | `/data/fuvest/fuvest-2020.json` |
| `fuvest-2021` | Fuvest | 2021 | 89 | 1 | `/data/fuvest/fuvest-2021.json` |
| `fuvest-2022` | Fuvest | 2022 | 88 | 1 | `/data/fuvest/fuvest-2022.json` |
| `fuvest-2023` | Fuvest | 2023 | 87 | 1 | `/data/fuvest/fuvest-2023.json` |
| `fuvest-2024` | Fuvest | 2024 | 90 | 1 | `/data/fuvest/fuvest-2024.json` |

Observações:

- O ENEM 2023 tem 182 questões no pacote: 177 posições reais da prova mais as
  variantes adicionais de Inglês das posições 1 a 5. A edição 2022 tem 185.
- A versão 2 dos pacotes do ENEM preserva os IDs de progresso já existentes.
- Comvest e Fuvest usam a 1ª fase objetiva do dataset BLUEX; detalhes de
  rejeições e proveniência estão em [`public/data/README.md`](../../public/data/README.md).

## Bancas em pesquisa (ainda não publicadas)

| Banca | Situação | Levantamento |
| --- | --- | --- |
| FGV | Fontes oficiais mapeadas; sem importador. | [`docs/research/fgv-sources.md`](../research/fgv-sources.md) |
| ITA | Só PDFs oficiais; sem dataset estruturado nem API. | [`docs/research/ita-sources.md`](../research/ita-sources.md) |
| IME | Só PDFs oficiais; verificação manual item a item pendente. | [`docs/research/ime-sources.md`](../research/ime-sources.md) |
| UECE | Só PDFs oficiais por edição. | [`docs/research/uece-sources.md`](../research/uece-sources.md) |

## Como verificar

O teste `tests/data.test.ts` recalcula os SHA-256 e tamanhos a partir dos
arquivos servidos e confronta com o manifesto:

```sh
npm run test:data
```
