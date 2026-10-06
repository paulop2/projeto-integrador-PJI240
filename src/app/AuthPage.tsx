import { useEffect, useRef, useState, type FormEvent } from 'react';

import { httpAuthPort, httpLoginPort, LoginError, type AuthPort, type LoginPort } from './auth';
import { applyTheme, initialTheme, watchSystemTheme } from './theme';

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify' | 'resend' | 'totp';
const titles: Record<Mode, string> = { totp: 'Código de segurança', login: 'Entrar na Maratona', signup: 'Criar conta', forgot: 'Recuperar senha', reset: 'Nova senha', verify: 'Verificar e-mail', resend: 'Reenviar verificação' };
const descriptions: Record<Mode, string> = {
  totp: 'Informe o código de seis dígitos do seu aplicativo autenticador.',
  login: 'Entre para sincronizar seu progresso entre dispositivos.',
  signup: 'Crie sua conta e confirme seu e-mail para salvar seu progresso.',
  forgot: 'Informe seu e-mail para receber um link de recuperação.',
  reset: 'Escolha uma nova senha para sua conta.',
  verify: 'Confirme seu e-mail para continuar estudando com sua conta.',
  resend: 'Informe seu e-mail para receber outro link de verificação.',
};
const navigate = (url: string) => window.location.assign(url);
interface Props { loginPort?: LoginPort; authPort?: AuthPort; onNavigate?: (url: string) => void }

