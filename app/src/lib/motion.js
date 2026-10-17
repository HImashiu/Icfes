// Feedback that makes practice feel good: confetti, short sounds and a buzz on phones.
// Everything here is optional decoration. It does nothing when the student asked the system for less motion,
// and sounds follow the "Sonidos" switch in Perfil (kept in this browser only).
const SOUND_KEY = "condor:sound";

export const reducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export function soundOn() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

let ctx = null;
function audio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume?.();
  return ctx;
}

// A note: frequency in Hz, start offset and length in seconds.
function tone(ac, freq, at, len, { type = "sine", gain = 0.18 } = {}) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(vol).connect(ac.destination);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

const SOUNDS = {
  // Two rising notes, like a "ding-ding".
  correct: (ac) => { tone(ac, 784, 0, 0.16, { type: "triangle" }); tone(ac, 1175, 0.09, 0.28, { type: "triangle" }); },
  // One soft low note: says "not this one" without scolding.
  wrong: (ac) => { tone(ac, 220, 0, 0.22, { type: "sine", gain: 0.16 }); tone(ac, 185, 0.1, 0.26, { type: "sine", gain: 0.12 }); },
  // A short arpeggio for streaks and finishing a session.
  combo: (ac) => [659, 784, 988, 1319].forEach((f, i) => tone(ac, f, i * 0.07, 0.22, { type: "triangle", gain: 0.14 })),
  finish: (ac) => [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.11, 0.4, { type: "triangle", gain: 0.15 })),
  tap: (ac) => tone(ac, 520, 0, 0.05, { type: "sine", gain: 0.05 }),
};

export function play(name) {
  if (!soundOn()) return;
  try {
    const ac = audio();
    if (ac) SOUNDS[name]?.(ac);
  } catch {
    /* no audio on this device */
  }
}

export function buzz(pattern) {
  if (reducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration */
  }
}

const COLORS = ["#C8F04A", "#8AB4FF", "#FFB547", "#F59EC4", "#5ED3B4", "#C79BFF", "#FF9F43"];

// Confetti that bursts from `origin` (an element, or the top of the screen), falls and removes itself.
export function confetti(origin, { count = 26, spread = 1 } = {}) {
  if (typeof document === "undefined" || reducedMotion()) return;
  const r = origin?.getBoundingClientRect?.();
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 3 : window.innerHeight / 4;
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("i");
    const angle = (Math.random() * 0.9 + 0.05) * Math.PI; // upward half circle
    const speed = (120 + Math.random() * 180) * spread;
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    bit.style.background = COLORS[i % COLORS.length];
    bit.style.setProperty("--dx", `${Math.cos(angle) * speed}px`);
    bit.style.setProperty("--dy", `${-Math.sin(angle) * speed}px`);
    bit.style.setProperty("--rot", `${Math.round(Math.random() * 720 - 360)}deg`);
    bit.style.animationDelay = `${Math.random() * 60}ms`;
    if (i % 3 === 0) bit.style.borderRadius = "50%";
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1400);
}
