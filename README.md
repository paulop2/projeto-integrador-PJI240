# Maratona — plataforma offline de questões

PWA React mobile-first para estudar questões do ENEM mesmo sem conexão. O MVP inclui pacotes de prova validados por SHA-256, progresso local, timer regressivo de três minutos, estatísticas e sincronização opcional com backend Cloudflare.

## O MVP

O Maratona é uma plataforma de estudos para o ENEM que funciona como um feed de vídeos curtos: em vez de vídeos, cada tela apresenta uma questão. O objetivo é tornar o estudo mais simples, rápido e acessível pelo celular, inclusive sem internet.

### Como funciona

O estudante entra na plataforma, baixa uma edição da prova — atualmente o ENEM 2023, com 177 questões reais — e começa a responder.

Cada questão:

- Ocupa uma tela do feed.
- Tem um limite de três minutos.
- Bloqueia as alternativas após a resposta ou quando o tempo acaba.
- Informa se a resposta está certa ou errada.
- Permite avançar deslizando para a próxima questão.

O usuário também pode filtrar as questões por matéria e prova.

### Funcionamento offline

Um dos principais diferenciais é o suporte offline. O estudante escolhe qual prova deseja baixar e as questões e imagens ficam armazenadas no dispositivo, podendo ser acessadas sem conexão.

A plataforma também:

- Verifica se existe espaço disponível.
- Identifica atualizações dos pacotes.
- Permite remover provas baixadas.
- Preserva respostas e timers após recarregar a página.

### Conta e sincronização

Criar uma conta é opcional. O estudante pode usar o aplicativo anonimamente.

Com uma conta, ele pode:

- Entrar com Google ou e-mail e senha.
- Verificar seu e-mail e recuperar a senha.
- Sincronizar o progresso entre dispositivos.
- Continuar estudando offline e sincronizar quando a conexão voltar.

As respostas são registradas primeiro no aparelho. Quando a internet retorna, o aplicativo envia os eventos pendentes em lotes, sem duplicá-los. O servidor identifica o usuário pela sessão e recalcula os resultados usando seu próprio gabarito.

### Estatísticas

A plataforma acompanha:

- Questões visualizadas e respondidas.
- Acertos, erros e timeouts.
- Taxa de acerto.
- Tempo médio de resposta.
- Desempenho por matéria e prova.
- Sequência de dias estudados.

### Tecnologias

O frontend foi desenvolvido como uma PWA usando React e TypeScript. A arquitetura utiliza:

- IndexedDB para progresso, sessões e fila de sincronização.
- Cache Storage para provas e imagens offline.
- Cloudflare Pages e Pages Functions para hospedagem e backend.
- Cloudflare D1 como banco de dados.
- Better Auth para autenticação.
- Resend para verificação e recuperação de senha.
- API oficial do enem.dev como fonte das questões.

### Escopo atual

O MVP implementa questões de escolha única do ENEM. O catálogo, os pacotes e o modelo de progresso foram preparados para receber futuramente:

- Fuvest, Unicamp, ITA e IME.
- Concursos e olimpíadas.
- Questões discursivas, numéricas, de múltipla escolha e certo ou errado.
- Explicações e resoluções.
- Repetição espaçada.

### Resumo para apresentar

> Nosso projeto é uma plataforma mobile de questões no formato de feed. O estudante baixa uma prova, responde questões com um timer de três minutos e acompanha seu desempenho. O aplicativo funciona offline e sincroniza o progresso entre dispositivos quando o usuário possui uma conta. Começamos com 177 questões reais do ENEM 2023, mas a arquitetura permite incluir outros vestibulares e concursos no futuro.

### Sugestão de demonstração

1. Mostrar as quatro questões demonstrativas.
2. Abrir os filtros e baixar o ENEM 2023.
3. Mostrar o feed com 177 questões.
4. Responder uma questão e observar o feedback e o timer.
5. Abrir as estatísticas.
6. Desligar a internet e mostrar que o feed continua funcionando.

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