export function AuthPage({ loginPort = httpLoginPort, authPort = httpAuthPort, onNavigate = navigate }: Props) {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const authRequest = params.get('authRequest') ?? '';
  const userId = params.get('userId') ?? '';
  const code = params.get('code') ?? '';
  const [mode, setMode] = useState<Mode>(() => {
    const requested = params.get('mode');
    return requested === 'verify' || requested === 'reset' || requested === 'signup' || requested === 'totp' ? requested : 'login';
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [context, setContext] = useState<{ googleEnabled: boolean } | null>(null);
  const [loading, setLoading] = useState(Boolean(authRequest) && mode !== 'verify' && mode !== 'reset');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => params.has('error') ? 'Não foi possível concluir o login. Reinicie o acesso para tentar novamente.' : null);
  const [expired, setExpired] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionInFlight = useRef(false);
  const theme = useRef(initialTheme());

  useEffect(() => {
    applyTheme(theme.current);
    return theme.current === 'system' ? watchSystemTheme(window, () => applyTheme('system')) : undefined;
  }, []);
  useEffect(() => {
    const reconnect = () => setOnline(true);
    const disconnect = () => setOnline(false);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', disconnect);
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('offline', disconnect); };
  }, []);
  useEffect(() => { headingRef.current?.focus(); }, [mode]);
  useEffect(() => {
    if (mode === 'verify' || mode === 'reset') { setLoading(false); return; }
    if (!authRequest || !online) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    void loginPort.context(authRequest).then((value) => {
      if (active) { setContext(value); setExpired(false); }
    }).catch((reason: unknown) => {
      if (active) {
        setContext(null);
        setError(reason instanceof LoginError ? reason.message : 'Não foi possível carregar o acesso. Reinicie o login para tentar novamente.');
        setExpired(reason instanceof LoginError && reason.code === 'invalid_auth_request');
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authRequest, loginPort, online, mode]);

  const changeMode = (next: Mode) => {
    if (busy) return;
    setMode(next); setError(null); setMessage(null); setPassword(''); setTotpCode(''); setCompleted(false); setInvalidLink(false);
  };
  const run = async (action: () => Promise<void>) => {
    if (actionInFlight.current || !online) return;
    actionInFlight.current = true;
    setBusy(true); setError(null); setMessage(null);
    try { await action(); }
    catch (reason) {
      setError(mode === 'totp' && reason instanceof LoginError && (reason.code === 'invalid_login' || reason.code === 'invalid_code')
        ? 'Código de segurança incorreto ou expirado. Confira o autenticador e tente novamente.'
        : reason instanceof LoginError ? reason.message : 'Não foi possível concluir esta ação. Confira sua conexão e tente novamente.');
      if (reason instanceof LoginError && reason.code === 'invalid_code') setInvalidLink(true);
      if (reason instanceof LoginError && reason.code === 'invalid_auth_request') { setExpired(true); setContext(null); }
    } finally { actionInFlight.current = false; setBusy(false); }
  };
  const finishLink = (text: string) => {
    setPassword(''); setCompleted(true); setMessage(text);
    const clean = new URL(window.location.href);
    clean.searchParams.delete('userId'); clean.searchParams.delete('code');
    window.history.replaceState({}, '', `${clean.pathname}${clean.search}`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const linkMode = mode === 'verify' || mode === 'reset';
    if (completed || (linkMode ? !userId || !code : !context || expired)) return;
    void run(async () => {
      if (mode === 'login') {
        const result = await loginPort.password(authRequest, email, password);
        setPassword('');
        if ('next' in result) { setMode('totp'); setTotpCode(''); }
        else onNavigate(result.url);
      }
      if (mode === 'totp') onNavigate(await loginPort.totp(authRequest, totpCode));
      if (mode === 'signup') {
        await loginPort.register(authRequest, name, email, password);
        setPassword(''); setMessage('Se o cadastro puder ser concluído, enviaremos um link de verificação para seu e-mail. Confira também a pasta de spam.');
      }
      if (mode === 'forgot') {
        await loginPort.forgot(authRequest, email);
        setMessage('Se a conta existir, enviaremos um link para redefinir a senha. Confira também a pasta de spam.');
      }
      if (mode === 'resend') {
        await loginPort.resend(authRequest, email);
        setMessage('Se houver uma verificação pendente, enviaremos um novo link para seu e-mail.');
      }
      if (mode === 'verify') { await loginPort.verify(userId, code); finishLink('E-mail verificado. Você já pode entrar na sua conta.'); }
      if (mode === 'reset') { await loginPort.reset(userId, code, password); finishLink('Senha alterada. Você já pode entrar com a nova senha.'); }
    });
  };
  const missingLink = (mode === 'verify' || mode === 'reset') && (!userId || !code || invalidLink);
  const linkMode = mode === 'verify' || mode === 'reset';
  const ready = linkMode || Boolean(context) && !expired;
  const disabled = busy || loading || !online;
  const restart = !linkMode && (!authRequest || expired || (!loading && !context && online));

  return <div className="auth-page">
    <header className="auth-page-header">
      <a className="brand" href="/" aria-label="Maratona — voltar a estudar"><span className="brand-mark" aria-hidden="true">M</span><span>maratona</span></a>
      <a className="auth-back-link" href="/">Continuar estudando</a>
    </header>
    <main className="auth-page-main">
      <section className="auth-page-content" aria-labelledby="login-title" aria-busy={busy || loading}>
        <h1 id="login-title" tabIndex={-1} ref={headingRef}>{titles[mode]}</h1>
        <p className="auth-description">{descriptions[mode]}</p>
        {!online && <p className="auth-notice" role="status">Você está offline. Reconecte para acessar sua conta. Suas provas continuam disponíveis para estudar.</p>}
        {loading && <p className="auth-notice" role="status">Preparando seu acesso…</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message}</p>}
        {restart ? <div className="auth-form">
          {!error && <p className="auth-notice">Inicie um novo acesso para entrar ou criar sua conta.</p>}
          <button className="primary-button" disabled={disabled} onClick={() => void run(() => authPort.signIn())}>{busy ? 'Aguarde…' : 'Iniciar acesso'}</button>
        </div> : ready && <>
          {missingLink && !completed ? <div className="auth-form">
            {!error && <p className="auth-error" role="alert">Link inválido ou incompleto. Solicite um novo link para continuar.</p>}
            <button className="secondary-button" disabled={disabled} onClick={() => changeMode(mode === 'verify' ? 'resend' : 'forgot')}>Solicitar novo link</button>
          </div> : !completed && <form className="auth-form" onSubmit={submit}>
            <fieldset disabled={disabled}>
              {mode === 'signup' && <label>Nome<input autoComplete="name" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} /></label>}
              {mode !== 'reset' && mode !== 'verify' && mode !== 'totp' && <label>E-mail<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
              {(mode === 'login' || mode === 'signup' || mode === 'reset') && <label>{mode === 'reset' ? 'Nova senha' : 'Senha'}<input type="password" minLength={mode === 'login' ? undefined : 8} maxLength={200} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-describedby={mode === 'login' ? undefined : 'password-hint'} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
              {mode === 'totp' && <label>Código de segurança<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/[^0-9]/g, ''))} /></label>}
              {(mode === 'signup' || mode === 'reset') && <p id="password-hint" className="auth-password-hint">Use pelo menos 8 caracteres. Combine letras, números e símbolos.</p>}
              <button className="primary-button">{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'reset' ? 'Salvar nova senha' : mode === 'forgot' ? 'Enviar link de recuperação' : mode === 'totp' ? 'Confirmar código' : titles[mode]}</button>
              {mode === 'login' && context?.googleEnabled && <button className="google-button" type="button" onClick={() => void run(async () => onNavigate(await loginPort.google(authRequest)))}>Continuar com Google</button>}
            </fieldset>
          </form>}
          {completed && <button className="primary-button auth-fresh-login" disabled={disabled} onClick={() => void run(() => authPort.signIn())}>Entrar na minha conta</button>}
          {!completed && <nav className="auth-links" aria-label="Outras opções de conta">
            {mode !== 'login' && <button disabled={disabled} onClick={() => changeMode('login')}>Voltar para entrar</button>}
            {mode === 'login' && <><button disabled={disabled} onClick={() => changeMode('signup')}>Criar conta</button><button disabled={disabled} onClick={() => changeMode('forgot')}>Esqueci a senha</button><button disabled={disabled} onClick={() => changeMode('resend')}>Reenviar verificação</button></>}
          </nav>}
        </>}
      </section>
      <p className="auth-page-footer">Sua conta é opcional. Você pode continuar estudando offline.</p>
    </main>
  </div>;
}
