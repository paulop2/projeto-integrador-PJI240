# Backend Cloudflare do MVP

O backend usa Pages Functions, D1 e Better Auth. A identidade de `/api/sync` e
`/api/me/stats` vem exclusivamente da sessão Better Auth; campos extras como
`userId` e `correct` enviados pelo cliente são descartados pela validação e nunca
participam das gravações.

## Rotas

- `GET|POST /api/auth/*`: handler nativo do Better Auth.
- `POST /api/sync`: recebe `SyncRequest`, com no máximo 100 eventos. Valida todas
  as questões antes de gravar, calcula `correct`/`incorrect` pelo
  `question_answer_key`, deduplica `(user_id, event_id)` e vistas por
  `(user_id, question_id, local_day)`, e devolve até 100 mudanças por cursor.
- `GET /api/me/stats?examId=&subjectId=`: retorna totais e agrupamentos do contrato.

Respostas de erro usam `{ "error": { "code", "message" } }`. Os endpoints de
progresso retornam `401` sem cookie de sessão, `400` para contrato/cursor inválido
e `422` se uma questão ainda não existe no gabarito do servidor.

## Dependências e scripts a adicionar

Os manifests ficaram intocados por restrição da onda. Antes de executar/deployar
as Functions, adicione:

```sh
npm install better-auth@^1.5.0
npm install --save-dev wrangler@^4
```

Scripts recomendados para `package.json`:

```json
{
  "test:backend": "vitest run tests/backend.test.ts",
  "dev:pages": "wrangler pages dev dist --d1 DB=questions-local",
  "db:migrate:local": "wrangler d1 migrations apply questions --local",
  "db:migrate:remote": "wrangler d1 migrations apply questions --remote"
}
```

Better Auth 1.5 ou posterior aceita o binding D1 diretamente. Ao atualizar uma
versão principal do Better Auth, gere o schema da versão fixada com
`npx auth@latest generate` e compare-o com `migrations/0001_backend.sql` antes de
publicar. Referências: [D1 no Better Auth](https://better-auth.com/blog/1-5),
[modelo de banco](https://better-auth.com/docs/concepts/database) e
[bindings D1 em Pages](https://developers.cloudflare.com/pages/functions/bindings/).

## Bindings e segredos

Crie um binding D1 chamado `DB`. Configure os valores abaixo como secrets/vars do
Pages; não grave valores reais no repositório.

| Nome | Uso |
| --- | --- |
| `BETTER_AUTH_SECRET` | segredo aleatório com pelo menos 32 caracteres |
| `BETTER_AUTH_URL` | origem pública, por exemplo `https://app.exemplo.br` |
| `GOOGLE_CLIENT_ID` | cliente OAuth Google |
| `GOOGLE_CLIENT_SECRET` | segredo OAuth Google |
| `RESEND_API_KEY` | token do endpoint `POST /emails` do Resend |
| `RESEND_FROM` | remetente verificado, por exemplo `Questões <login@dominio>` |

No Google Cloud, autorize o callback apresentado pelo Better Auth sob
`BETTER_AUTH_URL/api/auth`. O envio pelo Resend usa HTTPS diretamente, portanto
não precisa do pacote `resend`. Verificação é enviada no cadastro e e-mail/senha
exige endereço verificado; recuperação usa o callback de reset do Better Auth.

## Migração e carga do gabarito

Execute `migrations/0001_backend.sql` antes do primeiro acesso. Carregue o
gabarito a partir do mesmo pacote validado usado na publicação, em ambiente de
build/administrativo — nunca por uma rota pública:

```sql
INSERT INTO question_answer_key
  (question_id, exam_id, edition_id, subject_id, kind, correct_option_id, updated_at)
VALUES (?, ?, ?, ?, 'single-choice', ?, ?)
ON CONFLICT(question_id) DO UPDATE SET
  exam_id = excluded.exam_id,
  edition_id = excluded.edition_id,
  subject_id = excluded.subject_id,
  kind = excluded.kind,
  correct_option_id = excluded.correct_option_id,
  updated_at = excluded.updated_at;
```

O endpoint de sync não devolve nem consulta o gabarito do cliente. A FK impede
eventos para questões ausentes, e a checagem anterior ao batch transforma essa
situação em erro controlado.

## Operação e segurança

- Use apenas HTTPS e mantenha `BETTER_AUTH_URL` igual à origem implantada.
- Aplique rate limiting do Cloudflare principalmente em `/api/auth/*` e
  `/api/sync`; o limite contratual de lote não substitui limite por IP/conta.
- Rotacione Google/Resend/Auth secrets pelo painel e monitore falhas do Resend.
- Não registre cookies, tokens, corpo de autenticação nem `event_json` em logs.
- Faça backup do D1 antes de alterações de schema. Remover uma conta apaga seus
  eventos por `ON DELETE CASCADE`, sem afetar os pacotes offline do dispositivo.

## Verificação local

```sh
npm test -- --run tests/backend.test.ts
npm run typecheck
npm run build
```

Depois de instalar Better Auth/Wrangler, faça também um smoke test em
`wrangler pages dev`: cadastro e verificação, login Google, reset de senha,
sync repetido com o mesmo UUID, cursor com mais de 100 mudanças e estatísticas.
