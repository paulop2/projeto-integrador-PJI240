import type { AuthUser } from './auth';
import { useModalDialog } from './useModalDialog';

interface Props {
  user: AuthUser | null;
  busy: boolean;
  error: string | null;
  message: string | null;
  online: boolean;
  onClose: () => void;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
}
export function AuthPanel({ user, busy, error, message, online, onClose, onLogin, onLogout }: Props) {
  const dialogRef = useModalDialog(onClose);
  return (
    <section ref={dialogRef} className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title" tabIndex={-1}>
      <div className="stats-heading">
        <h2 id="auth-title">{user ? 'Sua conta' : 'Entrar na Maratona'}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fechar conta" data-autofocus>×</button>
      </div>
      {!online && <p className="auth-notice" role="status">Você está offline. Continue estudando; o login estará disponível quando a conexão voltar.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-success" role="status">{message}</p>}
      {user ? <div className="account-card">
        <span className="account-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
        <div><strong>{user.name}</strong><span>{user.email}</span></div>
        <button className="secondary-button" type="button" disabled={busy || !online} onClick={() => void onLogout()}>Sair</button>
      </div> : <div className="auth-form">
        <p className="auth-description">Salve seu progresso e continue em outro dispositivo. A conta é opcional para estudar offline.</p>
        <button className="primary-button" type="button" disabled={busy || !online} onClick={() => void onLogin()}>{busy ? 'Aguarde…' : 'Entrar ou criar conta'}</button>
      </div>}
    </section>
  );
}
