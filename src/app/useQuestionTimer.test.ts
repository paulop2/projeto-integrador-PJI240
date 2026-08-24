import { describe, expect, it } from 'vitest';

import { QUESTION_TIME_LIMIT_MS } from '../contracts';
import { formatTimer, remainingMs } from './useQuestionTimer';

describe('question timer', () => {
  it('always starts at three minutes and never becomes negative', () => {
    expect(formatTimer(remainingMs(null, 10))).toBe('3:00');
    expect(remainingMs(1_000, 1_000 + QUESTION_TIME_LIMIT_MS + 20)).toBe(0);
  });

  it('formats partial seconds conservatively', () => {
    expect(formatTimer(60_001)).toBe('1:01');
    expect(formatTimer(0)).toBe('0:00');
  });
});
