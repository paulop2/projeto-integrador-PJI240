# Gate definitivo de qualidade — onda 5

Data: 2026-08-23  
Decisão final: **APROVADO — nenhum P0/P1 aberto**

Esta terceira reauditoria independente validou as correções dos P1-A/B/C por inspeção, suítes permanentes e probes de browser separados. Nenhum código avaliado foi alterado.

## Fechamento dos últimos bloqueios

### P1-A — E2E no seam real: resolvido

- O teste de pacote parte de contexto limpo e comprova `downloads=0` e zero caches de pacote antes da ação.
- A instalação ocorre pelo clique real em `enem-2023: Baixar`; não há escrita direta de catálogo, download ou JSON no IndexedDB/Cache Storage.
- Interceptar somente os assets remotos `enem.dev` com pixels determinísticos é um double da dependência externa, não um pré-seed do estado testado.
- O E2E confirma 177 questões, Cache Storage, reload controlado, modo avião, conteúdo instalado, remoção e retorno ao fallback.
- A jornada completa responde anonimamente, tenta sync indisponível, autentica pela UI, recupera conexão, envia a outbox, converge em um segundo `BrowserContext`, recarrega e exibe estatística sincronizada, depois faz logout, zera progresso e preserva o pacote.
- `npm run test:e2e`: **4/4 aprovados**, incluindo os dois casos acima.

### P1-B — retomada de sessão e corrida online: resolvido

- O evento `online` reexecuta o probe de sessão; sessão encontrada inicia coordinator e flush.
- Chamadas `online` repetidas compartilham o probe já em voo.
- Probe manual de corrida manteve a primeira consulta de boot pendente, disparou três eventos `online`, resolveu primeiro a consulta mais nova como autenticada e depois a antiga como anônima.
- Resultado observado: **2 consultas de sessão** (boot substituído + um probe online deduplicado), **1 sync**, usuário permaneceu autenticado após a resposta velha, sem alerta. O contador de geração impede resposta obsoleta de sobrescrever o estado.
- A regressão `App.auth.test.tsx` também comprova consulta única na reconexão normal e início único do coordinator/sync.

### P1-C — foco e Axe: resolvido

- Autenticação: foco inicial em “Fechar conta”; `Shift+Tab` envolve para o último controle; `Tab` retorna ao primeiro; Escape fecha; foco retorna a “Entrar ou criar conta”.
- Estatísticas: foco inicial em “Fechar estatísticas”; Escape fecha; foco retorna a “Ver estatísticas”.
- `AuthPanel` e `StatsPanel` possuem `role=dialog`, `aria-modal`, nome acessível e trap compartilhado.
- O `h1` está dentro do landmark `header`.
- Axe completo retornou **zero violações** nos estados base, filtros abertos, autenticação aberta e estatísticas abertas, inclusive zero `moderate`, `serious` ou `critical`.
- As regressões de foco/Escape/restauração passam em `ModalPanels.test.tsx`.

## Matriz automatizada final

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado; 64 módulos transformados |
| `npm test` | aprovado; **15 arquivos / 52 testes** |
| `npm run test:e2e` | aprovado; **4/4 mobile Chromium** |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilidades** de produção |
| `git diff --check` | aprovado |
| busca de `[DEBUG-` | nenhuma instrumentação residual |

## Checklist integral do plano

### Catálogo, dados e formatos

- Catálogo extensível, IDs opacos/globais e schemas runtime validados.
- Pacote `enem-2023` proveniente de `api.enem.dev`: 177 questões únicas; as três questões incompletas da fonte são rejeitadas de modo explícito pelo importador.
- Integridade recalculada: **357.298 bytes**, **177 questões**, SHA-256 `f8e7aeff9b3967af8a0ae53a3d0b86f18125a9216bd64e6869ce389a411e5c7e`.
- Alternativas variáveis, exatamente uma resposta válida em `single-choice` e estado controlado para formatos futuros têm testes.

### Offline/PWA

- Browser limpo lista, instala, valida, cacheia, recarrega offline e remove edição pelo fluxo de UI.
- JSON e assets ficam no Cache Storage; catálogo/downloads/progresso/outbox/sessões ficam no IndexedDB.
- Capacidade, persistência solicitada, hash/tamanho, cache corrompido, atualização atômica/rollback e remoção são cobertos.
- Service worker restaura shell e pacote em modo avião; retorno da conexão é observado.

### Timer, feed, progresso e estatísticas

- Timer inicia em 3:00, usa deadline persistido, congela ao responder, bloqueia exatamente no timeout e sobrevive a reload.
- Vista exige 60% por um segundo e é deduplicada uma vez por questão/dia.
- Estatísticas incluem vistas, respostas, acertos/erros, timeouts, taxa, tempo médio, streak, matéria e prova.
- Pixel 7: viewport 412×839, sem overflow horizontal; card real longo mediu 710×1302 e rolou internamente até 150 px sem mover o feed; o feed fez snap exato de 0 para 839 px e exibiu a questão 2/177.
- `prefers-reduced-motion` está tratado; teclado, nomes acessíveis, timer e feedback possuem cobertura.

### Autenticação, sincronização e segurança

- UI cobre e-mail/senha, cadastro, Google, verificação, recuperação/reset, sessão e logout.
- Login e reconexão iniciam sync; fila usa UUIDs, lotes, cursor, ack, merge e retry exponencial.
- Jornada E2E confirma anônimo → login → falha/reconexão → segundo dispositivo → logout.
- Logout remove progresso/outbox da conta e mantém download.
- Backend deriva usuário da sessão, rejeita ausência de sessão, ignora identidade/resultado do cliente, valida IDs e recalcula resultado pelo gabarito D1.
- Idempotência por usuário/eventId e vista diária, cursor opaco, limite de lote e agregações D1 têm testes.
- Better Auth/Resend escapam conteúdo e usam callbacks na origem do app; nenhum segredo foi versionado; auditoria de dependências não encontrou vulnerabilidade de produção.

### Testes e documentação

- Unitários, integração, browser mobile, Axe e checklist manual automatizável foram executados.
- O E2E de pacote não contorna mais o caminho real; o E2E de sync usa doubles somente nas fronteiras externas de auth/backend/assets.
- README e documentos de arquitetura/backend/testing descrevem setup, migrations, importação, limites e smoke operacional.

## Riscos operacionais não bloqueantes

Google OAuth, entrega Resend, binding/migrations D1, isolamento real entre contas e rate limiting dependem da implantação Cloudflare e de segredos externos. Antes de produção deve ser repetido o smoke operacional documentado: cadastro/verificação, Google callback, reset, duas contas, cursor com mais de 100 mudanças, carga do `question_answer_key`, backups e limites em `/api/auth/*` e `/api/sync`. Esses itens não representam defeito P0/P1 no artefato revisado.

## Evidências executadas

```text
npm run typecheck
npm run build
npm test
npm run test:e2e
npm audit --omit=dev --audit-level=high
npm run preview -- --host 127.0.0.1
git diff --check

# Probes Playwright independentes:
# - corrida boot get-session pendente + 3 eventos online + resposta obsoleta
# - focus initial/wrap/Escape/restore em auth e stats
# - Axe base/filtros/auth/stats sem qualquer violação
# - pacote real: scroll interno, snap, dimensões e overflow mobile
# - recálculo SHA-256/tamanho/contagem/unicidade
```

## Aprovação

**MVP aprovado no gate de código e qualidade da onda 5.** Não resta bloqueio P0 ou P1. A liberação em produção deve seguir somente os smoke tests e controles operacionais externos já documentados.
