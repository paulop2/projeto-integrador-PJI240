# Atribuição — Fuvest / Vestibular USP

As questões dos pacotes desta pasta são de titularidade da **Fuvest /
Vestibular USP** e foram obtidas pelo recorte `questions/USP` do dataset
**BLUEX** (`Portuguese-Benchmark-Datasets/BLUEX`), commit
`6cdd69bd8dc8d0144e6bb01501ccae312720a0e6`, ZIP SHA-256
`5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2`.

Atribuição exigida: **Fuvest / Vestibular USP** (por edição/ano). Consulte
`docs/research/fuvest-usp-inventory.md` para as condições de uso e
`docs/research/data/fuvest-usp-import-report.json` para proveniência,
contagens, rejeições e assets ignorados.

> Diferentemente da Comvest, não foi localizada, no âmbito desta entrega, uma
> autorização pública equivalente para reprodução. A publicação aqui preserva a
> atribuição e a proveniência, mas o uso público amplo permanece pendente de
> revisão editorial/sign-off do mantenedor.

O importador (`scripts/import-fuvest.ts`, sobre a lógica comum de
`scripts/bluex-import.ts`) não altera editorialmente enunciados, alternativas,
gabaritos, matérias ou imagens: apenas normaliza identificadores, resolve
marcadores `[IMAGE n]` para os assets locais e valida a estrutura do contrato de
runtime.
