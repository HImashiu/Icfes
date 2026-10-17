import { useEffect, useMemo, useRef, useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import { liveMessage, secondsLeft } from "../lib/live.js";
import { buzz, confetti, play } from "../lib/motion.js";
import { usePoll } from "../lib/poll.js";

// Unirse a un juego en vivo: código de 6 dígitos y apodo. Sin cuenta se entra como invitado (no se guarda nada).
export function LiveJoin({ auth, onJoined, onBack }) {
  const [code, setCode] = useState("");
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

// La pantalla del estudiante durante el juego: sala de espera, pregunta, resultado y resumen final.
// Sin ranking: cada estudiante ve solo su propio progreso (aciertos, puntos, racha).
export default function LivePlay({ api, initial, nickname, fetchExam, onExit }) {
  const [session, setSession] = useState(initial);
  const [players, setPlayers] = useState([]);
  const [mine, setMine] = useState([]);
  const [me, setMe] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [offset, setOffset] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState(null);
  const sent = useRef(new Set());

  useEffect(() => { api.myPlayerId().then(setMe); }, [api]);
  useEffect(() => { fetchExam(initial.exam_slug, initial.question_keys).then(setBundle).catch((e) => setError(e.message)); }, [fetchExam, initial.exam_slug]);
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

  const idx = session.current_index;
  const q = useMemo(() => {
    if (!bundle || idx < 0) return null;
    const key = session.question_keys[idx];
    return bundle.exam.questions.find((x) => x.key === key) ?? null;
  }, [bundle, idx, session.question_keys]);
  const myAnswer = mine.find((a) => a.question_index === idx) ?? null;
  const myPlayer = players.find((p) => p.player_id === me) ?? null;
  const hits = mine.filter((a) => a.points > 0).length;
  const resultRef = useRef(null);
  const cheered = useRef(-1);
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
  const left = calibrated ? secondsLeft(session, now, offset) : session.seconds_per_question;

  const choose = async (letter) => {
    if (myAnswer || sent.current.has(idx) || left <= 0) return;
    sent.current.add(idx);
    setMine((cur) => [...cur, { question_index: idx, option: letter, points: 0 }]);
    try { await api.liveAnswer(initial.id, idx, letter); } catch (e) { sent.current.delete(idx); setMine((cur) => cur.filter((a) => a.question_index !== idx)); setError(liveMessage(e)); }
  };

  return (
    <main className="frame live">
      <header className="live-bar">
        <strong>{nickname}</strong>
        <span className="muted">{myPlayer ? `${myPlayer.score} pts · ${hits} ${hits === 1 ? "acierto" : "aciertos"}` : ""}</span>
        <button type="button" className="link" onClick={onExit}>Salir</button>
      </header>
      {error && <p className="notice error" role="alert">{error}</p>}

      {session.state === "lobby" && (
        <div className="card live-wait"><h1>Estás dentro</h1><p>Espera a que el docente empiece. Hay {players.length} {players.length === 1 ? "jugador" : "jugadores"} en la sala.</p></div>
      )}

      {session.state === "question" && q && (
        <>
          <div className={left <= 5 ? "live-timer urgent" : "live-timer"} aria-live="polite"><strong>{left}</strong> s · pregunta {idx + 1} de {session.question_keys.length}</div>
          {myAnswer ? (
            <div className="card live-wait"><h2>Respuesta enviada: {myAnswer.option}</h2><p className="caption">Espera a que el docente cierre la pregunta.</p></div>
          ) : left <= 0 ? (
            <div className="card live-wait"><h2>Se acabó el tiempo</h2></div>
          ) : (
            <QuestionView question={q} answer={null} onAnswer={choose} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
          )}
        </>
      )}

      {session.state === "reveal" && q && (
        <>
          <div ref={resultRef} className={`card live-result ${myAnswer && session.current_correct.includes(myAnswer.option) ? "ok" : "bad"}`}>
            <h1>{!myAnswer ? "Sin respuesta" : session.current_correct.includes(myAnswer.option) ? `¡Correcto! +${myAnswer.points}` : "Incorrecto"}</h1>
            <p>Respuesta: {session.current_correct.join(" o ") || "—"}{myAnswer ? ` · tú elegiste ${myAnswer.option}` : ""}</p>
            {myPlayer && <p className="caption">Llevas {myPlayer.score} puntos y {hits} {hits === 1 ? "acierto" : "aciertos"}{myPlayer.streak > 1 ? ` · racha de ${myPlayer.streak}` : ""}</p>}
          </div>
          <QuestionView question={q} answer={myAnswer?.option} graded review={{ correctLetter: session.current_correct[0] ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
        </>
      )}

      {session.state === "ended" && (
        <div className="card live-wait">
          <h1>¡Terminaste!</h1>
          <p>Acertaste {hits} de {session.question_keys.length} {session.question_keys.length === 1 ? "pregunta" : "preguntas"}.</p>
          {myPlayer && <div className="live-me"><span className="pill"><b className="accent-text">{myPlayer.score}</b> puntos</span></div>}
          <button type="button" className="primary" onClick={onExit}>Listo</button>
        </div>
      )}
    </main>
  );
}
