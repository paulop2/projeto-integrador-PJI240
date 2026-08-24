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

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

async function sendResendEmail(
  env: BackendEnv,
  message: { to: string; subject: string; action: string; url: string },
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${required(env, 'RESEND_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: required(env, 'RESEND_FROM'),
      to: [message.to],
      subject: message.subject,
      html: `<p>${escapeHtml(message.action)}</p><p><a href="${escapeHtml(message.url)}">Continuar</a></p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend recusou o envio (${response.status})`);
  }
}

export function buildBetterAuthOptions(env: BackendEnv): Record<string, unknown> {
  return {
    database: env.DB,
    secret: required(env, 'BETTER_AUTH_SECRET'),
    baseURL: required(env, 'BETTER_AUTH_URL'),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendResendEmail(env, {
          to: user.email,
          subject: 'Redefina sua senha',
          action: 'Use o link abaixo para redefinir sua senha.',
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendResendEmail(env, {
          to: user.email,
          subject: 'Verifique seu e-mail',
          action: 'Use o link abaixo para verificar seu e-mail.',
          url,
        });
      },
    },
    socialProviders: {
      google: {
        clientId: required(env, 'GOOGLE_CLIENT_ID'),
        clientSecret: required(env, 'GOOGLE_CLIENT_SECRET'),
      },
    },
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
