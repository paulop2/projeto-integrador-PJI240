/** Minimal Cloudflare bindings used by the backend, kept local to avoid making
 * the browser build depend on `@cloudflare/workers-types`. */
export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface BackendEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  MARATONA_ZITADEL_ISSUER_URL: string;
  MARATONA_ZITADEL_WEB_CLIENT_ID: string;
  MARATONA_ZITADEL_WEB_CLIENT_SECRET: string;
  MARATONA_ZITADEL_LOGIN_ORG_ID: string;
  MARATONA_ZITADEL_LOGIN_PAT: string;
  MARATONA_ZITADEL_MANAGEMENT_PAT: string;
  MARATONA_ZITADEL_GOOGLE_IDP_ID?: string;
}
