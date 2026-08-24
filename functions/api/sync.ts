import { requireUser } from '../../src/server/auth';
import { D1SyncRepository } from '../../src/server/d1-sync-repository';
import { errorResponse, json, readJson } from '../../src/server/http';
import { synchronize } from '../../src/server/sync-service';
import type { PagesHandler } from '../_types';
import { createAuthRuntime } from '../_auth-runtime';

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  try {
    const auth = createAuthRuntime(env);
    const user = await requireUser(request, auth);
    const body = await readJson(request);
    const response = await synchronize(user.id, body, new D1SyncRepository(env.DB));
    return json(response);
  } catch (error) {
    return errorResponse(error);
  }
};
