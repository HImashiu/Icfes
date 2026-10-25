// Demo: the live game with an invented class. The room's database functions run in memory, and the students of the
// chosen class (or invented guests) join and answer on their own, with believable speed, mistakes, one popular wrong
// answer per question and, when asked, "sure / unsure". Nothing leaves the browser.
import { FIRST } from "./names.js";

const iso = () => new Date().toISOString();
const LETTERS = ["A", "B", "C", "D"];

export function liveRpc(tables, profile, bundles) {
  const find = (id) => tables.live_sessions.find((s) => s.id === id);
  const later = (ms, fn) => setTimeout(fn, ms);
  let seq = 0;
  // A stable random per text, so a bot keeps its skill and a question keeps its tempting wrong answer.
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; };
  const keyOf = (session, key) => {
    if (session.exam_slug === "teacher") return tables.teacher_questions?.find((q) => q.id === key)?.answer ?? null;
    return bundles?.get(session.exam_slug)?.key?.get(key) ?? null;
  };

  function join(session) {
    const members = (tables.course_members ?? []).filter((m) => m.course_id === session.course_id && m.role === "student");
    const people = members.length ? members.slice(0, 26).map((m) => ({ nick: String(m.full_name ?? "").split(" ")[0] || "Invitado", profile: m.profile_id ?? null }))
      : FIRST.slice(0, 22).map((n) => ({ nick: n, profile: null }));
    const used = new Map();
    people.forEach((p, i) => later(400 + i * 160 + Math.random() * 600, () => {
      if (find(session.id)?.state === "ended") return;
      const n = (used.get(p.nick) ?? 0) + 1;
      used.set(p.nick, n);
      tables.live_players.push({ session_id: session.id, player_id: `bot-${session.id}-${i}`, nickname: n > 1 ? `${p.nick} ${n}` : p.nick, profile_id: p.profile, score: 0, streak: 0, joined_at: iso() });
    }));
  }

  function answerLater(session, idx) {
    const key = session.question_keys[idx];
    const right = keyOf(session, key);
    const reask = session.reasks?.[String(idx)] != null;
    const tempting = LETTERS.filter((l) => l !== right)[Math.floor(hash(`${session.id}:${key}`) * 3)];
    const limit = (session.seconds_per_question ?? 60) * 1000;
    for (const p of tables.live_players.filter((x) => x.session_id === session.id)) {
      const skill = 0.3 + 0.6 * hash(p.player_id) + (reask ? 0.2 : 0) - 0.25 * hash(`${key}`);
      const delay = 1800 + Math.random() * Math.min(11000, limit * 0.6);
      const go = () => {
        const s = find(session.id);
        if (!s || s.state !== "question" || s.current_index !== idx) return;
        if (s.paused_at) { later(1000, go); return; }
        if (tables.live_answers.some((a) => a.session_id === s.id && a.player_id === p.player_id && a.question_index === idx)) return;
        if (Math.random() < 0.04) return; // someone always forgets to answer
        const ok = right && Math.random() < skill;
        const option = ok ? right : Math.random() < 0.6 ? tempting : LETTERS.filter((l) => l !== right)[Math.floor(Math.random() * 3)];
        tables.live_answers.push({
          session_id: s.id, player_id: p.player_id, question_index: idx, option, answered_at: iso(), points: 0,
          confident: s.ask_confidence ? (ok ? Math.random() < 0.7 : Math.random() < 0.45) : null,
        });
      };
      later(delay, go);
    }
  }

  const next = ({ p_session, p_index }) => {
    const s = find(p_session);
    if (!s || s.state === "ended" || p_index < 0 || p_index >= s.question_keys.length) throw new Error("bad_question");
    Object.assign(s, { state: "question", current_index: p_index, question_started_at: iso(), current_correct: [], extra_seconds: 0, paused_at: null, class_stats: null });
    answerLater(s, p_index);
    return s;
  };

  return {
    live_now: () => iso(),
    live_create: ({ p_title, p_exam, p_keys, p_seconds, p_course }) => {
      const row = {
        id: `demo-live-${Date.now()}-${++seq}`, code: String(100000 + Math.floor(Math.random() * 900000)), host_id: profile.id, school_id: profile.school_id,
        course_id: p_course ?? null, title: p_title ?? "", exam_slug: p_exam, question_keys: [...p_keys], seconds_per_question: p_seconds ?? 60,
        state: "lobby", current_index: -1, question_started_at: null, current_correct: [], created_at: iso(),
        mode: "classic", goal_pct: null, ask_confidence: false, extra_seconds: 0, paused_at: null, reasks: {}, closed: {}, class_stats: null, ended_at: null,
      };
      tables.live_sessions.push(row);
      join(row);
      return row;
    },
    // Migration 0025: a game programmed for a date and time. The invented class joins once it opens.
    live_schedule: ({ p_title, p_exam, p_keys, p_seconds, p_course, p_at }) => {
      const at = new Date(p_at).getTime();
      if (!Number.isFinite(at) || at < Date.now() - 5 * 60000) throw new Error("bad_time");
      const row = {
        id: `demo-live-${Date.now()}-${++seq}`, code: String(100000 + Math.floor(Math.random() * 900000)), host_id: profile.id, school_id: profile.school_id,
        course_id: p_course ?? null, title: p_title ?? "", exam_slug: p_exam, question_keys: [...p_keys], seconds_per_question: p_seconds ?? 60,
        state: "lobby", current_index: -1, question_started_at: null, current_correct: [], created_at: iso(),
        mode: "classic", goal_pct: null, ask_confidence: false, extra_seconds: 0, paused_at: null, reasks: {}, closed: {}, class_stats: null, ended_at: null,
        scheduled_at: at > Date.now() ? new Date(at).toISOString() : null,
      };
      tables.live_sessions.push(row);
      if (!row.scheduled_at) join(row);
      return row;
    },
    live_reschedule: ({ p_session, p_at }) => {
      const s = find(p_session);
      if (!s || s.state === "ended") throw new Error("not_allowed");
      const at = p_at ? new Date(p_at).getTime() : null;
      s.scheduled_at = at && at > Date.now() ? new Date(at).toISOString() : null;
      if (!s.scheduled_at && !tables.live_players.some((p) => p.session_id === s.id)) join(s);
      return s;
    },
    live_configure: ({ p_session, p_mode, p_goal, p_confidence }) => {
      const s = find(p_session);
      if (!s) throw new Error("not_allowed");
      Object.assign(s, { mode: ["classic", "accuracy", "class_goal"].includes(p_mode) ? p_mode : s.mode, goal_pct: p_goal >= 10 && p_goal <= 100 ? p_goal : null, ask_confidence: Boolean(p_confidence) });
      return s;
    },
    live_next: next,
    live_pause: ({ p_session, p_pause }) => {
      const s = find(p_session);
      if (s?.state === "question") {
        if (p_pause && !s.paused_at) s.paused_at = iso();
        else if (!p_pause && s.paused_at) {
          s.question_started_at = new Date(new Date(s.question_started_at).getTime() + (Date.now() - new Date(s.paused_at).getTime())).toISOString();
          s.paused_at = null;
        }
      }
      return s;
    },
    live_add_time: ({ p_session, p_seconds }) => {
      const s = find(p_session);
      if (s?.state === "question") s.extra_seconds = Math.min(600, (s.extra_seconds ?? 0) + (p_seconds ?? 15));
      return s;
    },
    live_reveal: ({ p_session, p_correct, p_points }) => {
      const s = find(p_session);
      if (!s || s.state !== "question") throw new Error("not_in_question");
      const idx = s.current_index;
      const pts = new Map((p_points ?? []).map((x) => [x.player_id, Math.max(0, Math.min(2000, x.points))]));
      for (const a of tables.live_answers.filter((x) => x.session_id === s.id && x.question_index === idx)) a.points = pts.get(a.player_id) ?? 0;
      const reask = s.reasks?.[String(idx)] != null;
      for (const p of tables.live_players.filter((x) => x.session_id === s.id)) {
        const got = pts.get(p.player_id) ?? 0;
        p.score += got;
        if (!reask) p.streak = got > 0 ? p.streak + 1 : 0;
      }
      Object.assign(s, { state: "reveal", current_correct: p_correct ?? [], paused_at: null, closed: { ...(s.closed ?? {}), [String(idx)]: p_correct ?? [] } });
      return s;
    },
    live_reask: ({ p_session }) => {
      const s = find(p_session);
      if (!s || s.state !== "reveal") throw new Error("not_in_reveal");
      const idx = s.current_index;
      const orig = s.reasks?.[String(idx)] ?? idx;
      s.question_keys = [...s.question_keys.slice(0, idx + 1), s.question_keys[idx], ...s.question_keys.slice(idx + 1)];
      s.reasks = { ...(s.reasks ?? {}), [String(idx + 1)]: orig };
      return next({ p_session, p_index: idx + 1 });
    },
    live_share: ({ p_session, p_stats }) => {
      const s = find(p_session);
      if (s) s.class_stats = { pct: p_stats?.pct ?? 0, overall: p_stats?.overall ?? 0, answered: p_stats?.answered ?? 0 };
      return null;
    },
    live_end: ({ p_session }) => {
      const s = find(p_session);
      if (s) Object.assign(s, { state: "ended", paused_at: null, ended_at: s.ended_at ?? iso() });
      return s;
    },
  };
}
