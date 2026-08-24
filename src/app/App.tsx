import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { QUESTION_TIME_LIMIT_MS } from '../contracts';
import type { ProgressEvent, Question } from '../contracts';
import { offlineRuntime } from '../offline/runtime';
import { demoQuestions } from './demoQuestions';
import type { PackagePort, PackageSummary, ProgressPort, QuestionSourcePort, StudySessionPort } from './ports';
import { calculateStats, localDay, makeId, outcomeFor, type LocalRecord } from './progress';
import { QuestionFeed } from './QuestionFeed';
import type { QuestionSession } from './QuestionCard';
import { StatsPanel } from './StatsPanel';
import { AuthPanel, type AuthMode } from './AuthPanel';
import { httpAuthPort, type AuthPort, type AuthUser } from './auth';

const DEVICE_ID = makeId();
interface AccountRuntime {
  coordinator: { start(): void; stop(): void } | undefined;
  sync(): Promise<boolean>;
  clear(): Promise<void>;
}
const accountRuntime: AccountRuntime = {
  coordinator: offlineRuntime.syncCoordinator,
  sync: () => offlineRuntime.syncQueue.flush(),
  clear: async () => { await offlineRuntime.clearAccountProgress(); await offlineRuntime.storage.clearSessions(); },
};

export function App({
  progressPort = offlineRuntime.progressPort,
  sessionPort = offlineRuntime.sessionPort,
  questionSource = offlineRuntime.questionSource,
  packagePort = offlineRuntime.packagePort,
  authPort = httpAuthPort,
  authRuntime = accountRuntime,
}: { progressPort?: ProgressPort; sessionPort?: StudySessionPort; questionSource?: QuestionSourcePort; packagePort?: PackagePort; authPort?: AuthPort; authRuntime?: AccountRuntime }) {
  const [questions, setQuestions] = useState<Question[]>(demoQuestions);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sessions, setSessions] = useState<Record<string, QuestionSession>>({});
  const [sessionsReady, setSessionsReady] = useState(false);
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [subject, setSubject] = useState('all');
  const [exam, setExam] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get('token'), []);
  const initialAuthMode: AuthMode = resetToken ? 'reset' : 'login';
  const [authOpen, setAuthOpen] = useState(Boolean(resetToken));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(() => new URLSearchParams(window.location.search).has('verified') ? 'E-mail verificado. Você já pode entrar.' : null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'pending'>('idle');
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [packageBusy, setPackageBusy] = useState<string | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const viewedKeys = useRef(new Set<string>());
  const terminalQuestions = useRef(new Set<string>());
  const authProbeGeneration = useRef(0);
  const authProbeInFlight = useRef<{ port: AuthPort; source: 'boot' | 'online'; promise: Promise<void> } | null>(null);
  const loggingOut = useRef(false);
  const authenticatedUser = useRef<AuthUser | null>(null);

  const probeSession = useCallback((source: 'boot' | 'online' = 'boot'): Promise<void> => {
    if (loggingOut.current) return Promise.resolve();
    const current = authProbeInFlight.current;
    if (current?.port === authPort && (source === 'boot' || current.source === 'online')) return current.promise;
    const generation = ++authProbeGeneration.current;
    setAuthBusy(true);
    let promise: Promise<void>;
    promise = authPort.getSession().then((user) => {
      if (generation !== authProbeGeneration.current) return;
      const sessionWasAlreadyActive = user !== null && authenticatedUser.current?.id === user.id;
      authenticatedUser.current = user;
      setAuthUser((existing) => existing?.id === user?.id ? existing : user);
      setAuthError(null);
      if (source === 'online' && sessionWasAlreadyActive) {
        setSyncStatus('syncing');
        void authRuntime.sync().then((success) => {
          if (generation === authProbeGeneration.current) setSyncStatus(success ? 'synced' : 'pending');
        }).catch(() => { if (generation === authProbeGeneration.current) setSyncStatus('pending'); });
      }
    }).catch((error: unknown) => {
      if (generation === authProbeGeneration.current) setAuthError(error instanceof Error ? error.message : 'Não foi possível consultar sua conta.');
    }).finally(() => {
      if (authProbeInFlight.current?.promise === promise) authProbeInFlight.current = null;
      if (generation === authProbeGeneration.current) setAuthBusy(false);
    });
    authProbeInFlight.current = { port: authPort, source, promise };
    return promise;
  }, [authPort, authRuntime]);

  useEffect(() => { void offlineRuntime.prepareStorage(); }, []);
  useEffect(() => {
    void probeSession();
  }, [probeSession]);
  useEffect(() => {
    if (!authUser) return;
    authRuntime.coordinator?.start();
    setSyncStatus('syncing');
    void authRuntime.sync().then((success) => setSyncStatus(success ? 'synced' : 'pending')).catch(() => setSyncStatus('pending'));
    return () => authRuntime.coordinator?.stop();
  }, [authRuntime, authUser]);
  const reloadQuestions = useCallback(async () => {
    if (!questionSource) return;
    const loaded = await questionSource.load();
    setQuestions(loaded.length ? loaded : demoQuestions);
  }, [questionSource]);
  useEffect(() => { void reloadQuestions(); }, [reloadQuestions]);
  useEffect(() => {
    let active = true;
    const byId = new Map(questions.map((question) => [question.id, question]));
    void progressPort.list().then((events) => {
      if (!active) return;
      viewedKeys.current = new Set(events.filter((event) => event.type === 'question_viewed').map((event) => `${event.questionId}:${event.localDay}`));
      setRecords(events.map((event) => ({
        event,
        outcome: event.type === 'question_timed_out' ? 'timed_out' : event.type === 'question_answered' && byId.has(event.questionId) ? outcomeFor(byId.get(event.questionId)!, event.selectedOptionId) : null,
      })));
    });
    return () => { active = false; };
  }, [progressPort, questions]);
  useEffect(() => {
    if (!packagePort) return;
    void packagePort.list().then(setPackages).catch((error: unknown) => setPackageError(error instanceof Error ? error.message : String(error)));
  }, [packagePort]);
  useEffect(() => { void sessionPort.load().then((stored) => {
    setSessions(stored);
    terminalQuestions.current = new Set(Object.entries(stored).filter(([, session]) => session.outcome !== null).map(([id]) => id));
    setSessionsReady(true);
  }); }, [sessionPort]);
  useEffect(() => {
    const update = (event: Event) => {
      const isOnline = event.type === 'online';
      setOnline(isOnline);
      if (isOnline) void probeSession('online');
    };
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, [probeSession]);

  const subjects = useMemo(() => [...new Set(questions.map(({ subjectId }) => subjectId))].sort(), [questions]);
  const exams = useMemo(() => [...new Set(questions.map(({ examId }) => examId))].sort(), [questions]);
  const filtered = useMemo(() => questions.filter((question) =>
    (subject === 'all' || question.subjectId === subject) && (exam === 'all' || question.examId === exam),
  ), [exam, questions, subject]);
  useEffect(() => setActiveIndex(0), [exam, subject]);

  const record = useCallback((event: ProgressEvent, outcome: LocalRecord['outcome']) => {
    setRecords((current) => [...current, { event, outcome }]);
    void progressPort.append(event).then(async () => {
      if (!authUser || !navigator.onLine) return;
      setSyncStatus('syncing');
      const success = await authRuntime.sync();
      setSyncStatus(success ? 'synced' : 'pending');
    }).catch(() => setSyncStatus('pending'));
  }, [authRuntime, authUser, progressPort]);

  const onStart = useCallback((questionId: string) => {
    setSessions((current) => {
      if (current[questionId]?.startedAt) return current;
      const session = { startedAt: Date.now(), selectedOptionId: null, outcome: null };
      void sessionPort.save(questionId, session);
      return { ...current, [questionId]: session };
    });
  }, [sessionPort]);

  const onAnswer = useCallback((question: Question, optionId: string, elapsedMs: number) => {
    if (terminalQuestions.current.has(question.id)) return;
    terminalQuestions.current.add(question.id);
    const outcome = outcomeFor(question, optionId);
    const session = { startedAt: sessions[question.id]?.startedAt ?? Date.now(), selectedOptionId: optionId, outcome };
    void sessionPort.save(question.id, session);
    setSessions((current) => current[question.id]?.outcome ? current : {
      ...current, [question.id]: session,
    });
    record({ type: 'question_answered', eventId: makeId(), deviceId: DEVICE_ID, questionId: question.id, occurredAt: Date.now(), selectedOptionId: optionId, elapsedMs }, outcome);
  }, [record, sessionPort, sessions]);

  const onTimeout = useCallback((question: Question) => {
    if (terminalQuestions.current.has(question.id)) return;
    terminalQuestions.current.add(question.id);
    const session = { startedAt: sessions[question.id]?.startedAt ?? Date.now() - QUESTION_TIME_LIMIT_MS, selectedOptionId: null, outcome: 'timed_out' as const };
    void sessionPort.save(question.id, session);
    setSessions((current) => {
      if (current[question.id]?.outcome) return current;
      return { ...current, [question.id]: session };
    });
    record({ type: 'question_timed_out', eventId: makeId(), deviceId: DEVICE_ID, questionId: question.id, occurredAt: Date.now(), elapsedMs: QUESTION_TIME_LIMIT_MS }, 'timed_out');
  }, [record, sessionPort, sessions]);

  const onViewed = useCallback((question: Question) => {
    const day = localDay(Date.now());
    const key = `${question.id}:${day}`;
    if (viewedKeys.current.has(key)) return;
    viewedKeys.current.add(key);
    record({ type: 'question_viewed', eventId: makeId(), deviceId: DEVICE_ID, questionId: question.id, occurredAt: Date.now(), localDay: day }, null);
  }, [record]);

  const stats = useMemo(() => calculateStats(records, questions), [questions, records]);

  const authAction = useCallback(async (action: () => Promise<void>) => {
    setAuthBusy(true); setAuthError(null); setAuthMessage(null);
    try { await action(); } catch (error) { setAuthError(error instanceof Error ? error.message : String(error)); }
    finally { setAuthBusy(false); }
  }, []);
  const emailLogin = useCallback((email: string, password: string) => authAction(async () => {
    const user = await authPort.signInEmail(email, password) ?? await authPort.getSession();
    if (!user) throw new Error('A sessão não foi iniciada. Verifique seu e-mail e senha.');
    authProbeGeneration.current += 1; authProbeInFlight.current = null;
    authenticatedUser.current = user;
    setAuthUser(user); setAuthMessage('Conta conectada. Sincronizando seu progresso…');
  }), [authAction, authPort]);
  const signUp = useCallback((name: string, email: string, password: string) => authAction(async () => {
    await authPort.signUpEmail(name, email, password);
    setAuthMessage('Conta criada. Enviamos um link de verificação para seu e-mail.');
  }), [authAction, authPort]);
  const googleLogin = useCallback(() => authAction(() => authPort.signInGoogle()), [authAction, authPort]);
  const forgotPassword = useCallback((email: string) => authAction(async () => {
    await authPort.requestPasswordReset(email); setAuthMessage('Se a conta existir, enviaremos um link para redefinir a senha.');
  }), [authAction, authPort]);
  const resetPassword = useCallback((password: string) => authAction(async () => {
    if (!resetToken) throw new Error('Link de recuperação inválido ou incompleto.');
    await authPort.resetPassword(resetToken, password); setAuthMessage('Senha alterada. Você já pode entrar.');
    window.history.replaceState({}, '', '/');
  }), [authAction, authPort, resetToken]);
  const resendVerification = useCallback((email: string) => authAction(async () => {
    await authPort.sendVerification(email); setAuthMessage('Enviamos um novo link de verificação.');
  }), [authAction, authPort]);
  const logout = useCallback(() => authAction(async () => {
    loggingOut.current = true;
    authProbeGeneration.current += 1; authProbeInFlight.current = null;
    try {
      authRuntime.coordinator?.stop();
      await authPort.signOut();
      await authRuntime.clear();
      authenticatedUser.current = null;
      setAuthUser(null); setRecords([]); setSessions({}); setSyncStatus('idle');
      terminalQuestions.current.clear(); viewedKeys.current.clear();
      setAuthMessage('Você saiu. As provas baixadas continuam disponíveis.');
    } finally { loggingOut.current = false; }
  }), [authAction, authPort, authRuntime]);

  const changePackage = useCallback(async (item: PackageSummary) => {
    if (!packagePort) return;
    setPackageBusy(item.id); setPackageError(null);
    try {
      if (item.state === 'downloaded') await packagePort.remove(item.id);
      else await packagePort.install(item.id);
      setPackages(await packagePort.list());
      await reloadQuestions();
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : String(error));
    } finally { setPackageBusy(null); }
  }, [packagePort, reloadQuestions]);

  return (
    <div className="app-shell" id="top">
      <header className="topbar">
        <h1 className="sr-only">Maratona — plataforma offline de questões</h1>
        <a className="brand" href="#top" aria-label="Maratona, início"><span className="brand-mark">M</span><span>maratona</span></a>
        <div className="topbar-actions">
          <span className={`connection ${online ? '' : 'is-offline'}`} role="status" aria-label={online ? 'Conectado à internet' : 'Sem conexão; estudando offline'}><i /><span>{online ? 'Online' : 'Offline'}</span></span>
          {authUser && <span className="sync-status" role="status">{syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'pending' ? 'Sync pendente' : syncStatus === 'synced' ? 'Sincronizado' : ''}</span>}
          <button className="icon-button" onClick={() => { setAuthOpen(false); setFiltersOpen(false); setStatsOpen((open) => !open); }} aria-label="Ver estatísticas" aria-expanded={statsOpen}>↗</button>
          <button className="account-button" onClick={() => { setStatsOpen(false); setFiltersOpen(false); setAuthOpen(true); }} aria-label={authUser ? `Conta de ${authUser.name}` : 'Entrar ou criar conta'}>{authUser ? authUser.name.slice(0, 1).toUpperCase() : 'Entrar'}</button>
          <button className="filter-button" onClick={() => { setAuthOpen(false); setStatsOpen(false); setFiltersOpen((open) => !open); }} aria-expanded={filtersOpen} aria-controls="filters">Filtros <span aria-hidden="true">⌄</span></button>
        </div>
        {filtersOpen && <section className="filters" id="filters" aria-label="Filtros de questões">
        <label>Prova<select value={exam} onChange={(event) => setExam(event.target.value)}><option value="all">Todas</option>{exams.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Matéria<select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="all">Todas</option>{subjects.map((value) => <option key={value}>{value.replaceAll('-', ' ')}</option>)}</select></label>
        {packages.length > 0 && <div aria-label="Provas offline">
          {packages.map((item) => <button key={item.id} type="button" disabled={packageBusy === item.id} onClick={() => void changePackage(item)}>
            {item.label}: {packageBusy === item.id ? 'Aguarde…' : item.state === 'downloaded' ? 'Remover download' : item.state === 'update-available' ? 'Atualizar' : 'Baixar'}
          </button>)}
        </div>}
        {packageError && <p role="alert">Não foi possível gerenciar a prova offline: {packageError}</p>}
      </section>}
      </header>
      {statsOpen && <StatsPanel stats={stats} onClose={() => setStatsOpen(false)} />}
      {authOpen && <AuthPanel user={authUser} initialMode={initialAuthMode} busy={authBusy} error={authError} message={authMessage} online={online} onClose={() => setAuthOpen(false)} onEmailLogin={emailLogin} onSignUp={signUp} onGoogle={googleLogin} onLogout={logout} onForgot={forgotPassword} onReset={resetPassword} onVerify={resendVerification} />}

      {sessionsReady && filtered.length ? <QuestionFeed questions={filtered} activeIndex={activeIndex} sessions={sessions} onActiveIndex={setActiveIndex} onStart={onStart} onAnswer={onAnswer} onTimeout={onTimeout} onViewed={onViewed} /> : sessionsReady ? (
        <main className="empty-state"><span>∅</span><h1>Nenhuma questão por aqui</h1><p>Altere os filtros para continuar estudando.</p></main>
      ) : <main className="empty-state" aria-label="Carregando questões"><p>Carregando questões…</p></main>}
      <div className="swipe-hint" aria-hidden="true">Deslize para a próxima <span>↓</span></div>
    </div>
  );
}
