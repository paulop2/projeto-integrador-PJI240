import { useEffect, useState } from 'react';

import { QUESTION_TIME_LIMIT_MS } from '../contracts';

export function remainingMs(startedAt: number | null, now: number) {
  return startedAt === null ? QUESTION_TIME_LIMIT_MS : Math.max(0, QUESTION_TIME_LIMIT_MS - (now - startedAt));
}

export function formatTimer(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function useQuestionTimer(startedAt: number | null, stopped: boolean, onTimeout: () => void) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = remainingMs(startedAt, now);

  useEffect(() => {
    if (startedAt === null || stopped) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [startedAt, stopped]);

  useEffect(() => {
    if (startedAt !== null && !stopped && remaining === 0) onTimeout();
  }, [onTimeout, remaining, startedAt, stopped]);

  return remaining;
}
