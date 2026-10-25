import { useEffect, useMemo, useRef, useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import { MODES, isPaused, liveMessage, modeOf, reaskOf, secondsLeft } from "../lib/live.js";
import { explanationOf } from "../lib/lesson.js";
import "./live.css";
import { buzz, confetti, play } from "../lib/motion.js";
import { usePoll } from "../lib/poll.js";

// Unirse a un juego en vivo: código de 6 dígitos y apodo. Sin cuenta se entra como invitado (no se guarda nada).
export function LiveJoin({ auth, initialCode = "", onJoined, onBack }) {
  const [code, setCode] = useState(initialCode);
  const [nick, setNick] = useState(auth.status === "ready" ? (auth.profile.full_name || "").split(" ")[0] : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (auth.status === "signed-out") await auth.joinAsGuest();
      const session = await auth.api.liveJoin(code.trim(), nick.trim());
      onJoined(session, nick.trim());
    } catch (err) {
      setError(err?.message?.includes("anonymous") ? "Los invitados aún no están habilitados. Ingresa con tu cuenta del colegio." : liveMessage(err));
      setBusy(false);
    }
  };
  return (
    <main className="frame live-join">
      <form className="card assign-form" onSubmit={join}>
        <h1>Juego en vivo</h1>
        <label className="field"><span className="label">Código del juego</span>
          <input inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" style={{ fontSize: 28, letterSpacing: 6, textAlign: "center" }} /></label>
        <label className="field"><span className="label">Tu apodo</span>
          <input maxLength={24} value={nick} onChange={(e) => setNick(e.target.value)} /></label>
        {auth.status === "signed-out" && <p className="caption">Entras como invitado: no se guarda nada sobre ti.</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="report-actions">
          <button type="button" className="secondary" onClick={onBack}>Volver</button>
          <button type="submit" className="primary" disabled={busy || code.length !== 6 || !nick.trim()}>Entrar</button>
        </div>
      </form>
    </main>
  );
}

// La pantalla del estudiante durante el juego: sala de espera, pregunta (con «seguro / con dudas» si el docente lo
// pide), pausa, resultado, cómo va la clase y, al final, la revisión de cada pregunta con «Practicar las que fallé».
// Sin ranking: cada estudiante ve solo su propio progreso y el de la clase entera.
export default function LivePlay({ api, initial, nickname, fetchExam, onExit, onPracticeMissed = null }) {
  const [session, setSession] = useState(initial);
  const [players, setPlayers] = useState([]);
  const [mine, setMine] = useState([]);
  const [me, setMe] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [offset, setOffset] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // letter chosen, waiting for "seguro / con dudas"
  const [reviewAt, setReviewAt] = useState(null);
  const sent = useRef(new Set());

  useEffect(() => { api.myPlayerId().then(setMe); }, [api]);
  useEffect(() => { fetchExam(initial.exam_slug, initial.question_keys).then(setBundle).catch((e) => setError(e.message)); }, [fetchExam, initial.exam_slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  // Calibrate the countdown against the database clock, now and every half minute.
  usePoll(async () => {
    const t0 = Date.now();
    const server = new Date(await api.liveNow()).getTime();
    setOffset(t0 + (Date.now() - t0) / 2 - server);
    setCalibrated(true);
  }, 30000);
  usePoll(async () => {
    const [s, p, m] = await Promise.all([api.liveSession(initial.id), api.livePlayers(initial.id), api.liveMyAnswers(initial.id)]);
    if (s) setSession(s);
    setPlayers(p);
    setMine(m);
  }, 1500, session.state !== "ended");

  // Once the game ends, read this player's answers one last time for the review.
  useEffect(() => { if (session.state === "ended") api.liveMyAnswers(initial.id).then(setMine, () => {}); }, [session.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = session.current_index;
  const mode = modeOf(session);
  const together = mode === "class_goal";
  const reask = reaskOf(session, idx) != null;
  // A re-asked round may have shifted the keys, so the bundle is looked up by key each time.
  const byKey = useMemo(() => new Map((bundle?.exam.questions ?? []).map((x) => [x.key, x])), [bundle]);
  const q = bundle && idx >= 0 ? byKey.get(session.question_keys[idx]) ?? null : null;
  const myAnswer = mine.find((a) => a.question_index === idx) ?? null;
  const myPlayer = players.find((p) => p.player_id === me) ?? null;
  const hits = mine.filter((a) => a.points > 0).length;
  const resultRef = useRef(null);
  const cheered = useRef(-1);
  useEffect(() => { setPending(null); }, [idx]);
  // A right answer gets the same cheer as practice, once per question.
  useEffect(() => {
    if (session.state !== "reveal" || cheered.current === idx) return;
    cheered.current = idx;
    const own = mine.find((a) => a.question_index === idx);
    if (!own) return;
    if (session.current_correct.includes(own.option)) { play("correct"); buzz(18); setTimeout(() => confetti(resultRef.current), 50); }
    else { play("wrong"); buzz([30, 40, 30]); }
  }, [session.state, idx, mine, session.current_correct]);
  // Until the clock is calibrated the full time shows, so a phone with a wrong clock never closes a question early.
  const left = calibrated ? secondsLeft(session, now, offset) : session.seconds_per_question + (session.extra_seconds ?? 0);
  const paused = isPaused(session);

  const send = async (letter, confident = null) => {
    if (myAnswer || sent.current.has(idx) || left <= 0 || paused) return;
    sent.current.add(idx);
    setPending(null);
    setMine((cur) => [...cur, { question_index: idx, option: letter, points: 0, confident }]);
    try {
      if (typeof confident === "boolean") await api.liveAnswer(initial.id, idx, letter, confident);
      else await api.liveAnswer(initial.id, idx, letter);
    } catch (e) { sent.current.delete(idx); setMine((cur) => cur.filter((a) => a.question_index !== idx)); setError(liveMessage(e)); }
  };
  const choose = (letter) => (session.ask_confidence ? setPending(letter) : send(letter));
  const stats = session.class_stats;

  // After the game: what this student answered on each first-round question.
  const review = useMemo(() => session.question_keys.map((key, i) => {
    if (i > idx || reaskOf(session, i) != null) return null;
    const a = mine.find((x) => x.question_index === i);
    const correct = session.closed?.[String(i)] ?? (bundle?.key?.get(key) ? [bundle.key.get(key)] : []);
    return { i, key, n: i + 1, option: a?.option ?? null, correct, right: a ? a.points > 0 || correct.includes(a.option) : false };
  }).filter(Boolean), [session, mine, bundle, idx]);
  const missed = review.filter((r) => !r.right).map((r) => r.key);

  return (
    <main className="frame live">
      <header className="live-bar">
        <strong>{nickname}</strong>
        <span className="muted">{together ? (stats?.overall != null ? `Clase: ${stats.overall} %${session.goal_pct ? ` de ${session.goal_pct} %` : ""}` : "Jugamos en equipo") : myPlayer ? `${myPlayer.score} pts · ${hits} ${hits === 1 ? "acierto" : "aciertos"}` : ""}</span>
        <button type="button" className="link" onClick={onExit}>Salir</button>
      </header>
      {error && <p className="notice error" role="alert">{error}</p>}

      {session.state === "lobby" && (
        <div className="card live-wait"><h1>Estás dentro</h1>
          <p>Espera a que el docente empiece. Hay {players.length} {players.length === 1 ? "jugador" : "jugadores"} en la sala.</p>
          <p className="caption">{MODES.find((m) => m.id === mode).help}{session.ask_confidence ? " Después de elegir, dirás si estás seguro o con dudas." : ""}</p></div>
      )}

      {session.state === "question" && q && (
        <>
          <div className={paused ? "live-timer paused" : left <= 5 ? "live-timer urgent" : "live-timer"} aria-live="polite">
            {paused ? <strong>En pausa</strong> : <><strong>{left}</strong> s</>} · pregunta {idx + 1} de {session.question_keys.length}
          </div>
          {reask && <p className="lv-banner">Otra vez, después de discutir. Esta ronda no suma puntos: responde lo que ahora crees.</p>}
          {myAnswer ? (
            <div className="card live-wait"><h2>Respuesta enviada: {myAnswer.option}</h2>
              {typeof myAnswer.confident === "boolean" && <p className="caption">{myAnswer.confident ? "Dijiste que estás seguro." : "Dijiste que tienes dudas."}</p>}
              <p className="caption">Espera a que el docente cierre la pregunta.</p></div>
          ) : left <= 0 ? (
            <div className="card live-wait"><h2>Se acabó el tiempo</h2></div>
          ) : (
            <>
              <QuestionView question={q} answer={pending} onAnswer={paused ? undefined : choose} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
              {pending && (
                <div className="lv-sheet" role="group" aria-label="Qué tan seguro estás">
                  <span>Elegiste <b>{pending}</b>. ¿Qué tan seguro estás?</span>
                  <span className="lv-sheet-btns">
                    <button type="button" className="primary" onClick={() => send(pending, true)}>Seguro</button>
                    <button type="button" className="secondary" onClick={() => send(pending, false)}>Con dudas</button>
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}

      {session.state === "reveal" && q && (
        <>
          <div ref={resultRef} className={`card live-result ${myAnswer && session.current_correct.includes(myAnswer.option) ? "ok" : "bad"}`}>
            <h1>{!myAnswer ? "Sin respuesta" : session.current_correct.includes(myAnswer.option) ? (together || reask || !myAnswer.points ? "¡Correcto!" : `¡Correcto! +${myAnswer.points}`) : "Incorrecto"}</h1>
            <p>Respuesta: {session.current_correct.join(" o ") || "—"}{myAnswer ? ` · tú elegiste ${myAnswer.option}` : ""}</p>
            {stats?.pct != null && <p className="caption">La clase acertó el {stats.pct} % en esta pregunta{together && stats.overall != null ? ` · en total va en ${stats.overall} %${session.goal_pct ? ` (meta ${session.goal_pct} %)` : ""}` : ""}.</p>}
            {!together && myPlayer && <p className="caption">Llevas {myPlayer.score} puntos y {hits} {hits === 1 ? "acierto" : "aciertos"}{myPlayer.streak > 1 ? ` · racha de ${myPlayer.streak}` : ""}</p>}
          </div>
          <QuestionView question={q} answer={myAnswer?.option} graded review={{ correctLetter: session.current_correct[0] ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
        </>
      )}

      {session.state === "ended" && reviewAt == null && (
        <div className="card live-wait lv-end">
          <h1>¡Terminaste!</h1>
          <p>Acertaste {review.filter((r) => r.right).length} de {review.length} {review.length === 1 ? "pregunta" : "preguntas"}.</p>
          {together && stats?.overall != null && <p className="caption">La clase terminó en {stats.overall} %{session.goal_pct ? (stats.overall >= session.goal_pct ? `: ¡lograron la meta de ${session.goal_pct} %!` : ` (la meta era ${session.goal_pct} %)`) : ""}.</p>}
          {!together && myPlayer && <div className="live-me"><span className="pill"><b className="accent-text">{myPlayer.score}</b> puntos</span></div>}
          <ul className="lv-review" aria-label="Tus respuestas">
            {review.map((r) => {
              const question = byKey.get(r.key);
              return (
                <li key={r.i}>
                  <button type="button" className={r.right ? "lv-rv ok" : "lv-rv bad"} onClick={() => setReviewAt(r.i)} disabled={!question}>
                    <span className="lv-qn">{r.n}</span>
                    <span className="lv-qmain"><b>{question ? question.section : `Pregunta ${r.n}`}</b><span className="caption">{r.option ? `Elegiste ${r.option}` : "Sin respuesta"} · correcta {r.correct.join(" o ") || "—"}</span></span>
                    <span aria-hidden="true">{r.right ? "✓" : "✗"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="report-actions">
            {missed.length > 0 && onPracticeMissed && <button type="button" className="secondary" onClick={() => onPracticeMissed(session.exam_slug, missed)}>Practicar las {missed.length} que fallé</button>}
            <button type="button" className="primary" onClick={onExit}>Listo</button>
          </div>
        </div>
      )}
      {session.state === "ended" && reviewAt != null && (() => {
        const r = review.find((x) => x.i === reviewAt);
        const question = r && byKey.get(r.key);
        const why = question && explanationOf(bundle?.enrich?.[String(question.number)]);
        return (
          <>
            <div className="lv-review-nav">
              <button type="button" className="secondary" onClick={() => setReviewAt(null)}>Volver al resumen</button>
              <span className="lv-controls">
                <button type="button" className="secondary" disabled={!review.some((x) => x.i < reviewAt)} onClick={() => setReviewAt([...review].reverse().find((x) => x.i < reviewAt).i)} aria-label="Anterior">‹</button>
                <button type="button" className="secondary" disabled={!review.some((x) => x.i > reviewAt)} onClick={() => setReviewAt(review.find((x) => x.i > reviewAt).i)} aria-label="Siguiente">›</button>
              </span>
            </div>
            {question && <QuestionView question={question} answer={r.option} graded review={{ correctLetter: r.correct[0] ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />}
            {why && <div className="card t-card"><strong>Por qué</strong><p>{why.text}</p></div>}
          </>
        );
      })()}
    </main>
  );
}
