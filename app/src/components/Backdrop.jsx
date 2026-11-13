import { useEffect, useRef } from "react";

// The app's ground, the same as the landing's: squared notebook paper (cuaderno cuadriculado) with doodles of the five
// tests drifting on two layers at different speeds, and the squares lighting up around the pointer or finger.
// Purely decorative: it sits behind everything, takes no clicks and stays still with "reduce motion" (cx.css).
export default function Backdrop() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;
    let raf = 0, x = 0, y = 0;
    const paint = () => { raf = 0; el.style.setProperty("--mx", `${x}px`); el.style.setProperty("--my", `${y}px`); el.classList.add("lit"); };
    const move = (e) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(paint); };
    const leave = () => el.classList.remove("lit");
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      document.removeEventListener("pointerleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="cx-ground" ref={ref} aria-hidden="true">
      <span className="cx-doodles cx-far" />
      <span className="cx-doodles cx-near" />
      <span className="cx-lit" />
    </div>
  );
}
