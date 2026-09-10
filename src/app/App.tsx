import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { QUESTION_TIME_LIMIT_MS } from '../contracts';
import type { ForeignLanguage, ProgressEvent, Question } from '../contracts';
import { offlineRuntime } from '../offline/runtime';
import { demoQuestions } from './demoQuestions';
import { ExamsPanel } from './ExamsPanel';
import { ForeignLanguageSelector } from './ForeignLanguageSelector';
import type { ActiveExamPort, ActiveExamState, ForeignLanguagePreferencePort, PackagePort, ProgressPort, QuestionSourcePort, StudySessionPort } from './ports';
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
  activeExamPort = offlineRuntime.activeExamPort,
  foreignLanguagePreferencePort = offlineRuntime.foreignLanguagePreferencePort,
  authPort = httpAuthPort,
  authRuntime = accountRuntime,
}: { progressPort?: ProgressPort; sessionPort?: StudySessionPort; questionSource?: QuestionSourcePort; packagePort?: PackagePort; activeExamPort?: ActiveExamPort; foreignLanguagePreferencePort?: ForeignLanguagePreferencePort; authPort?: AuthPort; authRuntime?: AccountRuntime }) {
  const [questions, setQuestions] = useState<Question[]>(() => questionSource ? [] : demoQuestions);
  const [questionsReady, setQuestionsReady] = useState(() => !questionSource);
  const [activeExam, setActiveExam] = useState<ActiveExamState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sessions, setSessions] = useState<Record<string, QuestionSession>>({});
  const [sessionsReady, setSessionsReady] = useState(false);
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [subject, setSubject] = useState('all');
  const [foreignLanguage, setForeignLanguage] = useState<ForeignLanguage | null>(null);
  const [languageReady, setLanguageReady] = useState(() => !questionSource);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [examsOpen, setExamsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get('token'), []);
  const initialAuthMode: AuthMode = resetToken ? 'reset' : 'login';
  const [authOpen, setAuthOpen] = useState(Boolean(resetToken));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(() => new URLSearchParams(window.location.search).has('verified') ? 'E-mail verificado. Você já pode entrar.' : null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'pending'>('idle');
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
    const [loaded, nextActiveExam, savedLanguage] = await Promise.all([
      questionSource.load(),
      activeExamPort?.initialize() ?? Promise.resolve(null),
      foreignLanguagePreferencePort.load(),
    ]);
    setQuestions(nextActiveExam && nextActiveExam.status !== 'active' ? [] : loaded);
    setActiveExam(nextActiveExam);
    const available = new Set(loaded.map(({ language }) => language).filter((value): value is ForeignLanguage => value !== null));
    setForeignLanguage(savedLanguage && available.has(savedLanguage) ? savedLanguage : null);
    setLanguageError(null);
    setActiveIndex(0);
    setQuestionsReady(true);
    setLanguageReady(true);
  }, [activeExamPort, foreignLanguagePreferencePort, questionSource]);
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

  const availableLanguages = useMemo(() => [...new Set(
    questions.map(({ language }) => language).filter((value): value is ForeignLanguage => value !== null),
  )].sort(), [questions]);
  const languageQuestions = useMemo(() => availableLanguages.length === 0
    ? questions
    : foreignLanguage === null
      ? []
      : questions.filter(({ language }) => language === null || language === foreignLanguage),
  [availableLanguages.length, foreignLanguage, questions]);
  const subjects = useMemo(() => [...new Set(languageQuestions.map(({ subjectId }) => subjectId))].sort(), [languageQuestions]);
  const filtered = useMemo(() => languageQuestions.filter((question) =>
    subject === 'all' || question.subjectId === subject,
  ), [languageQuestions, subject]);

  const selectForeignLanguage = useCallback((language: ForeignLanguage) => {
    setLanguageError(null);
    void foreignLanguagePreferencePort.save(language).then(() => {
      setForeignLanguage(language);
      setActiveIndex(0);
    }).catch(() => setLanguageError('Não foi possível salvar o idioma. Tente novamente.'));
  }, [foreignLanguagePreferencePort]);

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

  return (
    <div className="app-shell" id="top">
      <header className="topbar">
        <h1 className="sr-only">Maratona — plataforma offline de questões</h1>
        <a className="brand" href="#top" aria-label="Maratona, início"><span className="brand-mark">M</span><span>maratona</span></a>
        <div className="topbar-actions">
          <span className={`connection ${online ? '' : 'is-offline'}`} role="status" aria-label={online ? 'Conectado à internet' : 'Sem conexão; estudando offline'}><i /><span>{online ? 'Online' : 'Offline'}</span></span>
          {authUser && <span className="sync-status" role="status">{syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'pending' ? 'Sync pendente' : syncStatus === 'synced' ? 'Sincronizado' : ''}</span>}
          <button className="icon-button" onClick={() => { setAuthOpen(false); setExamsOpen(false); setFiltersOpen(false); setStatsOpen((open) => !open); }} aria-label="Ver estatísticas" aria-expanded={statsOpen}>↗</button>
          <button className="account-button" onClick={() => { setStatsOpen(false); setExamsOpen(false); setFiltersOpen(false); setAuthOpen(true); }} aria-label={authUser ? `Conta de ${authUser.name}` : 'Entrar ou criar conta'}>{authUser ? authUser.name.slice(0, 1).toUpperCase() : 'Entrar'}</button>
          <button className="exams-button" disabled={!packagePort || !activeExamPort} onClick={() => { setAuthOpen(false); setStatsOpen(false); setFiltersOpen(false); setExamsOpen((open) => !open); }} aria-expanded={examsOpen} aria-controls="exams-panel">Provas</button>
          <button className="filter-button" onClick={() => { setAuthOpen(false); setStatsOpen(false); setExamsOpen(false); setFiltersOpen((open) => !open); }} aria-expanded={filtersOpen} aria-controls="filters">Filtros <span aria-hidden="true">⌄</span></button>
        </div>
        {filtersOpen && <section className="filters" id="filters" aria-label="Filtros de questões">
        <label>Matéria<select value={subject} onChange={(event) => { setSubject(event.target.value); setActiveIndex(0); }}><option value="all">Todas</option>{subjects.map((value) => <option key={value}>{value.replaceAll('-', ' ')}</option>)}</select></label>
        {availableLanguages.length > 0 && foreignLanguage !== null && <ForeignLanguageSelector compact available={availableLanguages} value={foreignLanguage} onChange={selectForeignLanguage} />}
      </section>}
      </header>
      {statsOpen && <StatsPanel stats={stats} onClose={() => setStatsOpen(false)} />}
      {authOpen && <AuthPanel user={authUser} initialMode={initialAuthMode} busy={authBusy} error={authError} message={authMessage} online={online} onClose={() => setAuthOpen(false)} onEmailLogin={emailLogin} onSignUp={signUp} onGoogle={googleLogin} onLogout={logout} onForgot={forgotPassword} onReset={resetPassword} onVerify={resendVerification} />}
      {examsOpen && packagePort && activeExamPort && <div id="exams-panel"><ExamsPanel packagePort={packagePort} activeExamPort={activeExamPort} online={online} onClose={() => setExamsOpen(false)} onContentChange={reloadQuestions} /></div>}

      {sessionsReady && questionsReady && languageReady && filtered.length ? <QuestionFeed questions={filtered} activeIndex={activeIndex} sessions={sessions} onActiveIndex={setActiveIndex} onStart={onStart} onAnswer={onAnswer} onTimeout={onTimeout} onViewed={onViewed} /> : sessionsReady && questionsReady && languageReady && activeExam?.status === 'empty' ? (
        <main className="empty-state" aria-label="Nenhuma prova baixada"><span aria-hidden="true">↓</span><h1>Baixe uma prova para começar a estudar.</h1><p>Escolha uma edição e ela ficará disponível também offline.</p>{packagePort && activeExamPort && <button className="primary-button" type="button" onClick={() => { setAuthOpen(false); setStatsOpen(false); setFiltersOpen(false); setExamsOpen(true); }}>Ver provas disponíveis</button>}</main>
      ) : sessionsReady && questionsReady && languageReady && activeExam?.status === 'selection-required' ? (
        <main className="empty-state" aria-label="Escolha de prova necessária"><span aria-hidden="true">→</span><h1>Escolha uma prova baixada para continuar estudando.</h1><p>Nenhuma edição será combinada ou escolhida sem sua confirmação.</p>{packagePort && activeExamPort && <button className="primary-button" type="button" onClick={() => { setAuthOpen(false); setStatsOpen(false); setFiltersOpen(false); setExamsOpen(true); }}>Escolher prova</button>}</main>
      ) : sessionsReady && questionsReady && languageReady && availableLanguages.length > 0 && foreignLanguage === null ? (
        <main className="empty-state language-required" aria-labelledby="language-required-title"><span aria-hidden="true">文</span><h1 id="language-required-title">Escolha o idioma estrangeiro para estudar.</h1><ForeignLanguageSelector available={availableLanguages} value={foreignLanguage} onChange={selectForeignLanguage} />{languageError && <p className="language-error" role="alert">{languageError}</p>}</main>
      ) : sessionsReady && questionsReady && languageReady ? (
        <main className="empty-state"><span>∅</span><h1>Nenhuma questão por aqui</h1><p>Altere os filtros para continuar estudando.</p></main>
      ) : <main className="empty-state" aria-label="Carregando questões"><p>Carregando questões…</p></main>}
      <div className="swipe-hint" aria-hidden="true">Deslize para a próxima <span>↓</span></div>
    </div>
  );
}
