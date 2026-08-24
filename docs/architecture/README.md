# Contratos arquiteturais do MVP

Este diretório e `src/contracts/` são a referência compartilhada entre importador,
frontend, armazenamento offline e backend. O plano de execução multiagente recebido
em 2026-08-23 prevalece onde divergir de `prompt-mvp-enem.md`, que descreve uma
iteração anterior do produto.

## Limites dos módulos

- **Data** produz `CatalogManifest` e `QuestionPackage`, validando-os antes de gravar.
- **Frontend** consome os contratos, implementa apenas `single-choice` no MVP e
  apresenta um estado controlado para os demais tipos.
- **Offline** guarda pacotes/respostas no Cache Storage e metadados/progresso/fila no
  IndexedDB. Uma troca só ocorre depois de validar completamente o novo pacote.
- **Backend** deriva identidade da sessão, aceita `SyncRequest` sem `userId`, trata
  `eventId` como chave idempotente e calcula o resultado usando seu próprio gabarito.

## Invariantes congeladas para a onda 1

- IDs de catálogo são dados configuráveis em kebab-case; não há enum de instituições.
- O ID global de uma questão é literalmente
  `{examId}-{editionId}-{sourceQuestionId}`. Ele é opaco e nunca deve ser separado
  por hífens no consumo.
- Pacotes ficam em `/data/{examId}/{editionId}.json`; manifesto e pacote usam
  `schemaVersion: 1`.
- `version` crescente ou `sha256` diferente sinaliza atualização. O hash é SHA-256
  do corpo transferido, representado como `sha256:<hex>`; `byteSize` é em bytes.
- O timer dura exatamente 180.000 ms. Resposta ou timeout é terminal por exibição.
- Uma vista nasce após 1 segundo com pelo menos 60% do card visível. A chave lógica
  de deduplicação é `(questionId, localDay)`; sincronização também deduplica por
  `eventId`.
- Eventos enviados pelo cliente não carregam `userId`, `correct` nem gabarito.
- Cursores são tokens opacos emitidos pelo servidor; clientes não os interpretam.
- Estatísticas retornam total e agrupamentos por `subjectId` e `examId`; `accuracy`
  é uma razão de 0 a 1 e fica `null` quando ainda não há respostas.
- Logout limpa da interface o progresso ligado à conta, mas não remove pacotes.

Alterações incompatíveis exigem novo `schemaVersion` e um ADR antes de mudar estes
contratos.
