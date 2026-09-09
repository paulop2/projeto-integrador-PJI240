# Cloudflare Pages — Maratona

O frontend, as Pages Functions e o banco D1 são publicados no projeto
`pj240`. A origem pública planejada é
`https://maratona.pvsouza.com`.

## Recursos

- Pages: `pj240`, branch de produção `main`.
- D1 de produção: `maratona-production`, binding `DB`.
- D1 de preview: `maratona-preview`, binding `DB` no ambiente de preview.
- Domínio: `maratona.pvsouza.com`, associado pelo fluxo de custom domain do
  Pages; o CNAME correspondente ainda precisa ser criado no DNS de `pvsouza.com`.

Os três recursos foram criados em 08/09/2026, e os bancos ficaram na região
ENAM. O arquivo `wrangler.jsonc` é a fonte de verdade da configuração não
secreta e contém seus IDs e bindings.

### Estado em 08/09/2026

| Item | Estado |
| --- | --- |
| Projeto Pages `pj240` | Criado, ainda sem deployment |
| D1 `maratona-production` | Criado, migration `0001_backend.sql` aplicada |
| D1 `maratona-preview` | Criado, migration `0001_backend.sql` aplicada |
| `BETTER_AUTH_SECRET` de produção | Configurado como secret criptografado |
| `maratona.pvsouza.com` | Associado ao Pages; aguarda o CNAME |
| Google OAuth e Resend | Aguardam credenciais e remetente verificado |
| `question_answer_key` | Aguarda carga das respostas antes do deploy |

## Desenvolvimento local no Windows/PowerShell

```powershell
Copy-Item .dev.vars.example .dev.vars
# Preencha .dev.vars somente na sua máquina.
npm ci
npm run build
npm run db:migrate:local
npm run dev:pages
```

O Git ignora `.dev.vars` e `.wrangler/`. Nunca grave segredos no repositório.

## Recriação da configuração remota

Os comandos abaixo são referência para recriar os recursos. Não os execute no
ambiente atual sem antes conferir a lista do Pages e do D1, para evitar
duplicatas.

```powershell
npx wrangler login
npx wrangler pages project create pj240 --production-branch main --compatibility-date 2026-09-08 --compatibility-flag nodejs_compat
npx wrangler d1 create maratona-production
npx wrangler d1 create maratona-preview
npm run db:migrate:remote
npm run db:migrate:preview
```

Configure os secrets abaixo no Pages, separadamente para preview e produção:

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`

`BETTER_AUTH_URL` fica versionado como
`https://maratona.pvsouza.com`. O callback autorizado no Google deve usar essa
origem e a rota indicada pelo Better Auth.

## Publicação e domínio

Uma publicação é uma ação separada da configuração dos recursos:

```powershell
npm run deploy:pages
```

O hostname já está associado ao projeto. No DNS de `pvsouza.com`, crie o CNAME
`maratona` apontando para `pj240.pages.dev`. A credencial OAuth do
Wrangler não possui permissão para editar DNS, portanto esse registro ainda não
foi criado. Não remova a associação do hostname no Pages: um CNAME isolado, sem
essa associação, resulta em erro 522.

Antes de considerar produção pronta, aplique as migrations, carregue
`question_answer_key` a partir do pacote publicado e execute os smokes reais de
cadastro, verificação de e-mail, reset de senha, Google OAuth, sincronização e
isolamento entre contas.
