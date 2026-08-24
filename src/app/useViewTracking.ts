import { useEffect, useRef } from 'react';

export function useViewTracking(active: boolean, onViewed: () => void) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !active) return;
    let timer: number | undefined;
    let fired = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry && entry.intersectionRatio >= 0.6 && !fired) {
        timer ??= window.setTimeout(() => {
          fired = true;
          onViewed();
        }, 1000);
      } else if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: [0.6] });
    observer.observe(node);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [active, onViewed]);

  return ref;
}
