# Atribuição — Comvest / Vestibular Unicamp

As questões dos pacotes desta pasta são de titularidade da **Comvest /
Vestibular Unicamp** e foram obtidas pelo recorte `questions/UNICAMP` do dataset
**BLUEX** (`Portuguese-Benchmark-Datasets/BLUEX`), commit
`6cdd69bd8dc8d0144e6bb01501ccae312720a0e6`, ZIP SHA-256
`5A02D9FCD5714332EA14AFD2C412FB1839A7AF518B1C6BD29008AD9B8CCF55D2`.

Atribuição exigida: **Comvest / Vestibular Unicamp** (por edição/ano). A regra
documentada autoriza reprodução **parcial**, nunca da prova inteira. Consulte
`docs/research/comvest-unicamp-inventory.md` para as condições de uso e
`docs/research/data/comvest-unicamp-import-report.json` para proveniência,
contagens, rejeições e assets ignorados.

O importador (`scripts/import-comvest.ts`) não altera editorialmente enunciados,
alternativas, gabaritos, matérias ou imagens: apenas normaliza identificadores,
resolve marcadores `[IMAGE n]` para os assets locais e valida a estrutura do
contrato de runtime.
