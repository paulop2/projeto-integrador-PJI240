import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUESTION_TIME_LIMIT_MS } from '../contracts';
import { activeElapsedMs, formatTimer, remainingMs, useQuestionTimer } from './useQuestionTimer';

describe('question timer', () => {
  afterEach(() => vi.useRealTimers());

  it('always starts at three minutes and never becomes negative', () => {
    expect(formatTimer(remainingMs(0, null, 10))).toBe('3:00');
    expect(remainingMs(0, 1_000, 1_000 + QUESTION_TIME_LIMIT_MS + 20)).toBe(0);
  });

  it('subtracts accumulated active time from the remaining time', () => {
    expect(remainingMs(42_000, null, 99_999)).toBe(QUESTION_TIME_LIMIT_MS - 42_000);
    expect(remainingMs(42_000, 1_000, 1_005)).toBe(QUESTION_TIME_LIMIT_MS - 42_005);
  });

  it('caps active time at the question limit', () => {
    expect(activeElapsedMs(QUESTION_TIME_LIMIT_MS - 1_000, 1_000, 60_000)).toBe(QUESTION_TIME_LIMIT_MS);
    expect(activeElapsedMs(10_000, 1_000, 500)).toBe(10_000);
  });

  it('formats partial seconds conservatively', () => {
    expect(formatTimer(60_001)).toBe('1:01');
    expect(formatTimer(0)).toBe('0:00');
  });

  it('pauses while inactive and resumes from the accumulated time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const onTimeout = vi.fn();
    interface TimerProps { elapsedMs: number; startedAt: number | null; active: boolean }
    const { result, rerender } = renderHook(
      ({ elapsedMs, startedAt, active }: TimerProps) => useQuestionTimer(elapsedMs, startedAt, active, false, onTimeout),
      { initialProps: { elapsedMs: 30_000, startedAt: 1_000, active: true } as TimerProps },
    );
    expect(result.current).toBe(QUESTION_TIME_LIMIT_MS - 30_000);

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current).toBe(QUESTION_TIME_LIMIT_MS - 40_000);

    rerender({ elapsedMs: 40_000, startedAt: null, active: false });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current).toBe(QUESTION_TIME_LIMIT_MS - 40_000);
    expect(onTimeout).not.toHaveBeenCalled();

    rerender({ elapsedMs: 40_000, startedAt: Date.now(), active: true });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(QUESTION_TIME_LIMIT_MS - 45_000);
  });

  it('does not advance nor time out while inactive', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useQuestionTimer(0, 0, false, false, onTimeout));
    act(() => { vi.advanceTimersByTime(QUESTION_TIME_LIMIT_MS + 10_000); });
    expect(result.current).toBe(QUESTION_TIME_LIMIT_MS);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('times out only when the active question really reaches zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useQuestionTimer(0, 0, true, false, onTimeout));
    act(() => { vi.advanceTimersByTime(QUESTION_TIME_LIMIT_MS - 250); });
    expect(result.current).toBe(250);
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe(0);
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
