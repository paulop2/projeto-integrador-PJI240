# Autenticação da Maratona com Zitadel

A Maratona continua no Cloudflare Pages, com Pages Functions e D1. O Zitadel
é o provedor de identidade, em uma instância externa provisionada pelo
`infra/zitadel`. O Docker Compose do kit roda no VPS/Coolify ou localmente;
não roda dentro das Functions.

As páginas de login, cadastro, confirmação de e-mail, recuperação de senha e
código TOTP ficam em `/login`, com o tema e os componentes da Maratona. Google
abre somente a autorização do próprio Google. Senhas são verificadas pelo
Zitadel e não são armazenadas no D1.

## Fluxo

1. O estudante inicia o acesso na área Conta. O Better Auth cria o estado OIDC,
   o nonce e o desafio PKCE e abre o endpoint de autorização do Zitadel.
2. O cliente OIDC do kit configura `/login` como a base da Login V2. O Zitadel
   acrescenta `/login` e retorna à Maratona em `/login/login?authRequest=...`.
   A aplicação aceita esse caminho e `/login`, inclusive com barra final,
   usando a mesma tela e as mesmas proteções de cache e referrer. Links de
   verificação e recuperação continuam usando `/login`.
3. As Functions validam o cliente e o callback desse pedido antes de usar as
   APIs Session e User V2. O navegador nunca recebe os PATs ou tokens da sessão
   temporária do Zitadel.
4. Após validar identidade, e-mail, política e fatores de autenticação, a
   Function finaliza o pedido OIDC e navega para `/api/auth/callback/zitadel`.
5. Better Auth valida o estado, PKCE e o ID token, incluindo assinatura,
   emissor, audiência e nonce. Cria a sessão de aplicação no D1.
6. `/api/sync` e `/api/me/stats` identificam o usuário pela sessão local. Ler
   essa sessão não consulta a descoberta OIDC do Zitadel.

Cookies temporários de Google/TOTP são criptografados, `HttpOnly`, `SameSite=Lax`,
`Secure` em HTTPS e expiram em dez minutos. Não dependem de memória de processo.
E-mails levam a `/login?mode=verify|reset&userId=...&code=...`; a confirmação e a
redefinição funcionam mesmo se o pedido OIDC original expirou. O estudante inicia
um novo acesso depois de concluir o link.

O logout remove a sessão de aplicação e limpa o progresso local da conta antes
de navegar para o encerramento da sessão no Zitadel. Pacotes de prova baixados
continuam disponíveis.
Se a descoberta do Zitadel estiver indisponível, o logout ainda revoga a sessão
local; o encerramento no provedor precisa aguardar sua disponibilidade.

Uma redefinição de senha concluída no Zitadel revoga também as sessões locais
daquela identidade no D1. Uma sessão temporária que validou a senha anterior
à troca não pode concluir a autenticação.

## Kit e manifesto

O kit (`eriksonssilva/zitadel-kit`) é privado e não faz parte deste repositório:
a integração Git do Cloudflare Pages não consegue clonar submódulos privados.
Quem opera o Zitadel clona o kit em `infra/zitadel`, caminho ignorado pelo Git e
usado por padrão no `Makefile`. A versão validada é o commit
`01b26c2c619a033ff33f1bdad28a281853dc3cf8`. `zitadel.manifest.json` declara um cliente confidencial `web`,
com authorization code, PKCE e `client_secret_basic`, e dois usuários de serviço:

| Chave | Papel | Finalidade |
| --- | --- | --- |
| `login` | `IAM_LOGIN_CLIENT` | Sessões, políticas e conclusão OIDC |
| `management` | `ORG_USER_MANAGER` | Cadastro, e-mail e recuperação na organização |

O manifesto usa `MARATONA_ZITADEL_` como prefixo. Não altere o código do kit
para configurar esta aplicação. A compilação do frontend e das Functions não
depende do kit; ele só é necessário para os alvos `make zitadel-*`.

```sh
git clone git@github.com:eriksonssilva/zitadel-kit.git infra/zitadel
git -C infra/zitadel checkout 01b26c2c619a033ff33f1bdad28a281853dc3cf8
make zitadel-check
```

Para manter o kit em outro diretório, passe o caminho em cada comando, por
exemplo `make zitadel-check ZITADEL_KIT=../zitadel-kit`.

## Desenvolvimento com Pages Functions

