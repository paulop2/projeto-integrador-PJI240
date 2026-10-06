import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpAuthPort, httpLoginPort, redirectURL } from './auth';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());
describe('HTTP identity adapters', () => {
  it('initiates Zitadel OIDC with explicit return URLs and deferred redirect', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ url: 'javascript:invalid' }));
    await expect(httpAuthPort.signIn()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledWith('/api/auth/sign-in/social', expect.objectContaining({ credentials: 'include' }));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      provider: 'zitadel', callbackURL: new URL('/', window.location.origin).toString(),
      errorCallbackURL: new URL('/login?error=login_failed', window.location.origin).toString(), disableRedirect: true,
    });
  });
  it('uses cookie session and returns logout URL for deferred navigation', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ user: { id: 'u1', email: 'a@b.com', name: 'Ana' } })).mockResolvedValueOnce(json({ url: 'https://identity.example/logout' }));
    await expect(httpAuthPort.getSession()).resolves.toMatchObject({ id: 'u1' });
    await expect(httpAuthPort.signOut()).resolves.toBe('https://identity.example/logout');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/auth/get-session', '/api/auth/sign-out']);
    expect(fetcher).toHaveBeenCalledWith('/api/auth/sign-out', expect.objectContaining({ credentials: 'include', body: expect.stringContaining('disableRedirect') }));
  });
  it('sends password credentials only to Maratona with the identity request', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ url: 'https://maratona.example/api/auth/callback/zitadel' }));
    await expect(httpLoginPort.password('request-1', 'a@b.com', 'password1')).resolves.toEqual({ url: 'https://maratona.example/api/auth/callback/zitadel' });
    expect(fetcher).toHaveBeenCalledWith('/api/login/password', expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ authRequest: 'request-1', email: 'a@b.com', password: 'password1' }) }));
  });
  it('maps bounded errors without rendering upstream messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { code: 'invalid_login', message: 'INTERNAL SECRET' } }, 401));
    await expect(httpLoginPort.password('request-1', 'a@b.com', 'password1')).rejects.toThrow('E-mail ou senha incorretos');
  });
  it('supports the second authentication factor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ next: 'totp' })).mockResolvedValueOnce(json({ url: 'https://maratona.example/api/auth/callback/zitadel' }));
    await expect(httpLoginPort.password('r', 'a@b.com', 'password')).resolves.toEqual({ next: 'totp' });
    await expect(httpLoginPort.totp('r', '123456')).resolves.toContain('/callback/zitadel');
  });
  it('rejects executable redirect addresses', () => {
    expect(() => redirectURL({ url: 'javascript:alert(1)' })).toThrow();
  });
});
