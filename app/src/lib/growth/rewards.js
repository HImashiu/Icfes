// Rewards for bringing friends (migration 0053): levels by verified friends, what each friend still needs, and the
// words the student sees. Pure: the numbers come from my_referrals().rules, so app_limits changes show up here.
export const DEFAULT_RULES = {
  answers: 20, days: 2, week_cap: 5, teacher_points: 2, base: 40,
  l1: 1, l1_questions: 80, l2: 3, l2_questions: 150, l3: 5, pass_days: 60, pass_extra_days: 30,
  welcome: 40, welcome_days: 7, sim_month: 1, sim_friend: 2,
};

const amigos = (n) => `${n} ${n === 1 ? "amigo" : "amigos"}`;

export function rewardLevels(rules = DEFAULT_RULES, points = 0) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  const levels = [
    { level: 1, points: r.l1, title: amigos(r.l1), perk: `${r.l1_questions} preguntas al día` },
    { level: 2, points: r.l2, title: amigos(r.l2), perk: `${r.l2_questions} preguntas al día` },
    { level: 3, points: r.l3, title: amigos(r.l3), perk: `Pase total: preguntas y simulacros sin límite por ${r.pass_days} días` },
  ].map((l) => ({ ...l, reached: points >= l.points }));
  const next = levels.find((l) => !l.reached) ?? null;
  return { levels, next, need: next ? next.points - points : 0 };
}

// One line per friend: what counts and what is missing. Never shows the friend's answers beyond the two numbers.
export function friendStatus(f, rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  if (f.state === "ok") return { tone: "ok", text: f.teacher ? `Cuenta como ${r.teacher_points}` : "Ya cuenta" };
  if (f.state === "week_cap") return { tone: "wait", text: "Cuenta la próxima semana" };
  if (f.state === "same_device") return { tone: "bad", text: "No cuenta: usó tu mismo celular" };
  if (f.teacher) return { tone: "wait", text: "Cuenta cuando cree su primer curso" };
  const left = [];
  const a = Math.max(r.answers - (f.answers ?? 0), 0);
  const d = Math.max(r.days - (f.days ?? 0), 0);
  if (a) left.push(`${a} ${a === 1 ? "pregunta" : "preguntas"}`);
  if (d) left.push(d === 1 && (f.days ?? 0) > 0 ? "practicar otro día" : `${d} ${d === 1 ? "día" : "días"} de práctica`);
  return { tone: "wait", text: left.length ? `Le falta: ${left.join(" y ")}` : "Revisando" };
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function passDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const [y, m, day] = d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).split("-").map(Number);
  return `${day} de ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` de ${y}` : ""}`;
}

export function rulesLine(rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  return `Un amigo cuenta cuando entra con tu enlace, desde su propio celular, y responde ${r.answers} preguntas en ${r.days} días distintos. ` +
    `Un profe que se une y crea un curso cuenta como ${r.teacher_points}. Cuentan hasta ${r.week_cap} amigos por semana.`;
}

export function simulacroLine(s) {
  if (!s) return null;
  if (s.unlimited) return "Simulacros completos: sin límite";
  const left = s.remaining ?? 0;
  return `Simulacros completos: te ${left === 1 ? "queda" : "quedan"} ${left}`;
}
