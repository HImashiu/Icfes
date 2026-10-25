// How students answered each question, from delivered attempts (attempt.answers = { key: letter }).
// For "Mis preguntas": answers, share right, the option split and a warning when a wrong option beats the key.
export function questionStats(attempts = [], answerOf = () => null) {
  const out = new Map();
  for (const t of attempts) {
    for (const [key, letter] of Object.entries(t.answers ?? {})) {
      if (!letter) continue;
      const s = out.get(key) ?? { answered: 0, right: 0, dist: {} };
      s.answered += 1;
      s.dist[letter] = (s.dist[letter] ?? 0) + 1;
      if (letter === answerOf(key)) s.right += 1;
      out.set(key, s);
    }
  }
  for (const [key, s] of out) {
    s.pct = s.answered ? Math.round((s.right / s.answered) * 100) : null;
    const top = Object.entries(s.dist).sort((a, b) => b[1] - a[1])[0];
    // With enough answers, a wrong option chosen more than the key suggests a wrong key or a confusing option.
    s.suspect = s.answered >= 5 && top && top[0] !== answerOf(key) && top[1] > s.right ? top[0] : null;
    s.level = s.pct == null ? null : s.pct >= 75 ? "fácil" : s.pct >= 40 ? "media" : "difícil";
  }
  return out;
}
