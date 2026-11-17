// Amigos y parches (migration 0052): friends by code, progress shared only when the student chooses, cheers, and
// the cooperative side of study groups: the parche's streak, weekly missions, challenges and practice with the same
// questions for everyone. No ranking anywhere (Juan, 2026-10-17): lists are A-Z and groups add up against a goal.
// In demo mode (?demo=1) everything runs on an invented class kept in memory, so the screens can be shown.
import { demoEnabled } from "../demo/mode.js";
import { call, myStudyGroups, createStudyGroup, joinStudyGroup, leaveStudyGroup, studyGroupPreview, whatsapp } from "./growth/app.js";
import { AREAS } from "./teaching.js";

export const SHARE_LEVELS = [
  { id: "nada", label: "Solo mi nombre", hint: "Tus amigos ven tu nombre y nada más." },
  { id: "basico", label: "Mi constancia", hint: "Si practicaste hoy, tu racha, y tus días y preguntas de la semana." },
  { id: "completo", label: "Todo mi progreso", hint: "Lo anterior y tus preguntas y aciertos por área de los últimos 30 días." },
];
export const CHEERS = [
  { id: "animo", label: "¡Ánimo!", line: "te mandó ánimo" },
  { id: "bien", label: "¡Bien hecho!", line: "celebra lo que hiciste" },
  { id: "vamos", label: "¡Vamos juntos!", line: "quiere practicar contigo" },
  { id: "gracias", label: "¡Gracias!", line: "te dio las gracias" },
];
export const cheerOf = (id) => CHEERS.find((c) => c.id === id) ?? CHEERS[0];
export const METRICS = [
  { id: "preguntas", label: "Preguntas respondidas", unit: ["pregunta", "preguntas"] },
  { id: "aciertos", label: "Respuestas correctas", unit: ["acierto", "aciertos"] },
  { id: "dias", label: "Días de práctica (sumados)", unit: ["día", "días"] },
];

const SITE = typeof window !== "undefined" ? `${window.location.origin}/` : "https://condoricfes.com/";
export const friendLink = (code) => `${SITE}app/#amigos/agregar/${code}`;
export const friendMessage = (code, name) =>
  `${name ? `Soy ${name}. ` : ""}Agrégame como amigo en Cóndor para practicar el ICFES juntos y mantener la racha: ${friendLink(code)}`;
export { whatsapp };

// ------------------------------------------------------------------------------------------------ real backend

const real = {
  myFriends: () => call("my_friends"),
  setCard: (name, share) => call("set_friend_card", { p_name: name ?? null, p_share: share ?? null }),
  preview: (code) => call("friend_code_preview", { p_code: code }),
  addFriend: (code) => call("add_friend", { p_code: code }),
  answerFriend: (id, accept) => call("answer_friend", { p_user: id, p_accept: accept }),
  removeFriend: (id) => call("remove_friend", { p_user: id }),
  cheer: (to, kind, group = null) => call("cheer", { p_to: to, p_kind: kind, p_group: group }),
  seenCheers: () => call("mark_cheers_seen"),
  inviteToGroup: (group, friend) => call("invite_to_group", { p_group: group, p_friend: friend }),
  answerInvite: (group, accept) => call("answer_group_invite", { p_group: group, p_accept: accept }),
  groups: () => myStudyGroups(),
  createGroup: (name, goal, display) => createStudyGroup(name, goal, display),
  joinGroup: (code, display) => joinStudyGroup(code, display),
  leaveGroup: (id) => leaveStudyGroup(id),
  groupPreview: (code) => studyGroupPreview(code),
  overview: (id) => call("group_overview", { p_group: id }),
  createChallenge: (g, c) => call("create_group_challenge", { p_group: g, p_title: c.title, p_area: c.area || null, p_metric: c.metric, p_target: c.target, p_days: c.days }),
  deleteChallenge: (id) => call("delete_group_challenge", { p_id: id }),
  createActivity: (g, a) => call("create_group_activity", { p_group: g, p_title: a.title, p_slug: a.slug, p_keys: a.keys, p_area: a.area || null, p_days: a.days }),
  deleteActivity: (id) => call("delete_group_activity", { p_id: id }),
};

