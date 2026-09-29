import { useCallback, useEffect, useRef } from 'react';

import type { Question } from '../contracts';
import type { LocalOutcome } from './progress';
import type { StudySession } from './ports';
import { activeElapsedMs, formatTimer, useQuestionTimer } from './useQuestionTimer';
import { useViewTracking } from './useViewTracking';

export interface QuestionSession extends StudySession { outcome: LocalOutcome | null }

interface QuestionCardProps {
  question: Question;
  position: number;
  total: number;
  active: boolean;
  session: QuestionSession;
  onStart: (questionId: string) => void;
  onPause: (questionId: string) => void;
  onAnswer: (question: Question, optionId: string, elapsedMs: number) => void;
  onTimeout: (question: Question) => void;
  onViewed: (question: Question) => void;
}

export function QuestionCard({ question, position, total, active, session, onStart, onPause, onAnswer, onTimeout, onViewed }: QuestionCardProps) {
  const isSupported = question.kind === 'single-choice';
  useEffect(() => {
    if (!isSupported || session.outcome !== null) return;
    if (active && session.startedAt === null) onStart(question.id);
    else if (!active && session.startedAt !== null) onPause(question.id);
  }, [active, isSupported, onPause, onStart, question.id, session.outcome, session.startedAt]);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const pauseRef = useRef(onPause);
  useEffect(() => { pauseRef.current = onPause; }, [onPause]);
  useEffect(() => () => {
    const current = sessionRef.current;
    if (current.startedAt !== null && current.outcome === null) pauseRef.current(question.id);
  }, [question.id]);

  const timeout = useCallback(() => onTimeout(question), [onTimeout, question]);
  const remaining = useQuestionTimer(session.elapsedMs, session.startedAt, active, !isSupported || session.outcome !== null, timeout);
  const viewRef = useViewTracking(active, useCallback(() => onViewed(question), [onViewed, question]));
  const locked = session.outcome !== null;

  return (
    <article ref={viewRef} className="question-card" aria-labelledby={`title-${question.id}`}>
      <header className="question-meta">
        <span className="eyebrow">{question.examId.toUpperCase()} · {question.year ?? 'Edição especial'}</span>
        <span className="question-count">{position} / {total}</span>
      </header>

      <div className="subject-row">
        <span className="subject-chip">{question.subjectId.replaceAll('-', ' ')}</span>
        <div className={`timer ${remaining <= 30_000 ? 'timer--urgent' : ''}`} role="timer" aria-label={`${formatTimer(remaining)} restantes`}>
          <span aria-hidden="true">◷</span> {formatTimer(remaining)}
        </div>
        <span className="sr-only" aria-live="assertive" aria-atomic="true">
          {remaining <= 10_000 && remaining > 0 ? `${Math.ceil(remaining / 1000)} segundos restantes` : ''}
        </span>
      </div>

      <div className="question-copy">
        <span className="question-number" id={`title-${question.id}`}>Questão {position}</span>
        {question.context && <p>{question.context}</p>}
        {question.files.map((file) => <img key={file} src={file} alt="Material de apoio da questão" loading="lazy" />)}
        {question.alternativesIntroduction && <p className="introduction">{question.alternativesIntroduction}</p>}
      </div>

      {!isSupported ? (
        <div className="unsupported" role="status">
          <span aria-hidden="true">◇</span>
          <p><strong>Formato em breve</strong><br />Esta questão é do tipo “{question.kind}” e ainda não pode ser respondida nesta versão.</p>
        </div>
      ) : (
        <fieldset className="alternatives" disabled={locked}>
          <legend className="sr-only">Escolha uma alternativa</legend>
          {question.alternatives.map((alternative) => {
            const selected = session.selectedOptionId === alternative.id;
            const correct = locked && question.answer.optionIds?.includes(alternative.id);
            const wrong = selected && session.outcome === 'incorrect';
            return (
              <label key={alternative.id} className={`alternative ${selected ? 'is-selected' : ''} ${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}`}>
                <input
                  type="radio"
                  name={question.id}
                  value={alternative.id}
                  checked={selected}
                  onChange={() => onAnswer(question, alternative.id, activeElapsedMs(session.elapsedMs, session.startedAt, Date.now()))}
                />
                <span className="alternative-label">{alternative.label}</span>
                <span className="alternative-content">
                  {alternative.text}
                  {alternative.file && <img src={alternative.file} alt={`Imagem da alternativa ${alternative.label}`} loading="lazy" />}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {session.outcome && (
        <div className={`feedback feedback--${session.outcome}`} role="status" aria-live="polite">
          {session.outcome === 'correct' && 'Boa! Resposta correta.'}
          {session.outcome === 'incorrect' && 'Não foi dessa vez. A resposta correta está destacada.'}
          {session.outcome === 'timed_out' && 'Tempo esgotado. As alternativas foram bloqueadas.'}
        </div>
      )}
    </article>
  );
}
