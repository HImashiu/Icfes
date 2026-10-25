// The live game in the demo: the database functions of migration 0004, kept in memory, with a class of invented
// players who join a few seconds after the room opens and answer each question over its first seconds.
// Only first names are shown, as nicknames; there is no ranking anywhere, as in the real game.
const DEMO_NAMES = ["Valentina", "Santiago", "Mariana", "Samuel", "Isabella", "Matías", "Luciana", "Emiliano", "Sara", "Tomás", "Antonia", "Jerónimo", "Gabriela", "Martín", "Salomé", "Juan José", "Daniela", "Simón"];

export function liveRpc({ tables, profile, keyOf }) {
  const rows = () => tables.live_sessions;
  const find = (id) => rows().find((s) => s.id === id);
  let seq = 0;
  const seed = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  return {
    live_now: () => new Date().toISOString(),
    live_create: ({ p_title, p_exam, p_keys, p_seconds, p_course }) => {
      const id = `demo-live-${++seq}`;
      const row = {
        id, code: String(100000 + Math.floor(seed(seq + Date.now() % 997) * 899999)), host_id: profile.id, school_id: profile.school_id, course_id: p_course ?? null,
        title: p_title ?? "", exam_slug: p_exam, question_keys: p_keys, seconds_per_question: p_seconds ?? 60, state: "lobby", current_index: -1,
        question_started_at: null, current_correct: [], created_at: new Date().toISOString(),
      };
      rows().push(row);
      const t0 = Date.now();
      DEMO_NAMES.forEach((name, i) => tables.live_players.push({ session_id: id, player_id: `${id}-p${i}`, nickname: name, profile_id: null, score: 0, streak: 0, joined_at: new Date(t0 + 1500 + i * 450).toISOString() }));
      return row;
    },
    live_next: ({ p_session, p_index }) => {
      const s = find(p_session);
      if (!s || s.state === "ended") throw new Error("bad_question");
      Object.assign(s, { state: "question", current_index: p_index, question_started_at: new Date().toISOString(), current_correct: [] });
      // Each player answers once, between 3 and 70 % of the time; most pick the key.
      const right = keyOf(s.exam_slug, s.question_keys[p_index]);
      const t0 = Date.now();
      tables.live_players.filter((p) => p.session_id === s.id).forEach((p, i) => {
        const r = seed(i * 31 + p_index * 7 + seq);
        if (r > 0.94) return;
        const letters = ["A", "B", "C", "D"].filter((l) => l !== right);
        const option = right && seed(i * 13 + p_index) < 0.62 ? right : letters[Math.floor(seed(i + p_index * 17) * letters.length)];
        tables.live_answers.push({ session_id: s.id, player_id: p.player_id, question_index: p_index, option, answered_at: new Date(t0 + (0.03 + r * 0.67) * s.seconds_per_question * 1000).toISOString(), points: 0 });
      });
      return s;
    },
    live_reveal: ({ p_session, p_correct, p_points }) => {
      const s = find(p_session);
      if (!s || s.state !== "question") throw new Error("not_in_question");
      for (const x of p_points ?? []) {
        const p = tables.live_players.find((y) => y.session_id === s.id && y.player_id === x.player_id);
        if (p) { p.score += Math.max(0, Math.min(2000, x.points)); p.streak = x.points > 0 ? p.streak + 1 : 0; }
      }
      // Players who had not answered yet when the teacher closed the question never answer it.
      const now = Date.now();
      tables.live_answers = tables.live_answers.filter((a) => !(a.session_id === s.id && a.question_index === s.current_index && new Date(a.answered_at) > now));
      Object.assign(s, { state: "reveal", current_correct: p_correct ?? [] });
      return s;
    },
    live_end: ({ p_session }) => {
      const s = find(p_session);
      if (s) s.state = "ended";
      return s ?? null;
    },
  };
}

// Players and answers appear when their time comes, as they would arrive from phones.
export const liveScope = {
  live_players: (r) => !r.joined_at || new Date(r.joined_at) <= Date.now(),
  live_answers: (r) => new Date(r.answered_at) <= Date.now(),
};
