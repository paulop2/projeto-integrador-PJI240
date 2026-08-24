import { requireUser } from '../../../src/server/auth';
import { D1StatsRepository } from '../../../src/server/d1-stats-repository';
import { errorResponse, json } from '../../../src/server/http';
import { getStats } from '../../../src/server/stats-service';
import type { PagesHandler } from '../../_types';
import { createAuthRuntime } from '../../_auth-runtime';

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  try {
    const auth = createAuthRuntime(env);
    const user = await requireUser(request, auth);
    const url = new URL(request.url);
    const rawFilter: Record<string, string> = {};
    const examId = url.searchParams.get('examId');
    const subjectId = url.searchParams.get('subjectId');
    if (examId !== null) rawFilter.examId = examId;
    if (subjectId !== null) rawFilter.subjectId = subjectId;
    return json(await getStats(user.id, rawFilter, new D1StatsRepository(env.DB)));
  } catch (error) {
    return errorResponse(error);
  }
};
