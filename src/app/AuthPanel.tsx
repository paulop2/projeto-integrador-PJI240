import { useState, type FormEvent } from 'react';

import type { AuthUser } from './auth';
import { useModalDialog } from './useModalDialog';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify';

interface Props {
  user: AuthUser | null;
  initialMode?: AuthMode;
  busy: boolean;
  error: string | null;
  message: string | null;
  online: boolean;
  onClose: () => void;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (name: string, email: string, password: string) => Promise<void>;
  onGoogle: () => Promise<void>;
  onLogout: () => Promise<void>;
  onForgot: (email: string) => Promise<void>;
  onReset: (password: string) => Promise<void>;
  onVerify: (email: string) => Promise<void>;
}

const titles: Record<AuthMode, string> = { login: 'Entrar', signup: 'Criar conta', forgot: 'Recuperar senha', reset: 'Nova senha', verify: 'Verificar e-mail' };

export function AuthPanel({ user, initialMode = 'login', busy, error, message, online, onClose, onEmailLogin, onSignUp, onGoogle, onLogout, onForgot, onReset, onVerify }: Props) {
  const dialogRef = useModalDialog(onClose);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'login') await onEmailLogin(email, password);
    if (mode === 'signup') await onSignUp(name, email, password);
    if (mode === 'forgot') await onForgot(email);
    if (mode === 'reset') await onReset(password);
    if (mode === 'verify') await onVerify(email);
  };

  return (
    <section ref={dialogRef} className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title" tabIndex={-1}>
      <div className="stats-heading">
        <div><span className="eyebrow">Conta opcional</span><h2 id="auth-title">{user ? 'Sua conta' : titles[mode]}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar conta" data-autofocus>×</button>
      </div>
      {!online && <p className="auth-notice" role="status">Você está offline. Continue estudando; o login estará disponível quando a conexão voltar.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-success" role="status">{message}</p>}

      {user ? <div className="account-card">
        <span className="account-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
        <div><strong>{user.name}</strong><span>{user.email}</span></div>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => void onLogout()}>Sair</button>
      </div> : <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {mode === 'signup' && <label>Nome<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></label>}
        {mode !== 'reset' && <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
        {(mode === 'login' || mode === 'signup' || mode === 'reset') && <label>{mode === 'reset' ? 'Nova senha' : 'Senha'}<input type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        <button className="primary-button" disabled={busy || !online}>{busy ? 'Aguarde…' : titles[mode]}</button>
        {mode === 'login' && <button className="google-button" type="button" disabled={busy || !online} onClick={() => void onGoogle()}><span aria-hidden="true">G</span> Continuar com Google</button>}
        <nav className="auth-links" aria-label="Outras opções de conta">
          {mode !== 'login' && <button type="button" onClick={() => setMode('login')}>Voltar para entrar</button>}
          {mode === 'login' && <><button type="button" onClick={() => setMode('signup')}>Criar conta</button><button type="button" onClick={() => setMode('forgot')}>Esqueci a senha</button><button type="button" onClick={() => setMode('verify')}>Reenviar verificação</button></>}
        </nav>
      </form>}
    </section>
  );
}
