# Maratona — plataforma offline de questões

PWA React mobile-first para estudar questões do ENEM mesmo sem conexão. O MVP inclui pacotes de prova validados por SHA-256, progresso local, timer regressivo de três minutos, estatísticas e sincronização opcional com backend Cloudflare.

## O MVP

O Maratona apresenta questões em um feed vertical pensado para celular. Cada questão ocupa uma tela, possui um timer regressivo de três minutos e bloqueia as alternativas depois da resposta ou do fim do tempo. O estudante pode filtrar o conteúdo, acompanhar acertos, erros, timeouts, tempo médio e desempenho por matéria ou prova.

O uso não exige conta. As provas escolhidas pelo estudante são baixadas como pacotes e armazenadas no dispositivo, permitindo responder e consultar o progresso sem conexão. Quando há uma conta autenticada, os eventos criados offline são enviados em lotes ao recuperar a internet, sem duplicar respostas.

O pacote inicial contém 177 questões reais do ENEM 2023 obtidas da API oficial do enem.dev. O catálogo, os pacotes e o modelo de progresso foram preparados para receber outras edições, vestibulares e concursos sem redesenhar a aplicação.

## Por que Cloudflare D1?

O Cloudflare D1 foi escolhido porque se integra diretamente ao Cloudflare Pages e às Pages Functions, evitando a manutenção de um servidor separado. Ele oferece um banco SQL baseado em SQLite adequado para armazenar usuários, sessões, eventos de estudo e estatísticas com pouca infraestrutura e baixo custo para um MVP.

Essa escolha também combina com a arquitetura offline-first: cada interação é registrada primeiro no dispositivo, enquanto o D1 é usado somente para autenticação, sincronização e consolidação entre dispositivos. O backend deriva o usuário da sessão, processa eventos de forma idempotente e recalcula o resultado com seu próprio gabarito.

O D1 não possui todos os recursos de um PostgreSQL e pode deixar de ser a melhor opção caso o projeto alcance grande volume ou exija consultas analíticas complexas. Por isso, o acesso ao banco está isolado em repositórios, reduzindo o impacto de uma possível migração futura.

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

## Próximos passos

Antes de disponibilizar o MVP publicamente:

1. Criar os ambientes de preview e produção no Cloudflare Pages.
2. Criar o banco D1, aplicar as migrações e configurar os bindings.
3. Configurar as credenciais do Google OAuth, Better Auth e Resend.
4. Executar smoke tests reais de cadastro, verificação de e-mail, recuperação de senha e sincronização entre dispositivos.
5. Configurar domínio, monitoramento de erros, métricas e política de privacidade.

Depois da validação do MVP com estudantes:

1. Importar novas edições do ENEM e adicionar Fuvest, Unicamp, ITA, IME, concursos e olimpíadas.
2. Incluir questões de múltipla escolha, certo/errado, numéricas e discursivas.
3. Adicionar explicações, resoluções comentadas e repetição espaçada.
4. Melhorar a descoberta e o gerenciamento dos pacotes offline.
5. Avaliar desempenho, custo e necessidade de migrar o backend conforme a base de usuários crescer.
