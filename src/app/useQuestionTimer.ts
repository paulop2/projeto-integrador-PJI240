import { useEffect, useState } from 'react';

import { QUESTION_TIME_LIMIT_MS } from '../contracts';

export function activeElapsedMs(elapsedMs: number, startedAt: number | null, now: number) {
  const currentRun = startedAt === null ? 0 : Math.max(0, now - startedAt);
  return Math.min(QUESTION_TIME_LIMIT_MS, Math.max(0, elapsedMs + currentRun));
}

export function remainingMs(elapsedMs: number, startedAt: number | null, now: number) {
  return Math.max(0, QUESTION_TIME_LIMIT_MS - activeElapsedMs(elapsedMs, startedAt, now));
}

export function formatTimer(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function useQuestionTimer(elapsedMs: number, startedAt: number | null, active: boolean, stopped: boolean, onTimeout: () => void) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = remainingMs(elapsedMs, startedAt, now);
  const running = active && startedAt !== null && !stopped;

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (running && remaining === 0) onTimeout();
  }, [onTimeout, remaining, running]);

  return remaining;
}
