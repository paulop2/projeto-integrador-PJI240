import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendEnv } from '../src/server/cloudflare';
import { handleZitadelLogin } from '../src/server/zitadel-login';

const origin = 'https://maratona.example';
const callback = `${origin}/api/auth/callback/zitadel`;
const dbRun = vi.fn(async () => ({ success: true }));
const dbBind = vi.fn(() => ({ run: dbRun }));
const dbPrepare = vi.fn(() => ({ bind: dbBind }));
const env = {
  DB: { prepare: dbPrepare },
  BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: 'a'.repeat(40),
  MARATONA_ZITADEL_ISSUER_URL: 'https://identity.example', MARATONA_ZITADEL_WEB_CLIENT_ID: 'web-client',
  MARATONA_ZITADEL_LOGIN_ORG_ID: 'org', MARATONA_ZITADEL_LOGIN_PAT: 'login-pat',
  MARATONA_ZITADEL_MANAGEMENT_PAT: 'management-pat', MARATONA_ZITADEL_GOOGLE_IDP_ID: 'google-idp',
} as unknown as BackendEnv;
const user = { userId: 'user', details: { resourceOwner: 'org' }, state: 'USER_STATE_ACTIVE', human: { email: { email: 'a@example.com', isVerified: true } } };
const fetchMock = vi.fn<typeof fetch>();
function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/login/${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
function reply(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }
function upstream(overrides: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (Object.hasOwn(overrides, url.pathname)) return reply(overrides[url.pathname]);
    if (url.pathname === '/v2/oidc/auth_requests/auth') return init?.method === 'POST' ? reply({ callbackUrl: `${callback}?code=ok&state=bound` }) : reply({ authRequest: { clientId: 'web-client', redirectUri: callback } });
    if (url.pathname === '/v2/users') return reply({ result: [user] });
    if (url.pathname === '/v2/users/user') return reply({ user });
    if (url.pathname === '/v2/settings/login') return reply({ settings: { allowUsernamePassword: true, allowRegister: true, allowExternalIdp: true, secondFactors: ['SECOND_FACTOR_TYPE_OTP'] } });
    if (url.pathname.endsWith('/authentication_methods')) return reply({ authMethodTypes: ['AUTHENTICATION_METHOD_TYPE_PASSWORD'] });
    if (url.pathname === '/v2/sessions') return reply({ sessionId: 'session', sessionToken: 'secret-session' });
    if (url.pathname === '/v2/sessions/session') return reply({ session: { factors: { user: { id: 'user', organizationId: 'org', verifiedAt: new Date().toISOString() }, password: { verifiedAt: new Date().toISOString() } } } });
    return reply({ userId: 'new-user' });
  });
}
function calls(path: string) { return fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname === path); }

