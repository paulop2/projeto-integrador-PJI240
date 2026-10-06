export interface AuthUser { id: string; email: string; name: string }

export interface AuthPort {
  getSession(): Promise<AuthUser | null>;
  signIn(): Promise<void>;
  signOut(): Promise<string | null>;
}

type JsonRecord = Record<string, unknown>;
const fallbackError = 'Não foi possível concluir a autenticação. Tente novamente.';
const errors: Record<string, string> = {
  auth_unavailable: 'O serviço de conta está indisponível. Tente novamente em instantes.',
  password_change_required: 'Sua senha precisa ser alterada. Use a opção de recuperar senha para continuar.',
  login_disabled: 'O acesso por senha está indisponível. Tente outro método de entrada.',
  registration_disabled: 'A criação de contas está indisponível no momento.',
  external_login_disabled: 'O acesso com Google está indisponível no momento.',
  invalid_login: 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  email_unverified: 'Verifique seu e-mail antes de entrar. Você pode reenviar o link abaixo.',
  mfa_setup_required: 'Sua conta exige configurar uma segunda etapa de segurança. Solicite ajuda para acessar sua conta.',
  unsupported_mfa: 'Este método de segurança ainda não está disponível. Solicite ajuda para acessar sua conta.',
  invalid_totp: 'Código de segurança incorreto ou expirado. Confira o autenticador e tente novamente.',
  invalid_credentials: 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  email_not_verified: 'Verifique seu e-mail antes de entrar. Você pode reenviar o link abaixo.',
  invalid_auth_request: 'Este acesso expirou. Reinicie o login para continuar.',
  invalid_code: 'Este link é inválido ou expirou. Solicite um novo link.',
  invalid_input: 'Confira os campos e tente novamente.',
  password_policy: 'A senha não atende aos requisitos. Use uma senha mais longa, com letras, números e símbolos.',
  rate_limited: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  unavailable: 'O serviço de conta está indisponível. Tente novamente em instantes.',
  unsupported_flow: 'Não foi possível concluir este acesso. Solicite ajuda para recuperar sua conta.',
};
export class LoginError extends Error {
  constructor(readonly code: string) { super(errors[code] ?? fallbackError); }
}

async function request(path: string, init?: RequestInit): Promise<JsonRecord | null> {
  let response: Response;
  try { response = await fetch(path, { credentials: 'include', ...init }); }
  catch { throw new LoginError('unavailable'); }
  let payload: JsonRecord | null = null;
  if (response.headers.get('content-type')?.includes('application/json')) {
    try { payload = await response.json() as JsonRecord; } catch { throw new LoginError('unavailable'); }
  }
  if (!response.ok) {
    const error = payload?.error;
    const code = error && typeof error === 'object' ? (error as JsonRecord).code : null;
    throw new LoginError(typeof code === 'string' ? code : response.status === 429 ? 'rate_limited' : 'unavailable');
  }
  return payload;
}
const post = (path: string, body: JsonRecord) => request(path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const callbackURL = () => new URL('/', window.location.origin).toString();
export function redirectURL(payload: JsonRecord | null): string {
  if (typeof payload?.url !== 'string') throw new LoginError('unavailable');
  let url: URL;
  try { url = new URL(payload.url, window.location.origin); } catch { throw new LoginError('unavailable'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === window.location.hostname)) throw new LoginError('unavailable');
  return url.toString();
}
export const httpAuthPort: AuthPort = {
  async getSession() {
    const candidate = (await request('/api/auth/get-session'))?.user;
    if (!candidate || typeof candidate !== 'object') return null;
    const user = candidate as JsonRecord;
    return typeof user.id === 'string' && typeof user.email === 'string'
      ? { id: user.id, email: user.email, name: typeof user.name === 'string' ? user.name : user.email }
      : null;
  },
  async signIn() {
    const payload = await post('/api/auth/sign-in/social', {
      provider: 'zitadel', callbackURL: callbackURL(),
      errorCallbackURL: new URL('/login?error=login_failed', window.location.origin).toString(), disableRedirect: true,
    });
    window.location.assign(redirectURL(payload));
  },
  async signOut() {
    const payload = await post('/api/auth/sign-out', { callbackURL: callbackURL(), disableRedirect: true });
    return typeof payload?.url === 'string' ? redirectURL(payload) : null;
  },
};

export interface LoginPort {
  context(authRequest: string): Promise<{ googleEnabled: boolean }>;
  password(authRequest: string, email: string, password: string): Promise<{ url: string } | { next: 'totp' }>;
  totp(authRequest: string, code: string): Promise<string>;
  register(authRequest: string, name: string, email: string, password: string): Promise<void>;
  verify(userId: string, code: string): Promise<void>;
  resend(authRequest: string, email: string): Promise<void>;
  forgot(authRequest: string, email: string): Promise<void>;
  reset(userId: string, code: string, password: string): Promise<void>;
  google(authRequest: string): Promise<string>;
}
export const httpLoginPort: LoginPort = {
  async context(authRequest) {
    const payload = await request(`/api/login/context?authRequest=${encodeURIComponent(authRequest)}`);
    return { googleEnabled: payload?.googleEnabled === true };
  },
  async password(authRequest, email, password) {
    const payload = await post('/api/login/password', { authRequest, email, password });
    return payload?.next === 'totp' ? { next: 'totp' } : { url: redirectURL(payload) };
  },
  async totp(authRequest, code) { return redirectURL(await post('/api/login/totp', { authRequest, code })); },
  async register(authRequest, name, email, password) { await post('/api/login/register', { authRequest, name, email, password }); },
  async verify(userId, code) { await post('/api/login/verify', { userId, code }); },
  async resend(authRequest, email) { await post('/api/login/resend', { authRequest, email }); },
  async forgot(authRequest, email) { await post('/api/login/forgot', { authRequest, email }); },
  async reset(userId, code, password) { await post('/api/login/reset', { userId, code, password }); },
  async google(authRequest) { return redirectURL(await post('/api/login/google', { authRequest })); },
};