// ------------------------------------------------------------------------------------------------ demo

const day = 864e5;
const iso = (t) => new Date(t).toISOString();
let demoState = null;
let demoSample = null;
// The app passes questions from an open booklet, so the demo's group practice opens real questions.
export function setDemoSample(sample) { if (sample?.slug && sample.keys?.length) demoSample = sample; }

function seedDemo() {
  const now = Date.now();
  const friend = (id, name, share, extra = {}) => ({ id, name, share, since: iso(now - 40 * day), cheered: false, ...extra });
  const areas = (rows) => rows.map(([area, answered, pct]) => ({ area, answered, pct }));
  return {
    me: { code: "vale7k", name: "Valentina", share: "basico", streak: 6, today: true },
    friends: [
      friend("d-santi", "Santiago", "completo", { today: true, streak: 12, together: 6, week_days: 3, week_questions: 64,
        areas: areas([["Ciencias naturales", 38, 61], ["Inglés", 22, 77], ["Lectura crítica", 41, 66], ["Matemáticas", 57, 54]]) }),
      friend("d-mari", "Mariana", "basico", { today: false, streak: 4, together: 4, week_days: 2, week_questions: 31 }),
      friend("d-juanpa", "Juan Pablo", "nada"),
      friend("d-isa", "Isabella", "completo", { today: true, streak: 2, together: 2, week_days: 2, week_questions: 18,
        areas: areas([["Inglés", 30, 83], ["Sociales y ciudadanas", 26, 58]]) }),
    ],
    incoming: [{ id: "d-sofi", name: "Sofía" }],
    outgoing: [{ id: "d-mateo", name: "Mateo" }],
    cheers: [{ id: 1, from: "Mariana", kind: "vamos", at: iso(now - 2 * 3600e3), group: null }],
    invites: [{ group: "d-g2", name: "Inglés de los sábados", from: "Isabella", members: 3 }],
    groups: [
      { id: "d-g1", code: "11apar", name: "Los de 11 A", weekly_goal: 400, mine: true, week_total: 263, members: [] },
    ],
    overview: {
      "d-g1": {
        id: "d-g1", code: "11apar", name: "Los de 11 A", weekly_goal: 400, mine: true, week_total: 263, streak: 9, today_done: false,
        missions_done: 7, week_ends: iso(now + 3 * day).slice(0, 10),
        missions: [
          { id: "area", title: "Respondan 80 preguntas de Matemáticas entre todos", target: 80, progress: 80, done: true },
          { id: "dias", title: "Sumen 12 días de práctica entre todos", target: 12, progress: 9, done: false },
          { id: "cinco", title: "Practiquen las 5 áreas esta semana", target: 5, progress: 4, done: false },
        ],
        members: [
          { id: "d-isa", name: "Isabella", me: false, friend: true, today: true, days: 2, cheered: false },
          { id: "d-mari", name: "Mariana", me: false, friend: true, today: false, days: 2, cheered: false },
          { id: "d-santi", name: "Santiago", me: false, friend: true, today: true, days: 3, cheered: false },
          { id: "d-me", name: "Valentina", me: true, friend: false, today: true, days: 4, cheered: false },
        ],
        challenges: [
          { id: "d-c1", title: "Semana de Inglés", area: "Inglés", metric: "aciertos", target: 60, progress: 41, ends_at: iso(now + 4 * day), by: "Isabella", can_delete: true },
        ],
        activities: [],
      },
    },
  };
}
const S = () => (demoState ??= seedDemo());
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 220));