Use Node.js 22 ou mais recente e `npm ci`. O Vite isolado serve o frontend; para
usar o backend real, utilize `npm run dev:pages` em `http://localhost:8788`.

```sh
make zitadel-local-env ZITADEL_ADMIN_EMAIL=admin@example.com
make zitadel-local-up
make zitadel-local-bootstrap
cp .env.example .dev.vars
npm run db:migrate:local
npm run dev:pages
```

Antes de iniciar Pages, preencha `.dev.vars` com os valores locais do
`app.env` produzido pelo operador. O arquivo fica em
`~/.config/zitadel-kit/pj240-zitadel-local/app.env`, fora do repositório.
Mantenha `BETTER_AUTH_URL=http://localhost:8788` e o mesmo `APP_LOCAL_ORIGIN`
no bootstrap. O issuer local padrão é `http://localhost:8080`.

Gere `BETTER_AUTH_SECRET` com pelo menos 32 caracteres aleatórios e mantenha-o
estável. Ele assina sessões Better Auth e criptografa os cookies temporários.
Não use os valores de exemplo em produção.

## Produção e preview

1. Escolha o hostname HTTPS do Zitadel e publique o stack do kit no VPS/Coolify,
   seguindo `infra/zitadel/docs/runbook.md`.
2. Gere a configuração ignorada pelo Git e execute o operador para a origem
   exata do Pages:

```sh
make zitadel-env ZITADEL_AUTH_DOMAIN=auth.seu-dominio.com ZITADEL_ADMIN_EMAIL=admin@seu-dominio.com
ZITADEL_KIT_SSH_HOST=alias-do-vps make zitadel-bootstrap
```

`APP_ORIGIN` é `https://pj240.pages.dev` por padrão. Para preview, use uma
instância/estado separado e `APP_ORIGIN=https://preview.pj240.pages.dev`.
Não reutilize o mesmo cliente/estado para reconciliar preview e produção: o kit
substitui os redirect URIs que possui. A origem de preview deve corresponder
à implantação realmente publicada nesse hostname; URLs de outros branches não
são autorizadas automaticamente.

3. Configure as vars/secrets de Pages Functions com os valores daquele
   ambiente. As chaves do `app.env` já têm os nomes usados pela aplicação:

| Binding | Onde obter |
| --- | --- |
| `DB` | Binding D1 já configurado no Wrangler |
| `BETTER_AUTH_URL` | Origem exata de Pages, já versionada por ambiente |
| `BETTER_AUTH_SECRET` | Segredo aleatório próprio da aplicação |
| `MARATONA_ZITADEL_ISSUER_URL` | `app.env` do kit |
| `MARATONA_ZITADEL_WEB_CLIENT_ID` | `app.env` do kit |
| `MARATONA_ZITADEL_WEB_CLIENT_SECRET` | `app.env` do kit |
| `MARATONA_ZITADEL_LOGIN_ORG_ID` | `app.env` do kit |
| `MARATONA_ZITADEL_LOGIN_PAT` | `app.env` do kit |
| `MARATONA_ZITADEL_MANAGEMENT_PAT` | `app.env` do kit |
| `MARATONA_ZITADEL_GOOGLE_IDP_ID` | Opcional, `app.env` do kit |

Mantenha client secret, PATs e `BETTER_AUTH_SECRET` em secrets do Pages. Não use
`VITE_*`, não copie o stack env para Pages e não publique PATs administrativos.
`app.env` também contém outros outputs operacionais que a aplicação não usa.
`.deploy/`, `.dev.vars` e `.env*` estão ignorados pelo Git.

4. Configure SMTP no Zitadel. A aplicação não chama o Resend diretamente.
   Se usar Resend, configure-o como SMTP da instância, conforme o runbook.
   Ative registro e login por senha nas políticas da organização. As Functions
   respeitam essas políticas e recusam métodos desativados.
5. Para Google, use `https://<hostname-do-zitadel>/idps/callback` no Google Cloud.
   Passe as credenciais Google ao operador, como descrito no kit, e configure o
   provedor como método ativo da política de login. A criação automática pelo
   provedor precisa estar autorizada para cadastrar novos estudantes.
6. Faça backup do D1, aplique as migrações no ambiente correto e publique o
   código e o schema juntos. Não é necessário mover o banco de progresso:

