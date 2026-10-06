import { betterAuth } from 'better-auth';

import {
  buildBetterAuthOptions,
  type AuthRuntime,
} from '../src/server/auth';
import type { BackendEnv } from '../src/server/cloudflare';

export function createAuthRuntime(env: BackendEnv): AuthRuntime {
  // Better Auth 1.5+ auto-detects the D1 binding passed in `database`.
  const options = buildBetterAuthOptions(env);
  const sessionOptions = { ...options, plugins: [] };
  return {
    handler: async (request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/api/auth/get-session') {
        return betterAuth(sessionOptions).handler(request);
      }
      const runtime = betterAuth(options);
      if (pathname === '/api/auth/sign-out') {
        try {
          await runtime.$context;
        } catch {
          // Discovery can fail before the sign-out handler runs. Revoke the
          // local session even if provider logout is temporarily unavailable.
          return betterAuth(sessionOptions).handler(request);
        }
      }
      return runtime.handler(request);
    },
    getSession: async (headers) => {
      // Session validation uses only the signed cookie and D1. Avoid OIDC
      // discovery on every sync request and during identity provider outages.
      const session = await betterAuth(sessionOptions).api.getSession({ headers });
      if (!session) return null;
      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        },
      };
    },
  };
}
