// Logros: milestones the student reaches by practicing. Each one is measured against the student alone (never
// against classmates), and carries its progress so the next one is always in sight.
const DAY = 864e5;
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function bestStreak(history) {
  const days = [...new Set(history.map((h) => dayStart(h.at)))].sort((a, b) => a - b);
  let best = 0; let run = 0; let prev = null;
  for (const d of days) { run = prev != null && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

function busiestWeek(history) {
  const weeks = new Map();
  for (const h of history) {
    const d = dayStart(h.at);
    const monday = d - ((new Date(d).getDay() + 6) % 7) * DAY;
    weeks.set(monday, (weeks.get(monday) ?? 0) + 1);
  }
  return Math.max(0, ...weeks.values());
}

// history: loadHistory() rows. tasks: studentTasks() rows (optional, only with an account).
export function achievements({ history = [], tasks = [] } = {}) {
  const answered = history.reduce((a, h) => a + (h.answered ?? 0), 0);
  const areas = new Set(history.flatMap((h) => (h.perArea ?? []).filter((a) => a.answered).map((a) => a.name)));
  const sharp = history.some((h) => (h.outOf ?? h.answered ?? 0) >= 10 && h.percent >= 80);
  const fullTimed = history.some((h) => h.mode === "timed" && (h.total ?? 0) >= 100 && (h.answered ?? 0) >= 100);
  const streak = bestStreak(history);
  const week = busiestWeek(history);
  const early = tasks.filter((t) => t.deliveredAt && t.a.due_at && new Date(t.a.due_at) - new Date(t.deliveredAt) > DAY).length;
  const deliveredCount = tasks.filter((t) => t.status === "delivered").length;
  const missed = tasks.filter((t) => t.status === "missed").length;
  const item = (id, title, desc, icon, have, need) => ({ id, title, desc, icon, have: Math.min(have, need), need, got: have >= need });
  return [
    item("first", "Primer paso", "Termina tu primer simulacro o práctica", "play", history.length, 1),
    item("streak3", "Racha de 3", "Practica 3 días seguidos", "flame", streak, 3),
    item("streak7", "Semana completa", "Practica 7 días seguidos", "flame", streak, 7),
    item("streak30", "Mes imparable", "Practica 30 días seguidos", "flame", streak, 30),
    item("q100", "100 preguntas", "Responde 100 preguntas", "check", answered, 100),
    item("q500", "500 preguntas", "Responde 500 preguntas", "check", answered, 500),
    item("q1000", "Mil preguntas", "Responde 1.000 preguntas", "trophy", answered, 1000),
    item("areas", "Las cinco áreas", "Practica Lectura, Matemáticas, Sociales, Ciencias e Inglés", "grid", areas.size, 5),
    item("sharp", "Puntería", "Saca 80 % o más en una práctica de 10 preguntas o más", "flag", sharp ? 1 : 0, 1),
    item("week5", "Constancia", "Practica 5 veces en una misma semana", "clock", week, 5),
    item("full", "Como el día del examen", "Termina un simulacro con tiempo de 100 preguntas o más", "clock", fullTimed ? 1 : 0, 1),
    item("early", "Adelantado", "Entrega 3 tareas más de un día antes del cierre", "bolt", early, 3),
    item("ontime", "Al día", "Entrega 5 tareas sin dejar ninguna vencida", "school", missed ? 0 : deliveredCount, 5),
  ];
}
