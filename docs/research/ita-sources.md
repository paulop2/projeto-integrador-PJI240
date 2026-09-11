# Fontes públicas das provas do ITA

Levantamento da sub-issue [#42](https://github.com/paulop2/projeto-integrador-PJI240/issues/42), pertencente à epic [#2 — Importação e normalização de novas bancas](https://github.com/paulop2/projeto-integrador-PJI240/issues/2).

Diferentemente da Comvest e da Fuvest, o ITA **não possui dataset estruturado equivalente ao BLUEX nem API no formato [enem.dev](https://enem.dev)**. A única fonte pública é o site oficial, que publica provas e gabaritos em PDF. Este documento mapeia essas fontes; ele não baixa, não extrai e não publica o conteúdo das questões.

## Fonte oficial

| Item | Valor |
| ---- | ----- |
| Página | `https://www.vestibular.ita.br/provas.htm` |
| Natureza | HTML estático com links diretos para PDFs |
| Verificação | Página aberta e lida em 2026-09-11 |
| Conteúdo | Provas de 1ª e 2ª fase de 2008 a 2026 |

## Abrangência da 1ª fase

Duas gerações de nomenclatura aparecem na página:

- **2019–2026:** um único caderno `provas/{ano}_fase1.pdf` e um `provas/gabarito_{ano}.pdf`.
- **2008–2018:** a prova aparece fragmentada por matéria (`provas/fisica_{ano}.pdf`, `portugues`, `ingles`, `matematica`, `quimica`) mais um `provas/gabarito_{ano}.pdf`.

| Edição | Prova | Gabarito |
| ------ | ----- | -------- |
| 2026 | `provas/2026_fase1.pdf` | `provas/gabarito_2026.pdf` |
| 2025 | `provas/2025_fase1.pdf` | `provas/gabarito_2025.pdf` |
| 2024 | `provas/2024_fase1.pdf` | `provas/gabarito_2024.pdf` |
| 2023 | `provas/2023_fase1.pdf` | `provas/gabarito_2023.pdf` |
| 2022 | `provas/2022_fase1.pdf` | `provas/gabarito_2022.pdf` |
| 2021 | `provas/2021_fase1.pdf` | `provas/gabarito_2021.pdf` |
| 2020 | `provas/2020_fase1.pdf` | `provas/gabarito_2020.pdf` |
| 2019 | `provas/2019_fase1.pdf` | `provas/gabarito_2019.pdf` |
| 2018 | por matéria (`fisica_2018.pdf`, …) | `provas/gabarito_2018.pdf` |
| … | idem para cada ano anterior | … |
| 2008 | por matéria | `provas/gabarito_2008.pdf` |

Os caminhos são relativos a `https://www.vestibular.ita.br/`.

## Abrangência da 2ª fase

A 2ª fase é **discursiva** e, portanto, está fora do contrato `single-choice` do produto. Fica registrada apenas para proveniência.

| Edições | Arquivos observados |
| ------- | ------------------- |
| 2025–2026 | `matematica_{ano}_2f.pdf`, `fisica_{ano}_2f.pdf`, `quimica_{ano}_2f.pdf`, `portugues_{ano}_2f.pdf`, `gabarito_{ano}_2f.pdf` |
| 2019–2024 | `matematica_{ano}_2f.pdf`, `fisica_{ano}_2f.pdf`, `quimica_{ano}_2f.pdf`, `redacao_{ano}_2f.pdf` |
| 2018 e anteriores | a página lista apenas as matérias da 1ª fase + gabarito; a 2ª fase não aparece com a mesma estrutura |

A estrutura por faixa de ano precisa ser confirmada item a item antes de qualquer ingestão.

## Estrutura e formato observados

- **1ª fase recente (2025 e 2026):** 48 questões objetivas, 12 de Matemática, 12 de Física, 12 de Química e 12 de Inglês, cada uma com uma única resposta correta e cinco alternativas.
- **1ª fase 2023:** o gabarito oficial lista 60 posições distribuídas entre Física, Português, Inglês, Matemática e Química. Isso indica que a composição da prova **mudou ao longo dos anos** (a edição recente não inclui Português na 1ª fase). A contagem deve ser derivada do gabarito de cada edição, nunca fixada no normalizador.
- As duas fases convivem na mesma página; o parser não pode assumir uma nomenclatura única.

## Anomalias e pontos de atenção

- **Edição 2023:** o próprio gabarito registra que a questão **06 foi anulada** por erros de digitação e a **18 por ambiguidade nas alternativas**, ambas consideradas corretas para todos os candidatos. Qualquer normalização precisa preservar esse estado, sem inventar uma alternativa correta.
- **Nomenclatura variável** entre faixas de ano (`_fase1`, `_2f`, arquivos por matéria), exigindo regras distintas por período.
- **Discursivas** da 2ª fase não cabem no contrato atual.

## Condições de uso

O conteúdo das questões é de titularidade do **Instituto Tecnológico de Aeronáutica (ITA)**. Vale a mesma regra das bancas já documentadas em [`docs/research/comvest-unicamp-inventory.md`](comvest-unicamp-inventory.md) e [`docs/research/fuvest-usp-inventory.md`](fuvest-usp-inventory.md): reprodução parcial com atribuição, com a checagem de obras de terceiros embutidas em cada questão e o sign-off editorial do mantenedor pendentes antes de qualquer uso público amplo.

Este levantamento não copiou PDFs nem o texto integral das questões para o repositório ou `public/data`.

## Próximos passos sugeridos

1. Confirmar manualmente cada URL e a contagem de questões por edição pelo gabarito.
2. Se o ITA for escolhido como banca piloto, começar pelas edições com `{ano}_fase1.pdf` + `gabarito_{ano}.pdf` (2019–2026), que têm texto nativo e nomenclatura estável.
3. Tratar o parseamento do gabarito (incluindo questões anuladas) como caso explícito, sem inventar conteúdo.

## Como verificar

- Abrir `https://www.vestibular.ita.br/provas.htm` e conferir os links acima por ano.
- Conferir o Aviso de anulação no `provas/gabarito_2023.pdf`.
