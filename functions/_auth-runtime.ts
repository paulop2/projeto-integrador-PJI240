import { betterAuth } from 'better-auth';

import {
  buildBetterAuthOptions,
  type AuthRuntime,
} from '../src/server/auth';
import type { BackendEnv } from '../src/server/cloudflare';

export function createAuthRuntime(env: BackendEnv): AuthRuntime {
  // Better Auth 1.5+ auto-detects the D1 binding passed in `database`.
  const auth = betterAuth(buildBetterAuthOptions(env) as never);
  return {
    handler: (request) => auth.handler(request),
    getSession: async (headers) => {
      const session = await auth.api.getSession({ headers });
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
