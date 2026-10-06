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

## Autenticação e configuração

Zitadel é o provedor de identidade. As páginas de conta ficam na própria
Maratona e as Pages Functions usam as APIs Session e User V2. Better Auth
mantém as sessões no D1 e conclui o fluxo OIDC. Consulte o
[runbook Zitadel](zitadel.md) para provisionamento, vars/secrets, desenvolvimento,
Google, SMTP, políticas, migrações, verificação e rollback.

- `GET /api/login/context`: valida o pedido OIDC para a página de login.
- `POST /api/login/password|totp|google`: autenticação e conclusão do pedido.
- `POST /api/login/register|verify|resend|forgot|reset`: conta e códigos.
- `GET /api/login/google/callback`: conclusão do provedor externo.

Use `npm ci`, `npm run dev:pages` e os scripts `db:migrate:*` já presentes.
Aplique `0001_backend.sql` e `0002_auth_issuer.sql` antes de usar a autenticação.
Segredos pertencem às Functions; nenhum deles é uma variável `VITE_*`.

## Migração e carga do gabarito

Aplique todas as migrações versionadas antes do primeiro acesso. Carregue o
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
- Aplique rate limiting do Cloudflare principalmente em `/api/auth/*`, `/api/login/*` e
  `/api/sync`; o limite contratual de lote não substitui limite por IP/conta.
- Rotacione secrets/PATs por ambiente e monitore falhas de autenticação e SMTP no Zitadel.
- Não registre cookies, tokens, corpo de autenticação nem `event_json` em logs.
- Faça backup do D1 antes de alterações de schema. Remover uma conta apaga seus
  eventos por `ON DELETE CASCADE`, sem afetar os pacotes offline do dispositivo.

## Verificação local

```sh
npm test -- --run tests/backend.test.ts
npm run typecheck
npm run build
```

Faça também um smoke test em `npm run dev:pages` com um Zitadel real:
cadastro e verificação, login Google, reset de senha,
sync repetido com o mesmo UUID, cursor com mais de 100 mudanças e estatísticas.
