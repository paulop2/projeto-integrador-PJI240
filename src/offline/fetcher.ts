export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Native fetch needs its browser/worker global as receiver in some engines. */
export function invokeFetch(fetcher: Fetcher, input: RequestInfo | URL, init?: RequestInit) {
  return Reflect.apply(fetcher, globalThis, [input, init]) as Promise<Response>;
}