describe('Maratona custom Zitadel login boundary', () => {
  beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); dbPrepare.mockClear(); dbBind.mockClear(); dbRun.mockClear(); upstream(); });
  it('uses only a scoped human account and completes the exact OIDC callback', async () => {
    const response = await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `${callback}?code=ok&state=bound` });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(String(calls('/v2/sessions')[0]?.[1]?.body))).toMatchObject({ checks: { user: { userId: 'user' }, password: { password: 'correct' } }, lifetime: '600s' });
    expect(calls('/v2/oidc/auth_requests/auth').at(-1)?.[1]?.headers).toMatchObject({ authorization: 'Bearer login-pat' });
    expect(JSON.parse(String(calls('/v2/users')[0]?.[1]?.body)).queries).toContainEqual({ organizationIdQuery: { organizationId: 'org' } });
  });
  it.each([{ clientId: 'other', redirectUri: callback }, { clientId: 'web-client', redirectUri: `${callback}/bad` }])('rejects an unrelated authorization request before user APIs', async (authRequest) => {
    upstream({ '/v2/oidc/auth_requests/auth': { authRequest } });
    const response = await handleZitadelLogin(request('register', { authRequest: 'auth', name: 'Ana Silva', email: 'a@example.com', password: 'Strong1!' }), env);
    expect(response.status).toBe(400);
    expect(calls('/v2/users/human')).toHaveLength(0);
  });
  it('rejects cross origin requests and oversized bodies without upstream calls', async () => {
    expect((await handleZitadelLogin(request('password', {}, { origin: 'https://other.example' }), env)).status).toBe(403);
    expect((await handleZitadelLogin(request('password', { password: 'x'.repeat(17000) }), env)).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('registers an unverified account with a code link entirely inside Maratona', async () => {
    const response = await handleZitadelLogin(request('register', { authRequest: 'auth', name: 'Ana Silva', email: 'a@example.com', password: 'Strong1!' }), env);
    expect(await response.json()).toEqual({ success: true });
    const payload = JSON.parse(String(calls('/v2/users/human')[0]?.[1]?.body));
    expect(payload).toMatchObject({ organization: { orgId: 'org' }, email: { email: 'a@example.com', sendCode: { urlTemplate: `${origin}/login?mode=verify&userId={{.UserID}}&code={{.Code}}&authRequest=auth` } } });
    expect(payload.email.isVerified).toBeUndefined();
    expect(calls('/v2/users/human')[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer management-pat' });
  });
  it('requires a verification code and checks user org before changing a password', async () => {
    const response = await handleZitadelLogin(request('reset', { userId: 'user', code: 'ABC123', password: 'Strong1!' }), env);
    expect(await response.json()).toEqual({ success: true });
    expect(dbPrepare).toHaveBeenCalledWith('DELETE FROM session WHERE userId IN (SELECT userId FROM account WHERE providerId = ? AND issuer = ? AND accountId = ?)');
    expect(dbBind).toHaveBeenCalledWith('zitadel', 'https://identity.example', 'user');
    expect(JSON.parse(String(calls('/v2/users/user/password')[0]?.[1]?.body))).toEqual({ newPassword: { password: 'Strong1!', changeRequired: false }, verificationCode: 'ABC123' });
    upstream({ '/v2/users/user': { user: { ...user, details: { resourceOwner: 'other' } } } });
    expect((await handleZitadelLogin(request('reset', { userId: 'user', code: 'ABC123', password: 'Strong1!' }), env)).status).toBe(400);
    expect(calls('/v2/users/user/password')).toHaveLength(1);
  });
  it('never finalizes unverified email or redirects to an upstream supplied different host', async () => {
    upstream({ '/v2/users': { result: [{ ...user, human: { email: { isVerified: false } } }] } });
    expect((await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env)).status).toBe(403);
    expect(calls('/v2/sessions')).toHaveLength(0);
    upstream({ '/v2/oidc/auth_requests/auth': { authRequest: { clientId: 'web-client', redirectUri: callback }, callbackUrl: 'https://evil.example?code=stolen' } });
    expect((await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env)).status).toBe(502);
  });
  it('sanitizes transport failures and never returns or logs secrets', async () => {
    fetchMock.mockRejectedValue(new Error('token login-pat password correct'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleZitadelLogin(request('context?authRequest=auth'), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('login-pat');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
  it('requires a fresh real password factor instead of accepting a user-only session', async () => {
    upstream({ '/v2/sessions/session': { session: { factors: { user: { id: 'user', organizationId: 'org', verifiedAt: new Date().toISOString() } } } } });
    expect((await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env)).status).toBe(401);
    expect(calls('/v2/oidc/auth_requests/auth')).toHaveLength(1);
  });
  it('honors forced MFA and returns only an encrypted HttpOnly continuation cookie', async () => {
    upstream({ '/v2/settings/login': { settings: { allowUsernamePassword: true, forceMfa: true, secondFactors: ['SECOND_FACTOR_TYPE_OTP'] } }, '/v2/users/user/authentication_methods': { authMethodTypes: ['AUTHENTICATION_METHOD_TYPE_PASSWORD', 'AUTHENTICATION_METHOD_TYPE_TOTP'] } });
    const response = await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env);
    expect(await response.json()).toEqual({ next: 'totp' });
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    expect(response.headers.get('set-cookie')).not.toContain('secret-session');
    expect(calls('/v2/oidc/auth_requests/auth')).toHaveLength(1);
  });
  it('binds a TOTP continuation to its auth request and requires a verified upstream TOTP factor', async () => {
    upstream({ '/v2/settings/login': { settings: { allowUsernamePassword: true, forceMfaLocalOnly: true, secondFactors: ['SECOND_FACTOR_TYPE_OTP'] } }, '/v2/users/user/authentication_methods': { authMethodTypes: ['AUTHENTICATION_METHOD_TYPE_TOTP'] } });
    const start = await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env);
    const cookie = start.headers.get('set-cookie')?.split(';')[0] ?? '';
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => new URL(String(input)).pathname === '/v2/sessions/session' && init?.method === 'PATCH' ? reply({ sessionToken: 'updated-secret' }) : base(input, init));
    const missing = await handleZitadelLogin(request('totp', { authRequest: 'auth', code: '123456' }, { cookie }), env);
    expect(missing.status).toBe(401);
    const previous = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => new URL(String(input)).pathname === '/v2/sessions/session' && init?.method === 'GET' ? reply({ session: { factors: { user: { id: 'user', organizationId: 'org', verifiedAt: new Date().toISOString() }, password: { verifiedAt: new Date().toISOString() }, totp: { verifiedAt: new Date().toISOString() } } } }) : previous(input, init));
    const complete = await handleZitadelLogin(request('totp', { authRequest: 'auth', code: '123456' }, { cookie }), env);
    expect(complete.status).toBe(200);
    expect(JSON.parse(String(calls('/v2/oidc/auth_requests/auth').at(-1)?.[1]?.body)).session.sessionToken).toBe('updated-secret');
    expect((await handleZitadelLogin(request('totp', { authRequest: 'auth', code: '123456' }, { cookie: cookie + 'tampered' }), env)).status).toBe(400);
  });
  it('fails closed when forced MFA needs enrollment instead of issuing an OIDC code', async () => {
    upstream({ '/v2/settings/login': { settings: { allowUsernamePassword: true, forceMfaLocalOnly: true, secondFactors: ['SECOND_FACTOR_TYPE_OTP'] } } });
    const response = await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('mfa_setup_required');
  });
  it('does not leak account existence through recovery and sends scoped reset links', async () => {
    const response = await handleZitadelLogin(request('forgot', { authRequest: 'auth', email: 'a@example.com' }), env);
    expect(await response.json()).toEqual({ success: true });
    expect(JSON.parse(String(calls('/v2/users/user/password_reset')[0]?.[1]?.body))).toEqual({ sendLink: { notificationType: 'NOTIFICATION_TYPE_Email', urlTemplate: `${origin}/login?mode=reset&userId={{.UserID}}&code={{.Code}}&authRequest=auth` } });
    upstream({ '/v2/users': { result: [] } });
    expect(await (await handleZitadelLogin(request('forgot', { authRequest: 'auth', email: 'unknown@example.com' }), env)).json()).toEqual({ success: true });
    expect(calls('/v2/users/user/password_reset')).toHaveLength(1);
  });
  it('requires an active allowed Google provider and refuses arbitrary external auth URLs', async () => {
    upstream({ '/v2/settings/login/idps': { identityProviders: [{ id: 'google-idp', type: 'IDENTITY_PROVIDER_TYPE_GOOGLE', options: { isCreationAllowed: true, isAutoCreation: true } }] }, '/v2/idp_intents': { authUrl: 'https://evil.example/?state=intent' } });
    expect((await handleZitadelLogin(request('google', { authRequest: 'auth' }), env)).status).toBe(502);
    upstream({ '/v2/settings/login/idps': { identityProviders: [] } });
    expect((await handleZitadelLogin(request('google', { authRequest: 'auth' }), env)).status).toBe(403);
  });
  it('binds the Google intent cookie to callback nonce and the exact intent', async () => {
    upstream({ '/v2/settings/login/idps': { identityProviders: [{ id: 'google-idp', type: 'IDENTITY_PROVIDER_TYPE_GOOGLE', options: { isCreationAllowed: true, isAutoCreation: true } }] }, '/v2/idp_intents': { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=intent&redirect_uri=https%3A%2F%2Fidentity.example%2Fidps%2Fcallback' }, '/v2/idp_intents/intent': { userId: 'user', idpInformation: { idpId: 'google-idp' } }, '/v2/sessions/session': { session: { factors: { user: { id: 'user', organizationId: 'org', verifiedAt: new Date().toISOString() }, intent: { verifiedAt: new Date().toISOString() } } } } });
    const start = await handleZitadelLogin(request('google', { authRequest: 'auth' }), env);
    expect(start.status).toBe(200);
    const cookie = start.headers.get('set-cookie')?.split(';')[0] ?? '';
    const payload = JSON.parse(String(calls('/v2/idp_intents')[0]?.[1]?.body));
    const valid = new URL(payload.urls.successUrl);
    valid.searchParams.set('id', 'intent'); valid.searchParams.set('token', 'verified-intent-token');
    const mismatch = new URL(valid); mismatch.searchParams.set('nonce', 'different');
    const rejected = await handleZitadelLogin(new Request(mismatch, { headers: { cookie } }), env);
    expect(rejected.headers.get('location')).toContain('external_login_failed');
    expect(calls('/v2/idp_intents/intent')).toHaveLength(0);
    const completed = await handleZitadelLogin(new Request(valid, { headers: { cookie } }), env);
    expect(completed.headers.get('location')).toBe(`${callback}?code=ok&state=bound`);
    expect(completed.status).toBe(303);
    expect(JSON.parse(String(calls('/v2/sessions')[0]?.[1]?.body)).checks.idpIntent).toEqual({ idpIntentId: 'intent', idpIntentToken: 'verified-intent-token' });
  });

  it.each([false, 'true'])('never marks an unverified Google email verified for provisioning (%s)', async (verified) => {
    upstream({ '/v2/settings/login/idps': { identityProviders: [{ id: 'google-idp', type: 'IDENTITY_PROVIDER_TYPE_GOOGLE', options: { isCreationAllowed: true, isAutoCreation: true } }] }, '/v2/idp_intents': { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=intent&redirect_uri=https%3A%2F%2Fidentity.example%2Fidps%2Fcallback' }, '/v2/idp_intents/intent': { idpInformation: { idpId: 'google-idp', userId: 'google-sub', rawInformation: { User: { sub: 'google-sub', email: 'new@example.com', email_verified: verified, name: 'Ana Silva' } } } } });
    const start = await handleZitadelLogin(request('google', { authRequest: 'auth' }), env);
    const payload = JSON.parse(String(calls('/v2/idp_intents')[0]?.[1]?.body));
    const callbackUrl = new URL(payload.urls.successUrl); callbackUrl.searchParams.set('id', 'intent'); callbackUrl.searchParams.set('token', 'token');
    const response = await handleZitadelLogin(new Request(callbackUrl, { headers: { cookie: start.headers.get('set-cookie')?.split(';')[0] ?? '' } }), env);
    expect(response.headers.get('location')).toContain('external_login_failed');
    expect(calls('/v2/users/human')).toHaveLength(0);
  });
  it('provisions only verified configured Google claims under the configured org', async () => {
    upstream({ '/v2/settings/login/idps': { identityProviders: [{ id: 'google-idp', type: 'IDENTITY_PROVIDER_TYPE_GOOGLE', options: { isCreationAllowed: true, isAutoCreation: true } }] }, '/v2/idp_intents': { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=intent&redirect_uri=https%3A%2F%2Fidentity.example%2Fidps%2Fcallback' }, '/v2/idp_intents/intent': { idpInformation: { idpId: 'google-idp', userId: 'google-sub', rawInformation: { User: { sub: 'google-sub', email: 'new@example.com', email_verified: true, name: 'Ana Silva' } } } }, '/v2/users': { result: [] }, '/v2/users/human': { userId: 'user' }, '/v2/sessions/session': { session: { factors: { user: { id: 'user', organizationId: 'org', verifiedAt: new Date().toISOString() }, intent: { verifiedAt: new Date().toISOString() } } } } });
    const start = await handleZitadelLogin(request('google', { authRequest: 'auth' }), env);
    const payload = JSON.parse(String(calls('/v2/idp_intents')[0]?.[1]?.body));
    const callbackUrl = new URL(payload.urls.successUrl); callbackUrl.searchParams.set('id', 'intent'); callbackUrl.searchParams.set('token', 'token');
    const response = await handleZitadelLogin(new Request(callbackUrl, { headers: { cookie: start.headers.get('set-cookie')?.split(';')[0] ?? '' } }), env);
    expect(response.headers.get('location')).toBe(`${callback}?code=ok&state=bound`);
    expect(JSON.parse(String(calls('/v2/users/human')[0]?.[1]?.body))).toMatchObject({ organization: { orgId: 'org' }, email: { email: 'new@example.com', isVerified: true }, idpLinks: [{ idpId: 'google-idp', userId: 'google-sub', userName: 'Ana Silva' }] });
  });
  it('does not auto-link Google to an existing account with matching email', async () => {
    upstream({ '/v2/settings/login/idps': { identityProviders: [{ id: 'google-idp', type: 'IDENTITY_PROVIDER_TYPE_GOOGLE', options: { isCreationAllowed: true, isAutoCreation: true } }] }, '/v2/idp_intents': { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=intent&redirect_uri=https%3A%2F%2Fidentity.example%2Fidps%2Fcallback' }, '/v2/idp_intents/intent': { idpInformation: { idpId: 'google-idp', rawInformation: { User: { sub: 'google-sub', email: 'a@example.com', email_verified: true, name: 'Ana Silva' } } } } });
    const start = await handleZitadelLogin(request('google', { authRequest: 'auth' }), env);
    const payload = JSON.parse(String(calls('/v2/idp_intents')[0]?.[1]?.body));
    const callbackUrl = new URL(payload.urls.successUrl); callbackUrl.searchParams.set('id', 'intent'); callbackUrl.searchParams.set('token', 'token');
    const response = await handleZitadelLogin(new Request(callbackUrl, { headers: { cookie: start.headers.get('set-cookie')?.split(';')[0] ?? '' } }), env);
    expect(response.headers.get('location')).toContain('external_login_failed');
    expect(calls('/v2/users/human')).toHaveLength(0);
    expect(calls('/v2/sessions')).toHaveLength(0);
  });

  it('does not revoke app sessions when the upstream password reset code fails', async () => {
    const previous = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => new URL(String(input)).pathname === '/v2/users/user/password' ? reply({ message: 'sensitive-upstream-detail' }, 400) : previous(input, init));
    const response = await handleZitadelLogin(request('reset', { userId: 'user', code: 'bad-code', password: 'Strong1!' }), env);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_code');
    expect(dbPrepare).not.toHaveBeenCalled();
  });
  it('rejects a password session checked before the last upstream password change', async () => {
    upstream({ '/v2/users/user': { user: { ...user, human: { ...user.human, passwordChanged: new Date(Date.now() + 1000).toISOString() } } } });
    expect((await handleZitadelLogin(request('password', { authRequest: 'auth', email: 'a@example.com', password: 'correct' }), env)).status).toBe(401);
    expect(calls('/v2/oidc/auth_requests/auth')).toHaveLength(1);
  });

  it('does not accept a plain HTTP issuer for a public HTTPS application', async () => {
    const response = await handleZitadelLogin(request('context?authRequest=auth'), { ...env, MARATONA_ZITADEL_ISSUER_URL: 'http://localhost:8080' });
    expect(response.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