```sh
npm run db:migrate:preview
# ou, em produção:
npm run db:migrate:remote
```

Aplicar migrações remotas e publicar são operações do ambiente alvo. Este
trabalho de implementação não executa essas operações.

## Contas existentes e schema

A versão usada pelo código é Better Auth **1.7.1**, fixada também no lockfile.
Ela exige `account.issuer`. `0002_auth_issuer.sql` adiciona a coluna, preenche os
namespaces das contas antigas Google/senha e cria o índice de identidade. A
migração mantém `user.id` e os relacionamentos de progresso.

Na primeira entrada via Zitadel, um e-mail verificado pode vincular-se ao
usuário local com o mesmo e-mail, se a conta local também estiver verificada.
Isso preserva o progresso remoto. Contas antigas sem e-mail verificado exigem
reconciliação administrativa; a aplicação não força vínculos inseguros.
As senhas antigas do Better Auth não são copiadas para o Zitadel. O estudante
precisa ter/criar sua identidade no provedor.

Não atualize Better Auth ignorando a revisão de schema. A documentação atual
registra mudanças na coluna `issuer` entre versões 1.7.x. Confira o guia e a
versão efetivamente instalada antes de preparar outra migração.

## Segurança e políticas

As Functions limitam o corpo de login a 16 KiB, validam campos no servidor e
exigem origem exata em mutações. User APIs só operam sobre humanos pertencentes
à organização configurada. Redirecionamentos finais só apontam ao callback
registrado da Maratona. Fluxos Google são vinculados a um cookie criptografado e
aceitam apenas o Google configurado.

TOTP está disponível na tela da Maratona para contas que já possuem esse fator.
MFA obrigatória sem fator configurado e fatores ainda não suportados, como
U2F/SMS, são recusados sem concluir a autenticação OIDC. Configure os fatores permitidos
da organização conforme os métodos suportados; não desative MFA para contornar
um erro de login. Enrollment de fatores adicionais não faz parte desta tela.

Configure rate limiting no Cloudflare para `/api/auth/*` e `/api/login/*`,
principalmente senha, cadastro, códigos e recuperação. Os limites de payload não
substituem limites por IP/conta. O limite interno de Better Auth usa armazenamento
de processo; ele não oferece uma quota compartilhada entre Functions.

Não registre corpos de login, cookies, tokens ou URLs de confirmação em logs.
A página `/login` usa `Referrer-Policy: no-referrer`; o service worker não
armazena as respostas dessas navegações nem de `/api/*`.

## Verificação

```sh
make zitadel-check
npm run typecheck
npm run build
npm run build:functions
npm test
npm run test:e2e -- --grep 'sincroniza progresso anônimo'
```

Os testes OIDC usam o Better Auth real, D1 em Miniflare e respostas de um issuer
controlado. Verificam PKCE/Basic auth, callback, assinatura/issuer/audiência/nonce,
e-mail verificado, cookies, logout, sessão local durante indisponibilidade do
issuer e preservação do usuário local. Os testes Session/User usam doubles
HTTP para verificar o contrato e as barreiras de autorização. Nenhum desses
resultados demonstra uma instância externa real.

Antes de disponibilizar o ambiente, execute o smoke com o Zitadel implantado:
cadastro, e-mail de verificação, senha válida/inválida, recuperação, Google novo e
existente, TOTP, callback expirado, logout, sync e isolamento entre duas contas.
Confira que nenhum passo apresenta uma página de login padrão do Zitadel.

Para rollback, preserve backup D1 e os secrets anteriores. Remover as novas vars
não reativa senha/Google antigos: é necessário restaurar a configuração e o
frontend anteriores. Mantenha a coluna adicional ao reverter para uma versão que
não a utiliza; não apague contas ou progresso como parte de um rollback.

## Referências

- [Session API e validação de políticas](https://zitadel.com/docs/guides/integrate/login-ui/session-validation).
- [Login próprio com senha](https://zitadel.com/docs/guides/integrate/login-ui/username-password).
- [OIDC e callback](https://zitadel.com/docs/reference/api/oidc/zitadel.oidc.v2.OIDCService.CreateCallback).
- [Generic OAuth do Better Auth](https://better-auth.com/docs/plugins/generic-oauth).
- [Mudanças de schema em Better Auth 1.7](https://better-auth.com/docs/guides/1-7-upgrade-guide).
