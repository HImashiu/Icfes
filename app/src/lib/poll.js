import { useEffect, useRef } from "react";

// Runs `fn` now and then every `ms` while `enabled`. Calls never overlap, and an error is left to `fn` to handle.
export function usePoll(fn, ms, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    let stop = false;
    let timer;
    const tick = async () => {
      try { await ref.current(); } catch { /* the caller shows what matters */ }
      if (!stop) timer = setTimeout(tick, ms);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [ms, enabled]);
}
