import { z } from 'zod';
import type { BackendEnv } from './cloudflare';
import { errorResponse, HttpError, json } from './http';

// Session and User V2 contracts target Zitadel v4.17.3. Session factors are
// checked here because the Session API delegates login policy to its client.
const identifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9_@.:-]+$/);
const email = z.string().trim().email().max(200).transform((value) => value.toLowerCase());
const password = z.string().min(1).max(200);
const code = z.string().min(1).max(20);
const authSchema = z.object({ authRequest: identifier }).strict();
const credentialsSchema = authSchema.extend({ email, password });
const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(1).max(200) });
const emailSchema = authSchema.extend({ email });
const verifySchema = z.object({ userId: identifier, code }).strict();
const resetSchema = verifySchema.extend({ password });
const totpSchema = authSchema.extend({ code: z.string().regex(/^\d{6}$/) });
const cookieSchema = z.object({ authRequest: identifier, expires: z.number(), kind: z.enum(['google', 'totp']), nonce: z.string().optional(), intentId: identifier.optional(), sessionId: identifier.optional(), sessionToken: z.string().max(500).optional(), method: z.enum(['password', 'idpIntent']).optional() });
type Pending = z.infer<typeof cookieSchema>;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const badRequest = () => new HttpError(400, 'Solicitação de acesso inválida ou expirada. Inicie novamente.', 'invalid_auth_request');
const unavailable = () => new HttpError(502, 'Não foi possível acessar o serviço de conta. Tente novamente.', 'auth_unavailable');
const invalidLogin = () => new HttpError(401, 'Email ou senha inválidos.', 'invalid_login');
const invalidCode = () => new HttpError(400, 'Código inválido ou expirado. Solicite um novo código.', 'invalid_code');

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'Confira os dados informados.', 'invalid_input');
  return result.data;
}
function originUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '') ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw unavailable();
    return url;
  } catch { throw unavailable(); }
}
function configuration(env: BackendEnv) {
  const app = originUrl(env.BETTER_AUTH_URL);
  const issuer = originUrl(env.MARATONA_ZITADEL_ISSUER_URL);
  if (issuer.protocol !== 'https:' && app.protocol === 'https:') throw unavailable();
  if (![env.BETTER_AUTH_SECRET, env.MARATONA_ZITADEL_WEB_CLIENT_ID, env.MARATONA_ZITADEL_LOGIN_ORG_ID, env.MARATONA_ZITADEL_LOGIN_PAT, env.MARATONA_ZITADEL_MANAGEMENT_PAT].every(Boolean)) throw unavailable();
  return { app, issuer, callback: `${app.origin}/api/auth/callback/zitadel` };
}

async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new HttpError(415, 'Envie um corpo JSON.', 'unsupported_media_type');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'JSON inválido.', 'invalid_json');
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > 16384) { await reader.cancel(); throw new HttpError(413, 'Solicitação muito grande.', 'body_too_large'); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'JSON inválido.', 'invalid_json'); }
}

