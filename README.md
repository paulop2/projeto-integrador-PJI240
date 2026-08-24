# Maratona — plataforma offline de questões

PWA React mobile-first para estudar questões do ENEM mesmo sem conexão. O MVP inclui pacotes de prova validados por SHA-256, progresso local, timer regressivo de três minutos, estatísticas e sincronização opcional com backend Cloudflare.

## Desenvolvimento

```sh
npm install
npm run dev
```

Para gerar o build de produção:

```sh
npm run typecheck
npm run build
```

O catálogo fica em `public/data/manifest.json`. Consulte `docs/architecture/README.md` para contratos e limites dos módulos, `docs/backend/README.md` para D1/Better Auth/Resend e `docs/testing/README.md` para a matriz de testes e checklist manual.

## Testes

```sh
npm test
npm run test:integration
npm run test:e2e:install # somente na primeira execução
npm run test:e2e
```

Os testes de navegador usam o build de produção e um viewport mobile. Integrações de login e sincronização usam fakes locais, portanto a suíte padrão não depende de credenciais Google, Resend ou Cloudflare.
