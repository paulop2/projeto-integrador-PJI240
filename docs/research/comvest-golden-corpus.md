# Corpus de ouro e manifesto da ingestão Comvest

Primeira entrega da [pipeline de ingestão de vestibulares](../architecture/vestibular-ingestion-pipeline.md)
(sub-issue [#34](https://github.com/paulop2/projeto-integrador-PJI240/issues/34), epic
[#2](https://github.com/paulop2/projeto-integrador-PJI240/issues/2)). Fixa, antes da
extração de PDF/OCR, o manifesto de ingestão da Comvest/Unicamp e um corpus de ouro
com casos selecionados do BLUEX e o resultado esperado por campo.

O documento da arquitetura lista "política inicial de seleção e armazenamento do
corpus de ouro" entre as decisões abertas. Esta entrega resolve a primeira parte:
os casos, as fontes e as respostas esperadas ficam versionados aqui; o armazenamento
permanece em `docs/research/data/`, ao lado dos demais artefatos de pesquisa.

## Artefatos

| Artefato | Papel |
| --- | --- |
| `docs/research/data/comvest-ingestion-manifest.json` | Manifesto versionado da edição Comvest: instituição, exame, edições/anos, tipo aceito e referência BLUEX. |
| `docs/research/data/comvest-golden-corpus.json` | Casos selecionados do BLUEX com entrada bruta e resultado esperado por campo. |
| `src/data/comvest-golden-corpus.ts` | Contratos Zod (`schemaVersion`) do manifesto e do corpus, com validações cruzadas. |
| `tests/comvest-golden-corpus.test.ts` | Testes de regressão que consomem o corpus sem depender do dataset externo. |

## Proveniência

Todo o conteúdo deriva do snapshot fixado do BLUEX já usado pelo inventário
[#31](https://github.com/paulop2/projeto-integrador-PJI240/issues/31):

| Item | Valor |
| --- | --- |
| Dataset | `Portuguese-Benchmark-Datasets/BLUEX` |
| Commit | `6cdd69bd8dc8d0144e6bb01501ccae312720a0e6` |
| ZIP | `data/bluex_dataset.zip` — SHA-256 `5a02d9fcd5714332ea14afd2c412fb1839a7af518b1c6bd29008ad9b8ccf55d2` |
| Ausência de conteúdo inventado | O corpus só seleciona casos existentes no inventário; o teste reconfere os metadados contra `comvest-unicamp-bluex-inventory.json`. |

`docs/research/data/comvest-unicamp-import-report.json` segue como a evidência da
importação completa (630 questões de origem, 626 publicadas, 4 rejeições e 21 assets
ignorados). O corpus não duplica a edição inteira: contém apenas os casos de aceitação.

## Manifesto

`comvest-ingestion-manifest.json` aproxima-se do artefato `source-manifest` da
arquitetura para a Comvest. Cada item de `editions` traz os campos de
`FirstPhaseIngestionSpec` (`board`, `phase`, `acceptedKind`, `institutionId`, `examId`,
`editionId`, `year`, `layoutProfile`), mais `day` e `sourceQuestionsPath` para localizar
o recorte do snapshot. A referência BLUEX (`reference`) é única e compartilhada pelas
oito edições: instituição, exame, edições/anos, tipo aceito `single-choice` e commit +
SHA-256.

O manifesto cobre as oito edições de 2018 a 2024 (2021 separada em `day1` e `day2`),
em linha com o inventário e o relatório de importação. O campo `sources` do
`FirstPhaseIngestionSpec` (documentos oficiais e gabaritos travados por hash) fica de
fora porque o travamento do PDF pertence à etapa seguinte da arquitetura.

## Corpus de ouro

Cada caso tem `sourceFile`, a entrada BLUEX bruta (`input`, completa o suficiente para
reproduzir a normalização) e o `expected` por campo. Para manter o corpus enxuto e
ainda assim verificável, a entrada é apenas a dos casos selecionados; o inventário
commitado permanece a fonte autoritativa dos metadados.

Dois tipos de caso:

- `question`: um `input` executado por `normalizeComvestQuestion`, com `expected.status`
  `published` (contrato completo por campo) ou `rejected` (motivo explícito).
- `batch`: um subconjunto de `sourceFiles` executado por `createComvestPackages`, com o
  resultado esperado de pacotes, rejeições, assets referenciados e assets ignorados.

O bloco `coverage` mapeia cada categoria de teste para os `caseId` que a cobrem. O
bloco `deferred` registra as categorias que o BLUEX não consegue representar e o
motivo de cada adiamento.

### Cobertura alinhada à estratégia de testes

| Categoria da arquitetura | Cobertura | Casos | Origem |
| --- | --- | --- | --- |
| Texto simples | `simple-text` | `simple-text` | `2021/day1/26.json` |
| Duas colunas | Adiada para PDF/OCR | `deferred` | — |
| Fórmula | `formula` | `formula`, `empty-answer-2021` | `2019/38.json`, `2021/day2/48.json` |
| Tabela | `table` | `table` | `2019/18.json` |
| Imagem com texto | `image-in-prompt` | `image-in-prompt`, `unexpected-alternative-count` | `2018/15.json`, `2019/53.json` |
| Imagem como alternativa | `image-as-alternative` | `image-as-alternative` | `2019/63.json` |
| Questão multidisciplinar | `multidisciplinary` | `multidisciplinary` | `2018/12.json` |
| Questão sem gabarito (proxy de anulada no #31) | `empty-answer` | `empty-answer-2019`, `empty-answer-2021` | `2019/60.json`, `2021/day2/48.json` |
| Quebra de questão entre páginas | Adiada para PDF/OCR | `deferred` | — |
| Evidência da página original | Adiada para PDF/OCR | `deferred` | — |
| Decisão humana aprovada | Adiada para a revisão | `deferred` | — |
| Hifenização por quebra de linha | `hyphenation` | `hyphenation` | `2023/61.json` |
| Caracteres problemáticos (PUA) | `problematic-characters` | `problematic-characters` | `2021/day1/35.json` |

As categorias `hyphenation` e `problematic-characters` fixam a presença literal do
artefato no texto (a quebra `adi-\ncionados` e os codepoints da área de uso privado que o
BLUEX usa como marcadores). O normalizador atual preserva o enunciado verbatim; decidir
juntar palavras quebradas pertence ao tratamento de layout das etapas de PDF/OCR. O valor
do golden aqui é detectar corrupção de texto por regressões futuras.

Anomalias do inventário [#31](https://github.com/paulop2/projeto-integrador-PJI240/issues/31):

| Anomalia | Categoria | Caso | Resultado esperado |
| --- | --- | --- | --- |
| Questão com 3 alternativas | `unexpected-alternative-count` | `unexpected-alternative-count` | Publicada pela regra do contrato (≥ 2 alternativas e 1 resposta), sem padrão fixo de 4/5. |
| 2 questões sem gabarito | `empty-answer` | `empty-answer-2019`, `empty-answer-2021` | Rejeitadas (`empty-answer`), nunca completadas por suposição. |
| Colisão de IDs de 2021 | `id-collision-2021` | `id-collision-2021` | `comvest-2021-day1` e `comvest-2021-day2` publicam IDs globais distintos. |
| Assets órfãos de 2021 | `orphan-assets` | `orphan-assets` | Os 6 arquivos são ignorados explicitamente (`orphan-file`), nunca publicados. |

Casos reais de rejeição do normalizador, além das anomalias:

| Caso | Origem | Motivo |
| --- | --- | --- |
| `alternative-image-count-unsupported` | `2021/day1/41.json` | Alternativa com 3 imagens (`alternative-image-count-unsupported`). |
| `unreferenced-associated-image` | `2021/day2/68.json` | Imagem associada não referenciada por `[IMAGE n]`. |

## Como executar

```powershell
npm run typecheck
npx vitest run tests/comvest-golden-corpus.test.ts
npm test
```

O teste `tests/comvest-golden-corpus.test.ts` não acessa o dataset: ele lê o
manifesto, o corpus, o inventário e o relatório versionados no repositório,
reconfere os metadados de cada caso contra o inventário, replaya cada caso no
normalizador puro e valida o formato com os schemas Zod.

## Limitações e próximos passos

- O corpus contém o conteúdo bruto **apenas dos casos selecionados**; o restante do
  dataset permanece externo, como em #31.
- Os testes reconferem os **metadados** de cada caso contra o inventário (resposta,
  matérias, imagens, número, ano/dia) e replayam o normalizador, mas não reconferem o
  texto integral offline: um erro de transcrição em `input.question` ou nas alternativas
  não seria detectado pela suíte. A fidelidade dos bytes depende do snapshot fixado.
- As categorias que o BLUEX não representa ficam explicitamente adiadas em `deferred`:
  "duas colunas" e "quebra de questão entre páginas" (layout), "evidência de página"
  (`page-evidence`) e "decisão humana aprovada" (`human-approval`). Elas pertencem às
  etapas de PDF/OCR e de revisão da arquitetura.
- O corpus valida a normalização a partir do BLUEX. A conferência frame-a-frame contra
  PDF/gabarito oficiais pertence às etapas seguintes da arquitetura.
- Próximo passo natural: usar o mesmo corpus de aceitação para os Adapters Comvest/Fuvest
  e para o gate de revisão humana.

## Licenciamento e atribuição

As questões selecionadas são de titularidade da **Comvest / Vestibular Unicamp** e vêm
do recorte `questions/UNICAMP` do BLUEX. Vale a regra de reprodução **parcial** com
atribuição, registrada em
[`public/data/comvest/ATTRIBUTION.md`](../../public/data/comvest/ATTRIBUTION.md) e em
[`comvest-unicamp-inventory.md`](comvest-unicamp-inventory.md). Este artefato não
publica nada em `public/data`; é um corpus de pesquisa e teste.
