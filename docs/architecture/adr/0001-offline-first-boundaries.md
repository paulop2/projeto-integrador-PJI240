# ADR 0001: limites offline-first e contratos versionados

- Status: aceito
- Data: 2026-08-23

## Contexto

O produto deve estudar sem rede, instalar/remover edições independentemente e, se o
usuário optar por autenticar, convergir progresso entre dispositivos. O catálogo
também deve aceitar novas instituições sem alteração de tipos fechados.

## Decisão

Catálogo e questões são artefatos estáticos versionados, validados em runtime com
os schemas de `src/contracts`. Cache Storage possui bytes de JSON/imagens e
IndexedDB possui catálogo, metadados de download, progresso e outbox.

Progresso é um log append-only de eventos identificados por UUID. O servidor deriva
o usuário da sessão, deduplica UUIDs e recalcula acerto a partir de seu gabarito. A
API de sync combina upload idempotente e download incremental por cursor opaco.

## Consequências

- O app anônimo não depende do backend.
- Instalação de pacote deve validar hash e schema antes de publicar a nova versão.
- Novos formatos de questão cabem no envelope existente, mas exigem implementação
  de UI antes de serem respondíveis.
- Eventuais migrações são explícitas por versão de schema; consumidores devem
  rejeitar versões desconhecidas com erro controlado.