class UpstreamError extends HttpError {
  constructor(readonly upstreamStatus: number) {
    super(upstreamStatus === 429 ? 429 : 502, upstreamStatus === 429 ? 'Muitas tentativas. Aguarde e tente novamente.' : 'Não foi possível acessar o serviço de conta. Tente novamente.', upstreamStatus === 429 ? 'rate_limited' : 'auth_unavailable');
  }
}
async function api(env: BackendEnv, path: string, role: 'login' | 'management', method = 'GET', payload?: unknown): Promise<JsonObject> {
  try {
    const { issuer } = configuration(env);
    const response = await fetch(`${issuer.origin}${path}`, {
      method, headers: { authorization: `Bearer ${role === 'login' ? env.MARATONA_ZITADEL_LOGIN_PAT : env.MARATONA_ZITADEL_MANAGEMENT_PAT}`, 'content-type': 'application/json', 'x-zitadel-orgid': env.MARATONA_ZITADEL_LOGIN_ORG_ID },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new UpstreamError(response.status);
    return object(await response.json());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unavailable();
  }
}
async function validateAuthRequest(env: BackendEnv, id: string) {
  let result: JsonObject;
  try { result = await api(env, `/v2/oidc/auth_requests/${encodeURIComponent(id)}`, 'login'); }
  catch (error) { if (error instanceof UpstreamError && [400, 404, 412].includes(error.upstreamStatus)) throw badRequest(); throw error; }
  const authRequest = object(result.authRequest);
  if (authRequest.clientId !== env.MARATONA_ZITADEL_WEB_CLIENT_ID || authRequest.redirectUri !== configuration(env).callback) throw badRequest();
}
async function settings(env: BackendEnv): Promise<JsonObject> {
  const result = await api(env, `/v2/settings/login?ctx.orgId=${encodeURIComponent(env.MARATONA_ZITADEL_LOGIN_ORG_ID)}`, 'login');
  if (!result.settings || typeof result.settings !== 'object') throw unavailable();
  return object(result.settings);
}
async function googleProvider(env: BackendEnv): Promise<JsonObject | undefined> {
  if (!env.MARATONA_ZITADEL_GOOGLE_IDP_ID) return undefined;
  const result = await api(env, `/v2/settings/login/idps?ctx.orgId=${encodeURIComponent(env.MARATONA_ZITADEL_LOGIN_ORG_ID)}`, 'login');
  if (!Array.isArray(result.identityProviders)) throw unavailable();
  return result.identityProviders.map(object).find((provider) => provider.id === env.MARATONA_ZITADEL_GOOGLE_IDP_ID && provider.type === 'IDENTITY_PROVIDER_TYPE_GOOGLE');
}
function requirePolicy(policy: JsonObject, key: string, errorCode: string, message: string) {
  if (policy[key] !== true) throw new HttpError(403, message, errorCode);
}
function assertUser(env: BackendEnv, user: JsonObject) {
  if (object(user.details).resourceOwner !== env.MARATONA_ZITADEL_LOGIN_ORG_ID || !user.human || !identifier.safeParse(user.userId).success) throw invalidCode();
}
async function getUser(env: BackendEnv, id: string): Promise<JsonObject> {
  let result: JsonObject;
  try { result = await api(env, `/v2/users/${encodeURIComponent(id)}`, 'management'); }
  catch (error) { if (error instanceof UpstreamError && [400, 404, 412].includes(error.upstreamStatus)) throw invalidCode(); throw error; }
  const user = object(result.user);
  assertUser(env, user);
  return user;
}
async function findUser(env: BackendEnv, address: string): Promise<JsonObject | undefined> {
  const result = await api(env, '/v2/users', 'management', 'POST', {
    query: { limit: 2 }, queries: [{ emailQuery: { emailAddress: address, method: 'TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE' } }, { organizationIdQuery: { organizationId: env.MARATONA_ZITADEL_LOGIN_ORG_ID } }],
  });
  if (!Array.isArray(result.result)) throw unavailable();
  if (result.result.length !== 1) return undefined;
  const user = object(result.result[0]);
  assertUser(env, user);
  return user;
}
function assertVerified(user: JsonObject) {
  if (object(object(user.human).email).isVerified !== true) throw new HttpError(403, 'Confirme seu email antes de entrar. Você pode solicitar um novo código.', 'email_unverified');
  if (user.state !== 'USER_STATE_ACTIVE') throw invalidLogin();
  if (object(user.human).passwordChangeRequired === true) throw new HttpError(403, 'Sua senha precisa ser atualizada. Solicite a recuperação de senha.', 'password_change_required');
}
function profile(name: string) {
  const parts = name.trim().split(/\s+/);
  return { givenName: parts[0] || name, familyName: parts.slice(1).join(' ') || name, displayName: name, preferredLanguage: 'pt' };
}
function emailLink(env: BackendEnv, mode: 'verify' | 'reset', id: string) {
  return `${configuration(env).app.origin}/login?mode=${mode}&userId={{.UserID}}&code={{.Code}}&authRequest=${encodeURIComponent(id)}`;
}

function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unbase64(value: string): Uint8Array { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)); }
async function cookieKey(env: BackendEnv) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`maratona-login-v1:${env.BETTER_AUTH_SECRET}`));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function cookieName(kind: Pending['kind']) { return `maratona_login_${kind}`; }
function cookieHeader(env: BackendEnv, kind: Pending['kind'], value: string, age: number) {
  return `${cookieName(kind)}=${value}; Path=/api/login; HttpOnly; SameSite=Lax; Max-Age=${age}${configuration(env).app.protocol === 'https:' ? '; Secure' : ''}`;
}
async function seal(env: BackendEnv, pending: Pending) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(configuration(env).app.origin) }, await cookieKey(env), new TextEncoder().encode(JSON.stringify(pending)));
  return cookieHeader(env, pending.kind, `${base64(iv)}.${base64(new Uint8Array(encrypted))}`, 600);
}
async function unseal(request: Request, env: BackendEnv, kind: Pending['kind']): Promise<Pending> {
  try {
    const raw = (request.headers.get('cookie') ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName(kind)}=`))?.slice(cookieName(kind).length + 1);
    if (!raw || raw.length > 3000) throw badRequest();
    const [iv, data] = raw.split('.');
    if (!iv || !data) throw badRequest();
    const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(iv) as Uint8Array<ArrayBuffer>, additionalData: new TextEncoder().encode(configuration(env).app.origin) }, await cookieKey(env), unbase64(data) as Uint8Array<ArrayBuffer>);
    const pending = cookieSchema.parse(JSON.parse(new TextDecoder().decode(decoded)));
    if (pending.kind !== kind || pending.expires < Date.now()) throw badRequest();
    return pending;
  } catch { throw badRequest(); }
}

async function finish(env: BackendEnv, authRequest: string, sessionId: string, sessionToken: string) {
  const result = await api(env, `/v2/oidc/auth_requests/${encodeURIComponent(authRequest)}`, 'login', 'POST', { session: { sessionId, sessionToken } });
  let url: URL;
  try { url = new URL(text(result.callbackUrl)); } catch { throw unavailable(); }
  const expected = new URL(configuration(env).callback);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash || !url.searchParams.get('code') || !url.searchParams.get('state')) throw unavailable();
  return url.href;
}
async function completeSession(env: BackendEnv, authRequest: string, sessionId: string, sessionToken: string, method: 'password' | 'idpIntent', totpDone = false): Promise<Response> {
  const sessionResult = await api(env, `/v2/sessions/${encodeURIComponent(sessionId)}`, 'login');
  const factors = object(object(sessionResult.session).factors);
  const userFactor = object(factors.user);
  if (userFactor.organizationId !== env.MARATONA_ZITADEL_LOGIN_ORG_ID || !identifier.safeParse(userFactor.id).success) throw invalidLogin();
  for (const factor of [userFactor, object(factors[method === 'idpIntent' ? 'intent' : 'password']), ...(totpDone ? [object(factors.totp)] : [])]) {
    const verified = Date.parse(text(factor.verifiedAt));
    if (!Number.isFinite(verified) || Date.now() - verified > 600000 || verified > Date.now() + 30000) throw invalidLogin();
  }
  const user = await getUser(env, text(userFactor.id));
  assertVerified(user);
  const passwordChanged = Date.parse(text(object(user.human).passwordChanged));
  if (method === 'password' && Number.isFinite(passwordChanged) && Date.parse(text(object(factors.password).verifiedAt)) < passwordChanged) throw invalidLogin();
  const policy = await settings(env);
  requirePolicy(policy, method === 'password' ? 'allowUsernamePassword' : 'allowExternalIdp', 'login_disabled', 'Este método de acesso está desativado.');
  const methodsResult = await api(env, `/v2/users/${encodeURIComponent(text(userFactor.id))}/authentication_methods`, 'management');
  if (!Array.isArray(methodsResult.authMethodTypes)) throw unavailable();
  const enrolled = methodsResult.authMethodTypes as unknown[];
  const totpEnabled = Array.isArray(policy.secondFactors) && policy.secondFactors.some((factor) => ['SECOND_FACTOR_TYPE_OTP', 'SECOND_FACTOR_TYPE_TOTP'].includes(String(factor)));
  const hasTotp = enrolled.includes('AUTHENTICATION_METHOD_TYPE_TOTP');
  const hasOtherFactor = enrolled.some((item) => ['AUTHENTICATION_METHOD_TYPE_U2F', 'AUTHENTICATION_METHOD_TYPE_OTP_SMS', 'AUTHENTICATION_METHOD_TYPE_OTP_EMAIL'].includes(String(item)));
  const mfaRequired = policy.forceMfa === true || (method === 'password' && policy.forceMfaLocalOnly === true) || hasTotp || hasOtherFactor;
  if (mfaRequired) {
    if (!totpEnabled || !hasTotp) throw new HttpError(403, 'Esta conta exige um método de segurança que precisa ser configurado pelo administrador.', hasOtherFactor ? 'unsupported_mfa' : 'mfa_setup_required');
    if (!totpDone) return json({ next: 'totp' }, { headers: { 'set-cookie': await seal(env, { kind: 'totp', authRequest, expires: Date.now() + 600000, sessionId, sessionToken, method }) } });
  }
  return json({ url: await finish(env, authRequest, sessionId, sessionToken) }, { headers: { 'set-cookie': cookieHeader(env, 'totp', '', 0) } });
}

async function googleCallback(request: Request, env: BackendEnv): Promise<Response> {
  const url = new URL(request.url);
  const pending = await unseal(request, env, 'google');
  if (!pending.nonce || url.searchParams.get('nonce') !== pending.nonce) throw badRequest();
  await validateAuthRequest(env, pending.authRequest);
  const id = parse(identifier, url.searchParams.get('id'));
  if (id !== pending.intentId) throw badRequest();
  const token = parse(z.string().min(1).max(500), url.searchParams.get('token'));
  const result = await api(env, `/v2/idp_intents/${encodeURIComponent(id)}`, 'login', 'POST', { idpIntentToken: token });
  const info = object(result.idpInformation);
  if (info.idpId !== env.MARATONA_ZITADEL_GOOGLE_IDP_ID) throw invalidLogin();
  const policy = await settings(env);
  requirePolicy(policy, 'allowExternalIdp', 'external_login_disabled', 'O acesso com Google está desativado.');
  const provider = await googleProvider(env);
  if (!provider) throw invalidLogin();
  let userId = text(result.userId);
  if (!userId) {
    const options = object(provider?.options);
    if (!provider || options.isCreationAllowed !== true || options.isAutoCreation !== true) throw new HttpError(403, 'O cadastro com Google está desativado.', 'registration_disabled');
    const raw = object(info.rawInformation);
    const claims = object(raw.User ?? raw);
    const address = parse(email, claims.email);
    const subject = parse(identifier, claims.sub);
    if (claims.email_verified !== true || (info.userId && info.userId !== subject)) throw invalidLogin();
    // An existing email account must be linked only after authenticating that
    // account. A matching verified provider email is not proof of that login.
    if (await findUser(env, address)) throw new HttpError(409, 'Já existe uma conta com este email. Entre com sua senha.', 'account_link_required');
    const displayName = parse(z.string().min(1).max(200), claims.name || address.split('@')[0]);
    const created = await api(env, '/v2/users/human', 'management', 'POST', {
      username: address, organization: { orgId: env.MARATONA_ZITADEL_LOGIN_ORG_ID }, profile: profile(displayName), email: { email: address, isVerified: true }, idpLinks: [{ idpId: env.MARATONA_ZITADEL_GOOGLE_IDP_ID, userId: subject, userName: displayName }],
    });
    userId = parse(identifier, created.userId);
  }
  const user = await getUser(env, parse(identifier, userId));
  assertVerified(user);
  const session = await api(env, '/v2/sessions', 'login', 'POST', { checks: { user: { userId }, idpIntent: { idpIntentId: id, idpIntentToken: token } }, lifetime: '600s' });
  const completion = await completeSession(env, pending.authRequest, parse(identifier, session.sessionId), parse(z.string().min(1).max(500), session.sessionToken), 'idpIntent');
  const responseBody = object(await completion.json());
  const target = responseBody.next === 'totp' ? `${configuration(env).app.origin}/login?mode=totp&authRequest=${encodeURIComponent(pending.authRequest)}` : text(responseBody.url);
  const headers = new Headers({ location: target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  const nextCookie = completion.headers.get('set-cookie');
  if (nextCookie) headers.append('set-cookie', nextCookie);
  headers.append('set-cookie', cookieHeader(env, 'google', '', 0));
  return new Response(null, { status: 303, headers });
}

export async function handleZitadelLogin(request: Request, env: BackendEnv): Promise<Response> {
  try {
    const { app } = configuration(env);
    const url = new URL(request.url);
    if (url.origin !== app.origin) throw new HttpError(403, 'Origem inválida.', 'invalid_origin');
    const route = url.pathname.replace(/^\/api\/login\/?/, '');
    if (request.method === 'GET' && route === 'context') {
      const id = parse(identifier, url.searchParams.get('authRequest'));
      await validateAuthRequest(env, id);
      const policy = await settings(env);
      return json({ googleEnabled: policy.allowExternalIdp === true && Boolean(await googleProvider(env)) });
    }
    if (request.method === 'GET' && route === 'google/callback') {
      try { return await googleCallback(request, env); }
      catch {
        let id = '';
        try { id = (await unseal(request, env, 'google')).authRequest; } catch { /* no trusted browser context */ }
        return new Response(null, { status: 303, headers: { location: `${app.origin}/login?error=external_login_failed${id ? `&authRequest=${encodeURIComponent(id)}` : ''}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'set-cookie': cookieHeader(env, 'google', '', 0) } });
      }
    }
    if (request.method !== 'POST') throw new HttpError(405, 'Método não permitido.', 'method_not_allowed');
    if (request.headers.get('origin') !== app.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Origem inválida.', 'invalid_origin');
    const body = await boundedJson(request);
    if (route === 'verify' || route === 'reset') {
      const input = route === 'reset' ? parse(resetSchema, body) : parse(verifySchema, body);
      await getUser(env, input.userId);
      try {
        await api(env, `/v2/users/${encodeURIComponent(input.userId)}/${route === 'reset' ? 'password' : 'email/verify'}`, 'management', 'POST', route === 'reset' ? { newPassword: { password: (input as z.infer<typeof resetSchema>).password, changeRequired: false }, verificationCode: input.code } : { verificationCode: input.code });
      } catch (error) { if (error instanceof UpstreamError && [400, 404, 412].includes(error.upstreamStatus)) throw invalidCode(); throw error; }
      if (route === 'reset') {
        const revoked = await env.DB.prepare('DELETE FROM session WHERE userId IN (SELECT userId FROM account WHERE providerId = ? AND issuer = ? AND accountId = ?)')
          .bind('zitadel', configuration(env).issuer.origin, input.userId).run();
        if (!revoked.success) throw unavailable();
      }
      return json({ success: true });
    }
    if (route === 'password') {
      const input = parse(credentialsSchema, body);
      await validateAuthRequest(env, input.authRequest);
      const policy = await settings(env);
      requirePolicy(policy, 'allowUsernamePassword', 'login_disabled', 'O acesso por senha está desativado.');
      if (policy.disableLoginWithEmail === true || policy.allowLocalAuthentication === false) throw new HttpError(403, 'O acesso por email e senha está desativado.', 'login_disabled');
      const user = await findUser(env, input.email);
      if (!user) throw invalidLogin();
      assertVerified(user);
      let session: JsonObject;
      try { session = await api(env, '/v2/sessions', 'login', 'POST', { checks: { user: { userId: user.userId }, password: { password: input.password } }, lifetime: '600s' }); }
      catch (error) { if (error instanceof UpstreamError && [400, 401, 403, 404, 412].includes(error.upstreamStatus)) throw invalidLogin(); throw error; }
      return await completeSession(env, input.authRequest, parse(identifier, session.sessionId), parse(z.string().min(1).max(500), session.sessionToken), 'password');
    }
    if (route === 'totp') {
      const input = parse(totpSchema, body);
      await validateAuthRequest(env, input.authRequest);
      const pending = await unseal(request, env, 'totp');
      if (pending.authRequest !== input.authRequest || !pending.sessionId || !pending.sessionToken || !pending.method) throw badRequest();
      let result: JsonObject;
      try { result = await api(env, `/v2/sessions/${encodeURIComponent(pending.sessionId)}`, 'login', 'PATCH', { sessionToken: pending.sessionToken, checks: { totp: { code: input.code } }, lifetime: '600s' }); }
      catch (error) { if (error instanceof UpstreamError && [400, 401, 403, 404, 412].includes(error.upstreamStatus)) throw new HttpError(400, 'Código de segurança incorreto ou expirado.', 'invalid_totp'); throw error; }
      return await completeSession(env, input.authRequest, pending.sessionId, parse(z.string().min(1).max(500), result.sessionToken), pending.method, true);
    }
    if (route === 'register') {
      const input = parse(registerSchema, body);
      await validateAuthRequest(env, input.authRequest);
      const policy = await settings(env);
      requirePolicy(policy, 'allowRegister', 'registration_disabled', 'O cadastro de novas contas está desativado.');
      requirePolicy(policy, 'allowUsernamePassword', 'login_disabled', 'O cadastro por senha está desativado.');
      try {
        await api(env, '/v2/users/human', 'management', 'POST', { username: input.email, organization: { orgId: env.MARATONA_ZITADEL_LOGIN_ORG_ID }, profile: profile(input.name), email: { email: input.email, sendCode: { urlTemplate: emailLink(env, 'verify', input.authRequest) } }, password: { password: input.password, changeRequired: false } });
      } catch (error) {
        if (error instanceof UpstreamError && error.upstreamStatus === 409) return json({ success: true });
        if (error instanceof UpstreamError && [400, 412].includes(error.upstreamStatus)) throw new HttpError(400, 'Confira os dados e escolha uma senha que atenda aos requisitos da conta.', 'invalid_input');
        throw error;
      }
      return json({ success: true });
    }
    if (route === 'resend' || route === 'forgot') {
      const input = parse(emailSchema, body);
      await validateAuthRequest(env, input.authRequest);
      const policy = await settings(env);
      if (route === 'forgot' && (policy.hidePasswordReset === true || policy.allowUsernamePassword !== true || policy.allowLocalAuthentication === false)) throw new HttpError(403, 'A recuperação de senha está desativada.', 'password_reset_disabled');
      const user = await findUser(env, input.email);
      if (user) {
        try { await api(env, `/v2/users/${encodeURIComponent(text(user.userId))}/${route === 'forgot' ? 'password_reset' : 'email/resend'}`, 'management', 'POST', route === 'forgot' ? { sendLink: { notificationType: 'NOTIFICATION_TYPE_Email', urlTemplate: emailLink(env, 'reset', input.authRequest) } } : { sendCode: { urlTemplate: emailLink(env, 'verify', input.authRequest) } }); }
        catch (error) { if (!(error instanceof UpstreamError && [400, 404, 409, 412].includes(error.upstreamStatus))) throw error; }
      }
      return json({ success: true });
    }
    if (route === 'google') {
      const input = parse(authSchema, body);
      await validateAuthRequest(env, input.authRequest);
      const policy = await settings(env);
      requirePolicy(policy, 'allowExternalIdp', 'external_login_disabled', 'O acesso com Google está desativado.');
      if (!(await googleProvider(env))) throw new HttpError(403, 'O acesso com Google está desativado.', 'external_login_disabled');
      const nonce = base64(crypto.getRandomValues(new Uint8Array(24)));
      const callback = `${app.origin}/api/login/google/callback?nonce=${encodeURIComponent(nonce)}`;
      const result = await api(env, '/v2/idp_intents', 'login', 'POST', { idpId: env.MARATONA_ZITADEL_GOOGLE_IDP_ID, urls: { successUrl: callback, failureUrl: callback } });
      let external: URL;
      try { external = new URL(text(result.authUrl)); } catch { throw unavailable(); }
      const intentId = parse(identifier, external.searchParams.get('state'));
      if (external.origin !== 'https://accounts.google.com' || !['/o/oauth2/v2/auth', '/o/oauth2/auth'].includes(external.pathname) || external.username || external.password || external.hash || external.searchParams.get('redirect_uri') !== `${configuration(env).issuer.origin}/idps/callback`) throw unavailable();
      return json({ url: external.href }, { headers: { 'set-cookie': await seal(env, { kind: 'google', authRequest: input.authRequest, nonce, intentId, expires: Date.now() + 600000 }) } });
    }
    throw new HttpError(404, 'Página não encontrada.', 'not_found');
  } catch (error) {
    // Do not let shared errorResponse log transport errors, upstream bodies,
    // session tokens, provider data, or request credentials.
    return errorResponse(error instanceof HttpError ? error : unavailable());
  }
}
