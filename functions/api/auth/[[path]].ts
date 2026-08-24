import { createAuthRuntime } from '../../_auth-runtime';
import { errorResponse } from '../../../src/server/http';
import type { PagesHandler } from '../../_types';

export const onRequest: PagesHandler = async ({ request, env }) => {
  try {
    const auth = await createAuthRuntime(env);
    return await auth.handler(request);
  } catch (error) {
    return errorResponse(error);
  }
};
