# Artefatos e run-ledger da ingestão

Segunda entrega da [pipeline de ingestão de vestibulares](vestibular-ingestion-pipeline.md)
(sub-issue [#35](https://github.com/paulop2/projeto-integrador-PJI240/issues/35), epic
[#2](https://github.com/paulop2/projeto-integrador-PJI240/issues/2)). Estabelece o
store de artefatos endereçado por conteúdo e um `run-ledger` mínimo que registra
toolchain, configuração, entradas e outputs de uma execução, permitindo reexecução
determinística, retomada e auditoria. Segue a entrega anterior, o
[corpus de ouro e manifesto da Comvest](../research/comvest-golden-corpus.md).

A arquitetura ([pipeline de ingestão](vestibular-ingestion-pipeline.md)) define os
tipos conceituais; este documento fixa o contrato implementado e as invariantes
verificáveis.

## Invariantes

- Todo artefato é imutável e identificado pelo SHA-256 dos seus bytes; o caminho é
  apenas um localizador.
- Nenhum artefato anterior é sobrescrito. Gravar os mesmos bytes devolve a mesma
  referência; gravar bytes diferentes sob um endereço existente é um erro.
- Repetir a mesma execução com as mesmas entradas, configuração e versões de
  ferramenta reutiliza os mesmos hashes de saída e não recalcula o estágio.
- O `run-ledger` registra quais estágios executaram ou vieram de cache, sem alterar
  a identidade lógica da execução (`runId`).

## Contrato do artefato

Definido em [`src/contracts/ingestion.ts`](../../src/contracts/ingestion.ts) com Zod e
validado na gravação.

| Campo | Tipo | Papel |
| --- | --- | --- |
| `kind` | `ArtifactKind` | Um dos doze tipos da arquitetura (`source-manifest`, `page-evidence`, `question-package`, `run-ledger`, ...). |
| `sha256` | `sha256:<64 hex>` | Identidade do conteúdo. |
| `uri` | string | Localizador dentro do store. |
| `byteSize` | inteiro ≥ 0 | Tamanho em bytes. |
| `mediaType` | `tipo/subtipo` | Formato dos bytes (`application/json`, `application/zip`, ...). |

O `sha256` é a identidade do artefato. Já `uri` e `byteSize` são, respectivamente, o
localizador e o tamanho fornecidos pelo store e canônicos nas `ArtifactRef` que ele
produz. O schema valida apenas o formato desses campos e não exige consistência
cruzada entre `uri`/`byteSize` e `sha256`: a correspondência é verificada quando o
store lê os bytes e reconfere o hash.

## Store endereçado por conteúdo

Implementado em [`src/data/artifact-store.ts`](../../src/data/artifact-store.ts). O
núcleo usa apenas Web Crypto, então roda no build-time e em testes; o acesso a disco
fica atrás de uma porta pequena (`ArtifactStorage`) implementada para o sistema de
arquivos em [`scripts/artifact-store-fs.ts`](../../scripts/artifact-store-fs.ts).

O endereço deriva do hash, sem depender do `kind`:

```text
sha256/<dois primeiros hex>/<64 hex>     ex.: sha256/5a/5a02…55d2
```

| Operação | Comportamento |
| --- | --- |
| `put({ kind, mediaType, bytes })` | Calcula o hash, grava se for novo e devolve `ArtifactRef`. Se os bytes já existem, valida e reutiliza sem escrever. |
| `read(ref)` | Lê os bytes e reconfere o hash; conteúdo corrompido gera `ArtifactIntegrityError`. |
| `has(sha256)` | Indica se o endereço já está no store. |

O adaptador de arquivos grava com a flag exclusiva `wx`: um arquivo existente nunca
é substituído. Se dois processos disputarem o mesmo endereço, o segundo apenas
verifica a integridade dos bytes já gravados.

## run-ledger

Implementado em [`src/data/run-ledger.ts`](../../src/data/run-ledger.ts). O contrato
`runLedgerSchema` registra:

| Campo | Papel |
| --- | --- |
| `schemaVersion` | Versão do contrato (hoje `1`). |
| `runId` | Identidade determinística da execução. |
| `toolchain` | Lista `{ name, version }` das ferramentas e modelos usados. |
| `config` | Configuração normalizada (primitivos por chave). |
| `inputs` | Artefatos de entrada da execução. |
| `outputs` | União dos artefatos produzidos pelos estágios. |
| `stages` | Por estágio: `id`, `revision`, `cacheKey`, `disposition` (`executed`/`reused`), `inputs` e `outputs`. |

### Chave de cache

Cada estágio tem uma `cacheKey` derivada de:

- `id` e `revision` do estágio;
- hashes das entradas (do estágio ou, por padrão, da execução);
- configuração normalizada;
- versões da toolchain.

A configuração e a toolchain são serializadas com
[`canonicalJson`](../../src/data/artifact-store.ts) (chaves ordenadas), então a chave
não depende da ordem das propriedades. O `runId` usa os mesmos elementos mais as
`cacheKey` dos estágios.

Quando a `cacheKey` já existe no `StageCache`, o estágio não executa: o ledger marca
`disposition: "reused"` e devolve as referências gravadas. Um `runId` igual entre duas
execuções confirma a mesma linhagem, mesmo que o ledger de cada execução seja um
artefato novo (a `disposition` muda).

## Fluxo típico

```ts
const store = new ArtifactStore(createFileArtifactStorage('artifacts'));
const cache = createFileStageCache('artifacts/stage-cache.json');

const recorder = new RunLedgerRecorder({
  store,
  cache,
  toolchain: [{ name: 'bluex-bootstrap', version: '1.0.0' }],
  inputs: [sourceSnapshotRef],
  config: { layoutProfile: 'comvest-bluex-objective', layoutVersion: 1 },
});

const { disposition, outputs } = await recorder.stage({
  id: 'normalize',
  revision: '1',
  execute: async () => [await store.put({ kind: 'question-package', mediaType: 'application/json', bytes })],
});

const ledgerRef = await recorder.finalize();
```

## Validação

| Verificação | Arquivo |
| --- | --- |
| Contratos de artefato e ledger (formato, unicidade de estágio e de cache, outputs rastreáveis). | [`tests/ingestion-artifacts.test.ts`](../../tests/ingestion-artifacts.test.ts) |
| Store: endereçamento por conteúdo, reuso, detecção de corrupção e recusa de sobrescrita. | idem |
| Determinismo: segunda execução reutiliza os mesmos hashes sem recalcular. | idem |
| Imutabilidade em disco e retomada pela cache persistida. | idem |

```powershell
npm run typecheck
npx vitest run tests/ingestion-artifacts.test.ts
npm test
```

## Limitações e próximos passos

- O contrato cobre o mínimo para reprodutibilidade e auditoria. Findings, decisões
  humanas e classificação de questões publicadas/rejeitadas entram nas etapas de
  revisão e publicação, quando esses artefatos existirem.
- A `StageCache` de arquivo é um índice JSON único. Gravações dentro do mesmo processo
  são serializadas por caminho (fila in-process) e usam arquivo temporário único, então
  estágios executados em paralelo não perdem entradas nem colidem no `rename`. Entre
  processos não há bloqueio: execuções concorrentes de processos distintos sobre o
  mesmo índice ainda não são coordenadas. Limpeza de intermediários segue como
  operação administrativa separada, nunca parte da publicação.
- Extração de PDF/OCR e os Adapters por banca definem, nas próximas entregas, o que
  cada estágio grava; os hashes e a retomada já ficam garantidos por este contrato.
