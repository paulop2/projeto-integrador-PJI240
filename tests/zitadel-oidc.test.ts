// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthRuntime } from '../functions/_auth-runtime';
import type { BackendEnv } from '../src/server/cloudflare';

const origin = 'https://maratona.example';
const issuer = 'https://auth.example';
const clientId = 'maratona-web';
let worker: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let nonce = '';
let verified = true;
let tokenIssuer = issuer;
let tokenAudience = clientId;
let tokenNonce: string | undefined;
let exchangeBody: URLSearchParams;
let exchangeAuthorization: string | null;
let legacyAccounts: unknown;

function env(): BackendEnv {
  return {
    DB: db,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-auth',
    MARATONA_ZITADEL_ISSUER_URL: issuer,
    MARATONA_ZITADEL_WEB_CLIENT_ID: clientId,
    MARATONA_ZITADEL_WEB_CLIENT_SECRET: 'client-secret',
    MARATONA_ZITADEL_LOGIN_ORG_ID: 'org-id',
    MARATONA_ZITADEL_LOGIN_PAT: 'test-login-pat',
    MARATONA_ZITADEL_MANAGEMENT_PAT: 'test-management-pat',
  };
}

const cookies = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');

async function start() {
  const runtime = createAuthRuntime(env());
  const response = await runtime.handler(new Request(`${origin}/api/auth/sign-in/social`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'zitadel', callbackURL: `${origin}/`, errorCallbackURL: `${origin}/login?error=login_failed`, disableRedirect: true }),
  }));
  expect(response.status).toBe(200);
  const authURL = new URL((await response.json() as { url: string }).url);
  nonce = authURL.searchParams.get('nonce')!;
  return { runtime, authURL, stateCookies: cookies(response) };
}

async function finish() {
  const { runtime, authURL, stateCookies } = await start();
  const response = await runtime.handler(new Request(`${origin}/api/auth/callback/zitadel?code=auth-code&state=${encodeURIComponent(authURL.searchParams.get('state')!)}`, { headers: { cookie: stateCookies } }));
  return { runtime, response };
}

beforeAll(async () => {
  worker = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("ok"); } };', compatibilityDate: '2026-09-08', d1Databases: ['DB'] }));
  db = await worker.getD1Database('DB');
  for (const file of ['0001_backend.sql', '0002_auth_issuer.sql']) {
    if (file === '0002_auth_issuer.sql') {
      await db.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').bind('legacy-user', 'Legacy', 'legacy@example.test', 1, 1, 1).run();
      for (const provider of ['credential', 'google']) await db.prepare('INSERT INTO account (id,accountId,providerId,userId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').bind(provider, 'legacy-subject', provider, 'legacy-user', 1, 1).run();
    }
    const sql = (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).replace(/--[^\n]*/g, '');
    for (const statement of sql.split(';').filter((part) => part.trim())) await db.prepare(statement).run();
  }
  legacyAccounts = (await db.prepare('SELECT issuer, accountId, userId FROM account ORDER BY providerId').all()).results;
  keys = await generateKeyPair('RS256');
}, 20000);

beforeEach(async () => {
  await db.batch(['progress_event', 'session', 'account', 'user', 'verification'].map((table) => db.prepare(`DELETE FROM "${table}"`)));
  verified = true; tokenIssuer = issuer; tokenAudience = clientId; tokenNonce = undefined;
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let data: unknown;
    if (url === `${issuer}/.well-known/openid-configuration`) data = {
      issuer, authorization_endpoint: `${issuer}/oauth/v2/authorize`, token_endpoint: `${issuer}/oauth/v2/token`,
      userinfo_endpoint: `${issuer}/oidc/v1/userinfo`, jwks_uri: `${issuer}/oauth/v2/keys`,
      end_session_endpoint: `${issuer}/oidc/v1/end_session`, id_token_signing_alg_values_supported: ['RS256'],
    };
    else if (url === `${issuer}/oauth/v2/keys`) data = { keys: [jwk] };
    else if (url === `${issuer}/oauth/v2/token`) {
      exchangeBody = new URLSearchParams(String(init?.body));
      exchangeAuthorization = new Headers(init?.headers).get('authorization');
      const idToken = await new SignJWT({ sub: 'zitadel-user', email: 'ana@example.test', name: 'Ana', email_verified: verified, nonce: tokenNonce ?? nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(tokenIssuer).setAudience(tokenAudience).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
      data = { access_token: 'access-token', id_token: idToken, token_type: 'Bearer', expires_in: 300, scope: 'openid profile email' };
    } else throw new Error(`Unexpected upstream URL: ${url}`);
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  });
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await worker?.dispose(); });