function demoActivity(sample, now = Date.now()) {
  const keys = sample.keys.slice(0, 8);
  const pct = [100, 75, 50, 75, 25, 100, 50, 75];
  return {
    id: "d-a1", title: `${sample.area ?? "Práctica"} en parche`, slug: sample.slug, keys, area: sample.area ?? null, ends_at: iso(now + 5 * day), by: "Santiago", can_delete: false,
    members: [
      { name: "Isabella", me: false, answered: keys.length },
      { name: "Mariana", me: false, answered: 3 },
      { name: "Santiago", me: false, answered: keys.length },
      { name: "Valentina", me: true, answered: 0 },
    ],
    questions: keys.map((key, i) => ({ key, answered: i < 3 ? 3 : 2, pct: pct[i % pct.length] })),
  };
}

const demo = {
  myFriends: () => { const s = S(); return wait({ me: s.me, friends: s.friends, incoming: s.incoming, outgoing: s.outgoing, cheers: s.cheers, invites: s.invites }); },
  setCard: (name, share) => { const s = S(); if (name) s.me.name = name.slice(0, 30); if (share) s.me.share = share; return wait({ code: s.me.code, name: s.me.name, share: s.me.share }); },
  preview: (code) => wait(code === S().me.code ? { name: S().me.name, me: true } : /^[a-z0-9]{6}$/.test(code) ? { name: "Camila", me: false } : null),
  addFriend: (code) => {
    const s = S();
    if (code === s.me.code) return wait({ error: "self" });
    if (!/^[a-z0-9]{6}$/.test(code)) return wait({ error: "unknown" });
    if (!s.outgoing.some((o) => o.id === `d-${code}`)) s.outgoing.push({ id: `d-${code}`, name: "Camila" });
    return wait({ status: "sent" });
  },
  answerFriend: (id, accept) => {
    const s = S();
    const r = s.incoming.find((x) => x.id === id);
    s.incoming = s.incoming.filter((x) => x.id !== id);
    if (accept && r) s.friends = [...s.friends, { id, name: r.name, share: "basico", since: iso(Date.now()), cheered: false, today: true, streak: 1, together: 1, week_days: 1, week_questions: 12 }]
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return wait(null);
  },
  removeFriend: (id) => { const s = S(); s.friends = s.friends.filter((f) => f.id !== id); s.outgoing = s.outgoing.filter((f) => f.id !== id); return wait(null); },
  cheer: (to) => {
    const s = S();
    const f = s.friends.find((x) => x.id === to);
    if (f) f.cheered = true;
    for (const o of Object.values(s.overview)) for (const m of o.members) if (m.id === to) m.cheered = true;
    return wait({ ok: true });
  },
  seenCheers: () => { S().cheers = []; return wait(null); },
  inviteToGroup: () => wait({ status: "sent" }),
  answerInvite: (group, accept) => {
    const s = S();
    const inv = s.invites.find((i) => i.group === group);
    s.invites = s.invites.filter((i) => i.group !== group);
    if (accept && inv) {
      s.groups.push({ id: group, code: "ingsab", name: inv.name, weekly_goal: 150, mine: false, week_total: 58, members: [] });
      s.overview[group] = {
        id: group, code: "ingsab", name: inv.name, weekly_goal: 150, mine: false, week_total: 58, streak: 0, today_done: false, missions_done: 0,
        week_ends: s.overview["d-g1"].week_ends,
        missions: [
          { id: "area", title: "Respondan 80 preguntas de Inglés entre todos", target: 80, progress: 34, done: false },
          { id: "aciertos", title: "Logren 100 respuestas correctas entre todos", target: 100, progress: 41, done: false },
          { id: "juntos", title: "Practiquen todos el mismo día, 2 veces", target: 2, progress: 0, done: false },
        ],
        members: [
          { id: "d-isa", name: "Isabella", me: false, friend: true, today: true, days: 2, cheered: false },
          { id: "d-tomas", name: "Tomás", me: false, friend: false, today: false, days: 1, cheered: false },
          { id: "d-me", name: "Valentina", me: true, friend: false, today: true, days: 4, cheered: false },
        ],
        challenges: [], activities: [],
      };
    }
    return wait({ status: accept ? "joined" : "declined" });
  },
  groups: () => wait(S().groups),
  createGroup: (name, goal) => {
    const s = S();
    const id = `d-g${s.groups.length + 3}`;
    s.groups.push({ id, code: "nuevo1", name, weekly_goal: goal, mine: true, week_total: 0, members: [] });
    s.overview[id] = { id, code: "nuevo1", name, weekly_goal: goal, mine: true, week_total: 0, streak: 0, today_done: true, missions_done: 0, week_ends: s.overview["d-g1"].week_ends,
      missions: [
        { id: "area", title: "Respondan 20 preguntas de Ciencias naturales entre todos", target: 20, progress: 0, done: false },
        { id: "dias", title: "Sumen 3 días de práctica entre todos", target: 3, progress: 1, done: false },
        { id: "aciertos", title: "Logren 25 respuestas correctas entre todos", target: 25, progress: 0, done: false },
      ],
      members: [{ id: "d-me", name: s.me.name, me: true, friend: false, today: true, days: 4, cheered: false }], challenges: [], activities: [] };
    return wait({ id, code: "nuevo1" });
  },
  joinGroup: () => wait({ error: "unknown" }),
  leaveGroup: (id) => { const s = S(); s.groups = s.groups.filter((g) => g.id !== id); delete s.overview[id]; return wait(null); },
  groupPreview: () => wait(null),
  overview: (id) => {
    const o = S().overview[id];
    if (!o) return wait({ error: "not_member" });
    if (id === "d-g1" && demoSample && !o.activities.length) o.activities = [demoActivity(demoSample)];
    return wait(o);
  },
  createChallenge: (g, c) => {
    const o = S().overview[g];
    o.challenges.unshift({ id: `d-c${Date.now()}`, title: c.title, area: c.area || null, metric: c.metric, target: c.target, progress: 0, ends_at: iso(Date.now() + c.days * day), by: S().me.name, can_delete: true });
    return wait({ id: o.challenges[0].id });
  },
  deleteChallenge: (id) => { for (const o of Object.values(S().overview)) o.challenges = o.challenges.filter((c) => c.id !== id); return wait(null); },
  createActivity: (g, a) => {
    const o = S().overview[g];
    o.activities.unshift({ id: `d-a${Date.now()}`, title: a.title, slug: a.slug, keys: a.keys, area: a.area || null, ends_at: iso(Date.now() + a.days * day), by: S().me.name, can_delete: true,
      members: o.members.map((m) => ({ name: m.name, me: m.me, answered: 0 })), questions: a.keys.map((key) => ({ key, answered: 0, pct: null })) });
    return wait({ id: o.activities[0].id });
  },
  deleteActivity: (id) => { for (const o of Object.values(S().overview)) o.activities = o.activities.filter((a) => a.id !== id); return wait(null); },
};

export const friendsApi = demoEnabled ? demo : real;

// ------------------------------------------------------------------------------------------------ helpers

export const AREA_LIST = AREAS;
export const plural = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;
export function daysLeft(endsAt, now = Date.now()) {
  const d = Math.ceil((new Date(endsAt).getTime() - now) / day);
  return d <= 0 ? "Terminó" : d === 1 ? "Queda 1 día" : `Quedan ${d} días`;
}
export const errorText = (e) => ({
  unknown: "No encontramos ese código. Revísalo con tu amigo.",
  self: "Ese es tu propio código.",
  too_many: "Ya hiciste muchas solicitudes hoy. Intenta mañana.",
  too_many_friends: "Llegaste al máximo de amigos.",
  already_today: "Ya le mandaste un mensaje hoy.",
  not_friends: "Solo puedes hacerlo con tus amigos.",
  not_member: "Ya no estás en ese parche.",
  too_many_active: "El parche ya tiene el máximo de retos o prácticas activas.",
  too_many_groups: "Ya estás en 5 parches.",
  full: "Ese parche ya tiene 12 personas.",
  bad: "Revisa los datos.",
})[e] ?? "No pudimos hacerlo ahora. Intenta otra vez.";
