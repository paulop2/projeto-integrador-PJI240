import type { BetterAuthOptions } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';

import type { BackendEnv } from './cloudflare';
import { HttpError } from './http';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthRuntime {
  handler(request: Request): Promise<Response>;
  getSession(headers: Headers): Promise<{ user: AuthenticatedUser } | null>;
}

function required(env: BackendEnv, key: keyof BackendEnv): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Binding obrigatório ausente: ${key}`);
  }
  return value;
}

export function buildBetterAuthOptions(env: BackendEnv): BetterAuthOptions {
  const issuer = new URL(required(env, 'MARATONA_ZITADEL_ISSUER_URL'));
  const baseURL = new URL(required(env, 'BETTER_AUTH_URL'));
  for (const url of [issuer, baseURL]) {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('A origem de autenticação deve usar HTTPS, sem caminho ou credenciais.');
    }
  }
  return {
    // The local binding interface is intentionally narrower than Cloudflare's
    // full D1 type, which Better Auth accepts directly at runtime.
    database: env.DB as BetterAuthOptions['database'],
    secret: required(env, 'BETTER_AUTH_SECRET'),
    baseURL: baseURL.origin,
    basePath: '/api/auth',
    trustedOrigins: [baseURL.origin],
    onAPIError: { errorURL: `${baseURL.origin}/login?error=login_failed` },
    emailAndPassword: { enabled: false },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, requireLocalEmailVerified: true, trustedProviders: [] },
    },
    user: {
      validateUserInfo: ({ source }) => {
        if (source.oauth?.providerId === 'zitadel' && source.oauth.profile?.email_verified !== true) {
          return { error: 'email_not_verified', errorDescription: 'Verifique seu e-mail antes de entrar.' };
        }
      },
    },
    plugins: [genericOAuth({ config: [{
      providerId: 'zitadel',
      discoveryUrl: `${issuer.origin}/.well-known/openid-configuration`,
      clientId: required(env, 'MARATONA_ZITADEL_WEB_CLIENT_ID'),
      clientSecret: required(env, 'MARATONA_ZITADEL_WEB_CLIENT_SECRET'),
      tokenEndpointAuth: { method: 'client_secret_basic' },
      pkce: true,
      requireIdTokenVerification: true,
      requireEmailVerification: true,
      scopes: ['openid', 'profile', 'email', `urn:zitadel:iam:org:id:${required(env, 'MARATONA_ZITADEL_LOGIN_ORG_ID')}`],
      postLogoutRedirectURI: `${baseURL.origin}/`,
      mapProfileToUser: (profile) => ({ name: profile.name || String(profile.preferred_username || profile.email) }),
    }] })],
  };
}

export async function requireUser(
  request: Request,
  auth: AuthRuntime,
): Promise<AuthenticatedUser> {
  const session = await auth.getSession(request.headers);
  if (!session?.user?.id) {
    throw new HttpError(401, 'Autenticação necessária.', 'unauthorized');
  }
  return session.user;
}