describe('Zitadel OIDC and real D1 sessions', () => {
  it('backfills existing credential and Google accounts without changing their owners', () => {
    expect(legacyAccounts).toEqual([
      { issuer: 'local:credential', accountId: 'legacy-subject', userId: 'legacy-user' },
      { issuer: 'local:oauth:google', accountId: 'legacy-subject', userId: 'legacy-user' },
    ]);
  });
  it('requests PKCE, nonce, the configured organization and the kit callback', async () => {
    const { authURL } = await start();
    expect(authURL.origin).toBe(issuer);
    expect(authURL.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/zitadel`);
    expect(authURL.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authURL.searchParams.get('code_challenge')).toBeTruthy();
    expect(authURL.searchParams.get('nonce')).toBeTruthy();
    expect(authURL.searchParams.get('scope')?.split(' ')).toContain('urn:zitadel:iam:org:id:org-id');
  });

  it('exchanges the code with Basic auth, creates an issuer-bound account and authenticates its cookie', async () => {
    const { runtime, response } = await finish();
    expect(response.headers.get('location')).toBe(`${origin}/`);
    expect(exchangeAuthorization).toBe(`Basic ${btoa('maratona-web:client-secret')}`);
    expect(exchangeBody.get('code_verifier')).toBeTruthy();
    expect(exchangeBody.get('grant_type')).toBe('authorization_code');
    const session = await runtime.getSession(new Headers({ cookie: cookies(response) }));
    expect(session?.user).toMatchObject({ email: 'ana@example.test', name: 'Ana' });
    expect(await db.prepare('SELECT issuer, accountId, userId FROM account').first()).toMatchObject({ issuer, accountId: 'zitadel-user', userId: session?.user.id });
    const logout = await runtime.handler(new Request(`${origin}/api/auth/sign-out`, { method: 'POST', headers: { origin, cookie: cookies(response), 'content-type': 'application/json' }, body: JSON.stringify({ callbackURL: `${origin}/`, disableRedirect: true }) }));
    const logoutURL = new URL((await logout.json() as { url: string }).url);
    expect(logoutURL.origin).toBe(issuer);
    expect(logoutURL.searchParams.get('post_logout_redirect_uri')).toBe(`${origin}/`);
    expect(await runtime.getSession(new Headers({ cookie: cookies(response) }))).toBeNull();
  });

  it.each(['issuer', 'audience', 'nonce', 'unverified-email'] as const)('rejects invalid %s without creating an authenticated session', async (claim) => {
    if (claim === 'issuer') tokenIssuer = 'https://attacker.example';
    if (claim === 'audience') tokenAudience = 'other-app';
    if (claim === 'nonce') tokenNonce = 'wrong-nonce';
    if (claim === 'unverified-email') verified = false;
    const { runtime, response } = await finish();
    expect(response.headers.get('location')).toContain('/login?');
    expect(await runtime.getSession(new Headers({ cookie: cookies(response) }))).toBeNull();
    expect(await db.prepare('SELECT count(*) AS n FROM session').first()).toEqual({ n: 0 });
  });

  it('preserves the local user id when linking a verified existing account', async () => {
    await db.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').bind('existing-user', 'Ana', 'ana@example.test', 1, Date.now(), Date.now()).run();
    const { runtime, response } = await finish();
    expect((await runtime.getSession(new Headers({ cookie: cookies(response) })))?.user.id).toBe('existing-user');
  });

  it('reads an existing D1 session without depending on issuer discovery', async () => {
    const { response } = await finish();
    vi.mocked(fetch).mockRejectedValue(new Error('Identity provider temporarily offline'));
    const runtime = createAuthRuntime(env());
    const headers = new Headers({ cookie: cookies(response) });
    expect((await runtime.getSession(headers))?.user.email).toBe('ana@example.test');
    const probe = await runtime.handler(new Request(`${origin}/api/auth/get-session`, { headers }));
    expect(probe.status).toBe(200);
    expect(await probe.json()).toMatchObject({ user: { email: 'ana@example.test' } });
  });

  it('revokes the local session even when provider discovery is offline at logout', async () => {
    const { response } = await finish();
    vi.mocked(fetch).mockRejectedValue(new Error('Identity provider temporarily offline'));
    const runtime = createAuthRuntime(env());
    const cookie = cookies(response);
    const logout = await runtime.handler(new Request(`${origin}/api/auth/sign-out`, {
      method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ callbackURL: `${origin}/`, disableRedirect: true }),
    }));
    expect(logout.status).toBe(200);
    expect(await runtime.getSession(new Headers({ cookie }))).toBeNull();
    expect(await db.prepare('SELECT count(*) AS n FROM session').first()).toEqual({ n: 0 });
  });

  it('rejects a callback that lacks the browser state binding', async () => {
    const { runtime, authURL } = await start();
    const response = await runtime.handler(new Request(`${origin}/api/auth/callback/zitadel?code=auth-code&state=${authURL.searchParams.get('state')}`));
    expect(response.headers.get('location')).toContain('error=');
    expect(await db.prepare('SELECT count(*) AS n FROM session').first()).toEqual({ n: 0 });
  });
});
