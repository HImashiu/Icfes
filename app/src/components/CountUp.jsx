import { useEffect, useState } from "react";
import { reducedMotion } from "../lib/motion.js";

// A number that counts up from 0 when it first shows (ease-out), then follows `value`.
// `format` turns the number into text; with reduced motion it shows the final value at once.
export default function CountUp({ value, format = (n) => String(Math.round(n)), duration = 900, delay = 0 }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  useEffect(() => {
    if (reducedMotion() || typeof requestAnimationFrame === "undefined") { setShown(value); return undefined; }
    let raf = 0;
    let start = null;
    const from = 0;
    const step = (t) => {
      if (start === null) start = t + delay;
      const k = Math.min(1, Math.max(0, (t - start) / duration));
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (value - from) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);
  return <>{format(shown)}</>;
}
