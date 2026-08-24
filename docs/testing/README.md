# Testes e validação operacional

## Comandos

- `npm test`: unidades e integrações determinísticas em Vitest.
- `npm run test:integration`: ciclo de pacotes e sincronização entre dispositivos com servidor local em memória.
- `npm run test:e2e`: jornada mobile em Chromium contra o build de produção.
- `npm run test:e2e:install`: instala o Chromium gerenciado pelo Playwright na primeira execução.
- `npm run typecheck` e `npm run build`: contratos TypeScript e artefato de produção.

O E2E inicia automaticamente `vite preview` em `127.0.0.1:4173`. Não são necessárias credenciais: as rotas HTTP de autenticação e sincronização são interceptadas por um backend determinístico em memória. IndexedDB, Cache Storage, service worker, adaptadores HTTP e todas as ações de interface continuam sendo os reais do build. A jornada cobre catálogo limpo → download pela UI → estudo anônimo → login por e-mail → falha/reconexão → sincronização → segundo contexto de navegador → logout.

## Cobertura crítica

- pacote: instalação pela UI a partir de catálogo limpo, JSON e assets, capacidade, hash/tamanho, atualização atômica, rollback, reload em modo avião e remoção;
- progresso: persistência da resposta e do deadline, timeout aos três minutos, fila/retry e limpeza no logout sem apagar provas;
- sincronização: login por e-mail mockado no limite HTTP, sessão obrigatória, lote idempotente, reconexão e pull por um segundo contexto/dispositivo;
- interface: viewport mobile, teclado, nomes acessíveis, bloqueio após resposta/timeout, modo avião e auditoria Axe de impactos `serious`/`critical`.

## Checklist manual mobile

1. Instale uma edição em **Filtros**, recarregue e ative o modo avião.
2. Confirme o indicador **Offline**, o enunciado instalado e imagens de apoio.
3. Role dentro de um card longo e depois deslize o feed: apenas o feed deve fazer snap entre questões.
4. Responda uma alternativa e recarregue: seleção, feedback e bloqueio devem permanecer.
5. Em uma questão nova, deixe o timer zerar: nenhuma alternativa deve aceitar interação.
6. Navegue só com teclado e confirme foco visível em botões, selects e alternativas.
7. Ative “reduzir movimento” no sistema e confirme ausência de transições perceptíveis.
8. Restaure a conexão e confirme que a fila sincroniza; em outra sessão/dispositivo, confirme o mesmo progresso.

## Limites do ambiente local

Google OAuth, envio real por Resend e Cloudflare D1 exigem segredos e infraestrutura externa; a suíte valida seus limites e callbacks com doubles determinísticos. Antes de produção, faça um smoke test no ambiente Cloudflare com uma conta de teste e confirme e-mail de verificação, recuperação de senha e isolamento entre usuários.
