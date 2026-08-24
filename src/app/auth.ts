export interface AuthUser { id: string; email: string; name: string }

export interface AuthPort {
  getSession(): Promise<AuthUser | null>;
  signInEmail(email: string, password: string): Promise<AuthUser | null>;
  signUpEmail(name: string, email: string, password: string): Promise<void>;
  signInGoogle(): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  sendVerification(email: string): Promise<void>;
}

type JsonRecord = Record<string, unknown>;

async function authRequest(path: string, init?: RequestInit): Promise<JsonRecord | null> {
  const response = await fetch(`/api/auth/${path}`, { credentials: 'include', ...init });
  const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() as JsonRecord : null;
  if (!response.ok) {
    const message = payload && typeof payload.message === 'string' ? payload.message : 'Não foi possível concluir a autenticação.';
    throw new Error(message);
  }
  return payload;
}

const post = (path: string, body: JsonRecord) => authRequest(path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

const callbackURL = () => new URL('/', window.location.origin).toString();

const userFrom = (payload: JsonRecord | null): AuthUser | null => {
  const candidate = payload?.user;
  if (!candidate || typeof candidate !== 'object') return null;
  const user = candidate as JsonRecord;
  return typeof user.id === 'string' && typeof user.email === 'string'
    ? { id: user.id, email: user.email, name: typeof user.name === 'string' ? user.name : user.email }
    : null;
};

export const httpAuthPort: AuthPort = {
  async getSession() { return userFrom(await authRequest('get-session')); },
  async signInEmail(email, password) { return userFrom(await post('sign-in/email', { email, password, callbackURL: callbackURL() })); },
  async signUpEmail(name, email, password) { await post('sign-up/email', { name, email, password, callbackURL: callbackURL() }); },
  async signInGoogle() {
    const payload = await post('sign-in/social', { provider: 'google', callbackURL: callbackURL() });
    if (typeof payload?.url !== 'string') throw new Error('O Google não retornou um endereço de login.');
    window.location.assign(payload.url);
  },
  async signOut() { await post('sign-out', {}); },
  async requestPasswordReset(email) { await post('request-password-reset', { email, redirectTo: `${callbackURL()}?reset=true` }); },
  async resetPassword(token, password) { await post('reset-password', { token, newPassword: password }); },
  async sendVerification(email) { await post('send-verification-email', { email, callbackURL: `${callbackURL()}?verified=true` }); },
};
