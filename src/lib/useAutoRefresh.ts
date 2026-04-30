import { useEffect, useRef } from 'react';

/**
 * Polls a callback at a regular interval. Pauses when the document is hidden
 * to save bandwidth and avoid hammering the API while the user isn't looking.
 */
export function useAutoRefresh(fn: () => void, intervalMs: number, deps: any[] = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      stop();
      id = window.setInterval(() => {
        if (!document.hidden) fnRef.current();
      }, intervalMs);
    };
    const stop = () => {
      if (id != null) {
        window.clearInterval(id);
        id = null;
      }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else { fnRef.current(); start(); }
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
