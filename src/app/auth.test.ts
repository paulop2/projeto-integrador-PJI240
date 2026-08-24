import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpAuthPort } from './auth';

afterEach(() => vi.restoreAllMocks());

describe('HTTP auth adapter', () => {
  it('uses Better Auth email endpoint with cookies', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ user: { id: 'u1', email: 'a@b.com', name: 'Ana' } }), { headers: { 'content-type': 'application/json' } }));
    await expect(httpAuthPort.signInEmail('a@b.com', 'password1')).resolves.toMatchObject({ id: 'u1' });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/sign-in/email', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ email: 'a@b.com', password: 'password1' });
  });

  it('surfaces Better Auth error messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'E-mail não verificado' }), { status: 403, headers: { 'content-type': 'application/json' } }));
    await expect(httpAuthPort.signInEmail('a@b.com', 'password1')).rejects.toThrow('E-mail não verificado');
  });

  it('uses the verification and password recovery endpoints', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: true }), { headers: { 'content-type': 'application/json' } }));
    await httpAuthPort.requestPasswordReset('a@b.com');
    await httpAuthPort.resetPassword('valid-token', 'new-password');
    await httpAuthPort.sendVerification('a@b.com');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/request-password-reset', '/api/auth/reset-password', '/api/auth/send-verification-email',
    ]);
    expect(JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body))).toEqual({ token: 'valid-token', newPassword: 'new-password' });
  });
});
