import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useViewTracking } from './useViewTracking';

describe('view tracking', () => {
  it('records only after 60% remains visible for one second', () => {
    vi.useFakeTimers();
    let notify: IntersectionObserverCallback = () => undefined;
    class Observer {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {} disconnect() {} unobserve() {} takeRecords() { return []; }
      root = null; rootMargin = ''; thresholds = [0.6];
    }
    globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
    const viewed = vi.fn();
    function Subject() { const ref = useViewTracking(true, viewed); return <article ref={ref}>Q</article>; }
    render(<Subject />);

    act(() => notify([{ intersectionRatio: 0.59 } as IntersectionObserverEntry], {} as IntersectionObserver));
    act(() => vi.advanceTimersByTime(1_500));
    expect(viewed).not.toHaveBeenCalled();
    act(() => notify([{ intersectionRatio: 0.6 } as IntersectionObserverEntry], {} as IntersectionObserver));
    act(() => vi.advanceTimersByTime(999));
    expect(viewed).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(viewed).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
