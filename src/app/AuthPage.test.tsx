import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';
import { LoginError, type AuthPort, type LoginPort } from './auth';

const account = (): AuthPort => ({ getSession: vi.fn(), signIn: vi.fn().mockResolvedValue(undefined), signOut: vi.fn() });
const login = (): LoginPort => ({
  context: vi.fn().mockResolvedValue({ googleEnabled: true }),
  password: vi.fn().mockResolvedValue({ url: 'https://maratona.example/api/auth/callback/zitadel' }),
  totp: vi.fn().mockResolvedValue('https://maratona.example/api/auth/callback/zitadel'),
  register: vi.fn().mockResolvedValue(undefined), verify: vi.fn().mockResolvedValue(undefined),
  resend: vi.fn().mockResolvedValue(undefined), forgot: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn().mockResolvedValue(undefined), google: vi.fn().mockResolvedValue('https://accounts.google.com/'),
});
const open = (query = '?authRequest=request-1') => window.history.replaceState({}, '', `/login${query}`);
afterEach(() => { window.history.replaceState({}, '', '/'); vi.restoreAllMocks(); });

describe('Maratona identity screens', () => {
  it('restarts OIDC without collecting credentials when no request is present', async () => {
    open(''); const authPort = account(); const loginPort = login();
    render(<AuthPage authPort={authPort} loginPort={loginPort} />);
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar acesso' }));
    expect(authPort.signIn).toHaveBeenCalledOnce(); expect(loginPort.context).not.toHaveBeenCalled();
  });
  it('does not trust an invalid request or render callback error descriptions', async () => {
    open('?authRequest=expired&error=evil&error_description=SECRET');
    const loginPort = login(); vi.mocked(loginPort.context).mockRejectedValue(new LoginError('invalid_auth_request'));
    render(<AuthPage loginPort={loginPort} authPort={account()} />);
    await screen.findByRole('button', { name: 'Iniciar acesso' });
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SECRET');
    expect(screen.getByRole('alert')).toHaveTextContent('expirou');
  });
  it('preserves entered credentials after an error and follows the callback only after success', async () => {
    open(); const loginPort = login(); const onNavigate = vi.fn();
    vi.mocked(loginPort.password).mockRejectedValueOnce(new LoginError('invalid_login')).mockResolvedValueOnce({ url: 'https://maratona.example/callback' });
    render(<AuthPage loginPort={loginPort} onNavigate={onNavigate} />);
    await screen.findByLabelText('E-mail');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /^Entrar$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos');
    expect(screen.getByLabelText('Senha')).toHaveValue('password1'); expect(onNavigate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^Entrar$/ }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('https://maratona.example/callback'));
  });
  it('shows registration and recovery confirmations without revealing account existence', async () => {
    open(); const loginPort = login(); render(<AuthPage loginPort={loginPort} />);
    await screen.findByLabelText('E-mail');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getByRole('heading')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Se o cadastro');
    expect(loginPort.register).toHaveBeenCalledWith('request-1', 'Ana', 'ana@example.com', 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para entrar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci a senha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Se a conta existir');
    expect(loginPort.forgot).toHaveBeenCalledWith('request-1', 'ana@example.com');
  });
  it('verifies email links without an auth request and offers a fresh login', async () => {
    open('?mode=verify&userId=u1&code=valid-code'); const loginPort = login(); const authPort = account();
    render(<AuthPage loginPort={loginPort} authPort={authPort} />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar e-mail' }));
    expect(await screen.findByRole('status')).toHaveTextContent('E-mail verificado');
    expect(loginPort.verify).toHaveBeenCalledWith('u1', 'valid-code');
    expect(loginPort.context).not.toHaveBeenCalled(); expect(window.location.search).not.toContain('code');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar na minha conta' })); expect(authPort.signIn).toHaveBeenCalledOnce();
  });
  it('resets a password from an email link independently of the old OIDC request', async () => {
    open('?mode=reset&userId=u1&code=valid-code&authRequest=expired'); const loginPort = login();
    render(<AuthPage loginPort={loginPort} />);
    await userEvent.type(screen.getByLabelText('Nova senha', { selector: 'input' }), 'new-password1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada');
    expect(loginPort.reset).toHaveBeenCalledWith('u1', 'valid-code', 'new-password1'); expect(loginPort.context).not.toHaveBeenCalled();
  });
  it('handles missing and expired email codes without submitting incomplete links', async () => {
    open('?mode=verify&userId=u1'); const loginPort = login();
    render(<AuthPage loginPort={loginPort} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Link inválido ou incompleto');
    expect(loginPort.verify).not.toHaveBeenCalled();
  });
  it('completes the second factor inside Maratona and disables forms offline', async () => {
    open(); const loginPort = login(); const onNavigate = vi.fn();
    vi.mocked(loginPort.password).mockResolvedValue({ next: 'totp' });
    vi.mocked(loginPort.totp).mockRejectedValueOnce(new LoginError('invalid_login')).mockResolvedValueOnce('https://maratona.example/api/auth/callback/zitadel');
    render(<AuthPage loginPort={loginPort} onNavigate={onNavigate} />);
    await screen.findByLabelText('E-mail');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /^Entrar$/ }));
    await screen.findByLabelText('Código de segurança', { selector: 'input' });
    expect(screen.getByRole('heading')).toHaveFocus();
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('button', { name: 'Confirmar código' })).toBeDisabled();
    act(() => window.dispatchEvent(new Event('online')));
    await userEvent.type(screen.getByLabelText('Código de segurança', { selector: 'input' }), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código de segurança incorreto');
    expect(screen.getByLabelText('Código de segurança', { selector: 'input' })).toHaveValue('123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar código' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalled()); expect(loginPort.totp).toHaveBeenCalledWith('request-1', '123456');
  });
  it('offers a new link when email verification has expired', async () => {
    open('?mode=verify&userId=u1&code=expired'); const loginPort = login();
    vi.mocked(loginPort.verify).mockRejectedValue(new LoginError('invalid_code'));
    render(<AuthPage loginPort={loginPort} />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar e-mail' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('inválido ou expirou');
    await userEvent.click(screen.getByRole('button', { name: 'Solicitar novo link' }));
    expect(screen.getByRole('button', { name: 'Iniciar acesso' })).toBeInTheDocument();
  });
  it('disables input while login is pending and follows Google only after the API response', async () => {
    open(); const loginPort = login(); const onNavigate = vi.fn();
    let finish!: (value: string) => void;
    vi.mocked(loginPort.google).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<AuthPage loginPort={loginPort} onNavigate={onNavigate} />);
    await screen.findByLabelText('E-mail');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }));
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(onNavigate).not.toHaveBeenCalled();
    await act(async () => finish('https://accounts.google.com/'));
    expect(onNavigate).toHaveBeenCalledWith('https://accounts.google.com/');
  });
  it('shows Google only when the server enables it', async () => {
    open(); const loginPort = login(); vi.mocked(loginPort.context).mockResolvedValue({ googleEnabled: false });
    render(<AuthPage loginPort={loginPort} />); await screen.findByLabelText('E-mail');
    expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument();
  });
});
