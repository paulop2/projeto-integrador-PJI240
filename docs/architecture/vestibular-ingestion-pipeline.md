# Pipeline de ingestão de vestibulares

- Status: proposta recomendada
- Escopo inicial: primeira fase objetiva da Comvest
- Próxima banca: Fuvest
- Epic: [#2 — Importação e normalização de novas bancas](https://github.com/paulop2/projeto-integrador-PJI240/issues/2)

## Para quem é este documento

Este documento orienta quem for implementar ou estender a ingestão de provas sem
depender do histórico que originou a arquitetura. Depois da leitura, deve ser
possível:

1. implementar a primeira pipeline da Comvest;
2. adicionar a Fuvest sem duplicar aquisição, OCR, revisão ou publicação;
3. diagnosticar de qual fonte e transformação veio cada campo publicado;
4. distinguir uma falha de infraestrutura de um conteúdo rejeitado ou pendente de
   revisão.

Os levantamentos que fundamentam o desenho estão em
[Comvest/Unicamp como banca piloto](../research/comvest-unicamp-pilot.md),
[BLUEX e BLUEX-v2 como insumos](../research/bluex-pipeline-sources.md) e
[Inventário das questões Comvest/Unicamp no BLUEX](../research/comvest-unicamp-inventory.md).
O inventário traz o snapshot fixado por commit e SHA-256, as contagens por ano/matéria
e as anomalias de 2021 (IDs colididos, gabaritos ausentes e assets órfãos) que a
extensão da Comvest deve tratar.

## Problema e limites

Provas de vestibular chegam como documentos, não como questões prontas para o
aplicativo. Uma edição pode combinar texto nativo do PDF, páginas rasterizadas,
fórmulas, tabelas, imagens, alternativas gráficas, gabaritos separados, questões
anuladas e layouts diferentes entre anos ou cadernos.

A pipeline precisa transformar essas evidências em `QuestionPackage` sem esconder
perdas de informação ou correções humanas. Ela deve ser reexecutável, auditável e
capaz de retomar depois de uma revisão.

O primeiro incremento aceita apenas questões objetivas da primeira fase. Questões
discursivas e redações são reconhecidas e registradas como não suportadas, mas não
são normalizadas nem publicadas. BLUEX-v2 informa uma evolução futura; ele não
amplia o escopo atual.

A pipeline existe apenas no build-time. O runtime offline recebe o pacote final e
seus assets locais; ele não conhece PDF, OCR, BLUEX, confiança ou decisões de
revisão.

## Decisão arquitetural

Adotar um Module de ingestão com uma Interface externa pequena e orientada a
artefatos imutáveis. Sua Implementation executa internamente um grafo de estágios.

Essa combinação oferece dois benefícios:

- o caller comum informa um manifesto e recebe um resultado tipado, sem montar uma
  sequência de extração manualmente;
- cada estágio interno ainda produz artefatos endereçados por conteúdo, permitindo
  cache, retomada, paralelismo, inspeção e reprodução de falhas.

O seam público é `VestibularIngestion`. PDF, OCR, armazenamento de artefatos e
formato da banca são adapters internos. Comvest e Fuvest ocupam o mesmo seam de
formato de prova objetiva.

## Desenhos considerados

### Facade de execução única

```ts
interface VestibularIngestion {
  run(job: IngestionJob): Promise<
    | { status: 'awaiting-human-review'; reviewPath: string }
    | { status: 'completed'; package: QuestionPackage }
  >;
}
```

É o desenho mais simples para o caller e esconde quase toda a complexidade. Porém,
o diretório de execução se torna estado implícito e passa a concentrar regras de
retomada difíceis de representar. Inspecionar um estágio ou distinguir artefatos
obsoletos depende de convenções externas à Interface.

### Grafo de estágios público

```ts
pipeline.run(comvestWorkflow, sourceArtifacts, {
  resume: true,
  mode: 'until-blocked',
});
```

Esse desenho maximiza composição, substituição e experimentação. Também expõe ao
caller tipos de artefatos, ligações entre nodes e gates. Um operador poderia montar
um grafo incompleto, publicar antes da revisão ou variar sem querer a ordem das
evidências. A flexibilidade é útil dentro da Implementation, mas cria uma Interface
grande e fácil de usar incorretamente.

### Ingestão orientada a artefatos e gates

```ts
interface VestibularIngestion {
  ingest(command: IngestFirstPhase): Promise<IngestionOutcome>;
}
```

Esse desenho mantém uma operação externa, mas torna fontes, decisões e resultados
explicitamente imutáveis. O resultado informa em qual gate a execução parou e
referencia o ledger e os relatórios correspondentes. Ele foi escolhido como
Interface externa. O grafo do desenho anterior será usado apenas internamente.

## Interface externa recomendada

Os tipos abaixo são conceituais. Eles estabelecem as informações e invariantes da
Interface; não impõem uma biblioteca ou estrutura de arquivos.

```ts
type Sha256 = `sha256:${string}`;
type Board = 'comvest' | 'fuvest';
type ArtifactKind =
  | 'source-manifest'
  | 'source-snapshot'
  | 'page-evidence'
  | 'ocr-observations'
  | 'question-candidates'
  | 'validation-report'
  | 'review-bundle'
  | 'review-decisions'
  | 'approved-corpus'
  | 'question-package'
  | 'package-descriptor'
  | 'run-ledger';
type Gate =
  | 'sources-locked'
  | 'evidence-extracted'
  | 'questions-segmented'
  | 'human-review'
  | 'package-validated';

interface LockedSource {
  readonly role: 'exam' | 'answer-key';
  readonly uri: string;
  readonly sha256: Sha256;
}

interface BluexReference {
  readonly kind: 'bluex-objective';
  readonly uri: string;
  readonly revision: string;
  readonly sha256: Sha256;
}

interface FirstPhaseIngestionSpec {
  readonly schemaVersion: 1;
  readonly board: Board;
  readonly phase: 1;
  readonly acceptedKind: 'single-choice';
  readonly institutionId: string;
  readonly examId: string;
  readonly editionId: string;
  readonly year: number;
  readonly layoutProfile: {
    readonly id: string;
    readonly version: number;
  };
  readonly sources: readonly LockedSource[];
  readonly references: readonly BluexReference[];
}

interface ArtifactRef<K extends ArtifactKind> {
  readonly kind: K;
  readonly sha256: Sha256;
  readonly uri: string;
  readonly byteSize: number;
  readonly mediaType: string;
}

interface IngestFirstPhase {
  readonly spec: FirstPhaseIngestionSpec;
  readonly reviewDecisions: readonly ArtifactRef<'review-decisions'>[];
}

type IngestionOutcome =
  | {
      readonly status: 'blocked';
      readonly gate: 'human-review';
      readonly reviewBundle: ArtifactRef<'review-bundle'>;
      readonly ledger: ArtifactRef<'run-ledger'>;
      readonly unresolvedCount: number;
    }
  | {
      readonly status: 'rejected';
      readonly gate: Gate;
      readonly report: ArtifactRef<'validation-report'>;
      readonly ledger: ArtifactRef<'run-ledger'>;
    }
  | {
      readonly status: 'ready';
      readonly package: ArtifactRef<'question-package'>;
      readonly descriptor: ArtifactRef<'package-descriptor'>;
      readonly report: ArtifactRef<'validation-report'>;
      readonly ledger: ArtifactRef<'run-ledger'>;
    };

interface VestibularIngestion {
  ingest(command: IngestFirstPhase): Promise<IngestionOutcome>;
}
```

Problemas de conteúdo retornam `blocked` ou `rejected`. Exceções ficam reservadas a
falhas de infraestrutura, como falta de disco, processo externo indisponível ou
artefato ilegível.

Repetir o mesmo manifesto, fontes, decisões e toolchain deve produzir ou reutilizar
os mesmos artefatos. Alterar qualquer um desses elementos cria outra linhagem.

Um caller típico carrega o manifesto e as decisões disponíveis e trata o resultado
sem conhecer o grafo interno:

```ts
const result = await ingestion.ingest({ spec, reviewDecisions });

if (result.status === 'blocked') {
  presentForReview(result.reviewBundle);
} else if (result.status === 'rejected') {
  reportContentFailure(result.report);
} else {
  publishValidatedRelease(result.package, result.descriptor);
}
```

## Artefatos da pipeline

Artefatos são imutáveis e identificados pelo hash de seus bytes. Caminhos são
localizadores, não identidade.

| Artefato | Conteúdo e função |
| --- | --- |
| `source-manifest` | Edição, fase, perfil de layout, documentos oficiais e referências. |
| `source-snapshot` | Cópia verificada dos PDFs, gabaritos e snapshot BLUEX. |
| `page-evidence` | Texto nativo, blocos, coordenadas, renders e imagens por página. |
| `ocr-observations` | Resultados brutos do OCR por região, com engine, versão e confiança. |
| `question-candidates` | Questões segmentadas ainda não aprovadas. |
| `validation-report` | Findings automáticos, métricas, rejeições e divergências. |
| `review-bundle` | Material necessário para revisão lado a lado. |
| `review-decisions` | Correções e decisões humanas ligadas ao fingerprint do candidato. |
| `approved-corpus` | Candidatos aprovados e resolvidos. |
| `question-package` | Contrato enxuto consumido pelo aplicativo. |
| `package-descriptor` | Hash, bytes, contagem, versão e classificação do pacote. |
| `run-ledger` | Linhagem completa, toolchain, configurações, findings e outputs. |

Uma decisão humana nunca altera o OCR ou a extração original. Ela é um novo
artefato aplicado sobre uma evidência identificada. Se a fonte ou o candidato
mudar, a decisão anterior fica obsoleta e não pode ser aplicada silenciosamente.

## Representação intermediária

`QuestionPackage` é pequeno porque serve ao runtime. A ingestão precisa de uma
representação intermediária lossless:

```ts
interface EvidenceField<T> {
  readonly value: T;
  readonly observations: readonly EvidenceObservation[];
  readonly selectedObservation: string | null;
}

interface EvidenceObservation {
  readonly id: string;
  readonly method: 'pdf-text' | 'embedded-image' | 'ocr' | 'bluex' | 'human';
  readonly sourceDocumentId: string;
  readonly page: number | null;
  readonly boundingBox: BoundingBox | null;
  readonly confidence: number | null;
  readonly rawArtifact: ArtifactRef<ArtifactKind>;
}

interface QuestionCandidate {
  readonly candidateId: string;
  readonly sourceQuestionId: string | null;
  readonly phase: 1 | 2;
  readonly sourceKind: 'objective' | 'discursive' | 'unknown';
  readonly prompt: EvidenceField<RichText>;
  readonly alternatives: readonly EvidenceField<AlternativeCandidate>[];
  readonly answer: EvidenceField<string> | null;
  readonly subjects: readonly EvidenceField<string>[];
  readonly assets: readonly EvidenceAsset[];
  readonly findings: readonly Finding[];
  readonly reviewStatus: 'pending' | 'approved' | 'rejected';
}
```

Essa representação permite manter simultaneamente texto nativo, OCR e BLUEX. Uma
correção escolhe ou substitui uma observação sem apagar as anteriores.

Não é necessário modelar agora a semântica completa de questões discursivas e
subquestões. Basta preservar sua evidência bruta e rejeitá-las no gate de escopo.

## Fluxo interno

```text
manifesto
  -> travar e verificar fontes
  -> extrair primitivas do PDF -----------+
  -> importar referência BLUEX -----------+--> fundir evidências
                                               |
primitivas -> planejar OCR -> executar OCR ----+
                                               |
                                               v
                                  segmentar com BoardAdapter
                                               |
gabarito oficial -> interpretar ---------------+
                                               |
                                               v
                                  reconciliar por campo
                                               |
                                  validar e classificar riscos
                                               |
                                      revisão humana
                                               |
                                   normalizar e publicar
```

Extração de PDF e importação de BLUEX podem executar em paralelo. OCR depende do
planejamento baseado nas primitivas do PDF. Segmentação e gabarito dependem do
perfil de layout da banca. Publicação depende de todos os findings críticos terem
sido resolvidos.

O executor calcula a chave de cache de cada estágio a partir de:

- hashes das entradas;
- revisão do estágio;
- configuração normalizada;
- versões e modelos das ferramentas;
- perfil de layout e sua versão.

No Windows, processos externos devem receber executável e argumentos separados,
sem interpretação por shell, e usar caminhos absolutos. Artefatos de texto e JSON
devem usar UTF-8 e finais de linha LF determinísticos.

## Extração e OCR

OCR não é o primeiro passo para toda página:

1. extrair a camada textual, a ordem espacial e os objetos incorporados do PDF;
2. renderizar a página para conservar uma referência visual;
3. detectar regiões sem texto, com caracteres suspeitos ou conteúdo rasterizado;
4. executar OCR apenas nessas regiões;
5. preservar lado a lado texto nativo, OCR e recorte original;
6. abrir revisão quando as observações divergirem ou a estrutura não puder ser
   demonstrada automaticamente.

Fórmulas, tabelas e diagramas não devem ser reduzidos obrigatoriamente a texto. O
asset original pode permanecer no pacote, acompanhado por texto alternativo ou
descrição revisada. A seleção de engine de OCR é uma decisão de experimento: a
Interface permite adapters locais ou remotos sem acoplar o restante da pipeline.

## Papel do BLUEX

O BLUEX objetivo pode cumprir três papéis ao mesmo tempo:

- **bootstrap:** fornecer candidatos já estruturados para enunciado, alternativas,
  resposta, disciplinas e imagens;
- **comparação:** detectar diferenças entre a nova extração e uma anotação humana;
- **corpus de teste:** fornecer variedade histórica para regressões de Comvest e
  Fuvest.

Ele não contém página, bounding box, confiança de OCR ou histórico de correção.
Por isso, um item vindo do BLUEX ainda precisa ser alinhado ao PDF e ao gabarito.
Quando não houver alinhamento inequívoco, a pipeline cria um finding revisável.

O snapshot do dataset deve ser fixado por revisão e hash. A pipeline não depende
de contagens ou conteúdo flutuante obtido diretamente de uma versão remota.

BLUEX-v2 permanece fora do normalizador atual. Suas ideias de questão composta,
imagem compartilhada, resposta esperada e revisão podem orientar uma extensão
futura sem entrar na Interface da primeira fase.

## Adapters por banca e layout

Existe um seam real porque Comvest e Fuvest são dois formatos conhecidos:

```ts
interface ObjectiveExamFormatPort {
  readonly board: Board;
  readonly layoutProfileId: string;

  segment(evidence: readonly PageEvidence[]): Promise<QuestionCandidateSet>;
  readAnswerKey(evidence: readonly PageEvidence[]): Promise<AnswerKeyEvidence>;
}
```

O Adapter é responsável por:

- reconhecer edição, fase, caderno e número da questão;
- reconstruir ordem de leitura e limites de cada questão;
- interpretar o gabarito e anuladas;
- mapear disciplinas e interdisciplinaridade;
- identificar alternativas textuais ou gráficas;
- detectar conteúdo fora do escopo;
- aplicar regras conhecidas de um perfil de layout versionado.

Ele não controla aquisição, engine de OCR, revisão, armazenamento de artefatos,
IDs globais ou publicação. Esses comportamentos permanecem comuns.

Não se deve codificar globalmente que uma prova possui quatro ou cinco
alternativas. O Adapter informa a estrutura observada e as regras da edição; o
validador exige pelo menos duas alternativas e exatamente uma resposta para
`single-choice`.

## Gates e validação

### Fontes travadas

- todos os documentos exigidos existem e conferem com seus hashes;
- edição, fase e perfil de layout são explícitos;
- a revisão BLUEX usada está registrada.

### Evidência extraída

- todas as páginas foram inventariadas e renderizadas;
- blocos e assets mantêm página e coordenadas;
- regiões candidatas a OCR possuem decisão registrada.

### Questões segmentadas

- cobertura e numeração são comparadas ao documento e ao gabarito;
- alternativas preservam ordem e pertencimento;
- imagens e marcadores não ficam órfãos;
- questões anuladas e não suportadas são explícitas.

### Revisão humana

A revisão é obrigatória inicialmente. O revisor compara:

- página e recorte original;
- enunciado e alternativas extraídos;
- fórmulas, tabelas e imagens;
- disciplina, número e edição;
- resposta do gabarito;
- diferenças em relação ao BLUEX;
- motivo de rejeição ou anulação.

Autoaprovação só pode ser introduzida depois que um corpus revisado demonstrar
thresholds seguros. Confiança do OCR isoladamente não prova correção.

### Pacote validado

- todas as questões publicadas foram aprovadas;
- cada questão satisfaz o schema de runtime;
- IDs globais são únicos, determinísticos e seguem literalmente
  `{examId}-{editionId}-{sourceQuestionId}`;
- assets são locais e resolvíveis;
- hash, bytes, contagem e versão correspondem aos arquivos publicados;
- o pacote funciona depois de download, ativação, reload e perda de rede.

## Reprodutibilidade e auditoria

O `run-ledger` precisa responder:

- quais bytes entraram;
- quais ferramentas, modelos e configurações foram usados;
- quais estágios executaram ou reutilizaram cache;
- quais observações concorreram por cada campo;
- quais findings foram encontrados;
- quais decisões humanas foram aplicadas;
- quais questões foram publicadas, rejeitadas ou deixadas fora do escopo;
- quais hashes identificam os outputs.

Artefatos anteriores não são sobrescritos. Uma nova extração, correção ou versão
gera outra linhagem. Limpeza de intermediários é uma operação administrativa
separada e nunca faz parte da publicação.

## Estratégia de testes

### Corpus de ouro inicial

Antes de processar uma edição inteira, selecionar exemplos Comvest que cubram:

- texto simples;
- duas colunas;
- fórmula;
- tabela;
- imagem com texto;
- imagem como parte de alternativa;
- questão multidisciplinar;
- questão anulada;
- quebra de questão entre páginas;
- caracteres e hifenização problemáticos.

Cada exemplo deve possuir decisão humana aprovada e evidência da página original.

### Métricas

- cobertura de questões esperadas;
- acerto de segmentação de enunciado e alternativas;
- concordância de resposta com o gabarito;
- concordância por campo com BLUEX;
- recall e ordem dos assets;
- quantidade de findings por categoria;
- taxa de revisão e correção manual;
- estabilidade dos hashes em reexecuções equivalentes.

### Níveis de verificação

1. testes de contrato para todo artefato;
2. testes dos Adapters com páginas e gabaritos fixados;
3. testes de propriedades para IDs, ordem e reexecução;
4. regressões visuais do review bundle;
5. integração desde o manifesto até o pacote;
6. jornada offline com pacote e assets publicados.

## Entregas incrementais sugeridas

1. **Corpus de ouro e manifesto Comvest:** fixar casos, fontes e respostas
   esperadas antes de escolher ferramentas.
2. **Artifact store e ledger:** estabelecer imutabilidade, hashes, retomada e
   relatórios.
3. **Extração de PDF e OCR seletivo:** produzir `page-evidence` sem segmentar
   questões ainda.
4. **Adapter BLUEX e reconciliação:** importar snapshot, alinhar evidências e gerar
   diferenças por campo.
5. **Adapter Comvest:** segmentar primeira fase, interpretar gabarito e produzir
   candidatos.
6. **Review bundle e decisões:** validar o corpus de ouro lado a lado.
7. **Normalizador e publicação:** gerar pacote, descriptor, assets e patch de
   catálogo.
8. **Edição Comvest completa:** medir qualidade, revisar e validar offline.
9. **Adapter Fuvest:** repetir o corpus de aceitação pelo segundo seam real.

As entregas representam capacidades verificáveis, não uma obrigação de criar uma
sub-issue para cada linha. A decomposição no GitHub deve manter incrementos
verticais e critérios observáveis.

## Decisões deliberadamente abertas

- biblioteca de extração e renderização de PDF;
- engine local ou remota de OCR;
- formato e tecnologia da interface de revisão;
- política inicial de seleção e armazenamento do corpus de ouro;
- mapeamento das múltiplas disciplinas preservadas no intermediário para o único
  `subjectId` do contrato atual, ou decisão de versionar esse contrato;
- thresholds que, depois de medidos, podem permitir autoaprovação;
- retenção e limpeza de renders e observações intermediárias;
- necessidade de uma nova versão do contrato para proveniência visível no runtime.

Essas escolhas devem ser tomadas a partir de experimentos com o mesmo corpus de
ouro. Nenhuma delas deve alterar a Interface externa ou remover a trilha de
evidência descrita neste documento.
