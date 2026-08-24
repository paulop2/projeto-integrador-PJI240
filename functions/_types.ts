import type { BackendEnv } from '../src/server/cloudflare';

export interface PagesContext {
  request: Request;
  env: BackendEnv;
  params: Record<string, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
}

export type PagesHandler = (context: PagesContext) => Response | Promise<Response>;
