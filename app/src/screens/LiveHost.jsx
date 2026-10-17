import { useEffect, useMemo, useRef, useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import { classShare, distribution, LETTERS, resultsCsv, scoreQuestion, secondsLeft } from "../lib/live.js";
import { usePoll } from "../lib/poll.js";
import AutopsyCard from "../components/AutopsyCard.jsx";
import { Bars } from "./Dashboard.jsx";

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// La sala del docente: código, jugadores, pregunta con cuenta regresiva, respuesta con distribución y, al final,
// cuánto acertó la clase en cada pregunta. Sin podio ni ranking: lo que se proyecta es de la clase entera.
export default function LiveHost({ api, initial, fetchExam, guard, onExit }) {
  const [session, setSession] = useState(initial);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [bundle, setBundle] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const [override, setOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const closing = useRef(null);
  // Share of right answers per question, kept as each one closes (for the end-of-game summary).
  const [trend, setTrend] = useState([]);

  useEffect(() => { guard(() => fetchExam(initial.exam_slug, initial.question_keys)).then((b) => setBundle(b ?? null)); }, [fetchExam, initial.exam_slug, guard]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  usePoll(async () => {
    const t0 = Date.now();
    const server = new Date(await api.liveNow()).getTime();
    setOffset(t0 + (Date.now() - t0) / 2 - server);
    setCalibrated(true);
  }, 30000);
  usePoll(async () => {
    const idx = session.current_index;
    const [s, p, a] = await Promise.all([api.liveSession(initial.id), api.livePlayers(initial.id), idx >= 0 ? api.liveAnswers(initial.id, idx) : []]);
    if (s) setSession(s);
    setPlayers(p);
    setAnswers(a);
  }, 1200, session.state !== "ended");

  const idx = session.current_index;
  const q = useMemo(() => (bundle && idx >= 0 ? bundle.exam.questions.find((x) => x.key === session.question_keys[idx]) ?? null : null), [bundle, idx, session.question_keys]);
  const keyLetter = q ? bundle.key?.get(q.key) ?? null : null;
  // Until the clock is calibrated the full time shows, so a phone with a wrong clock never closes a question early.
  const left = calibrated ? secondsLeft(session, now, offset) : session.seconds_per_question;
  const last = idx >= session.question_keys.length - 1;

  // The booklet key is the accepted answer unless the teacher changes it. Derived, so there is never a stale empty value.
  useEffect(() => { setOverride(null); closing.current = null; }, [idx]);
  const accept = override ?? (keyLetter ? [keyLetter] : []);

  const next = () => { setBusy(true); guard(async () => { setSession(await api.liveNext(initial.id, idx + 1)); setAnswers([]); }).finally(() => setBusy(false)); };
  const reveal = () => {
    if (closing.current === idx) return;
    closing.current = idx;
    setBusy(true);
    guard(async () => {
      const fresh = await api.liveAnswers(initial.id, idx);
      const pts = scoreQuestion(session, players, fresh, accept);
      setSession(await api.liveReveal(initial.id, accept, pts));
      setAnswers(fresh);
      setTrend((t) => [...t.filter((x) => x.n !== idx + 1), { n: idx + 1, ...classShare(fresh, accept) }]);
    }).finally(() => setBusy(false));
  };
  const end = () => guard(async () => setSession(await api.liveEnd(initial.id)));

  // Close by itself when time runs out or everyone answered.
  useEffect(() => {
    if (session.state !== "question" || !q) return;
    // With no key and nothing chosen, wait for the teacher instead of scoring everyone zero.
    if (accept.length === 0) return;
    if (left <= 0 || (players.length > 0 && answers.length >= players.length)) reveal();
  }, [left, answers.length, players.length, session.state, accept.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const dist = distribution(answers, q ? q.options.map((o) => o.letter) : LETTERS);
  const answered = answers.length;

  return (
    <div className="live-host">
      <header className="t-head">
        <div><h1>{session.title || "En vivo"}</h1>
          <span className="caption">Puntajes y claves preliminares. Las respuestas de los jugadores no cuentan para la banda estimada.</span></div>
        <button type="button" className="secondary" onClick={onExit}>{session.state === "ended" ? "Cerrar" : "Salir (la sala sigue abierta)"}</button>
      </header>

      {session.state === "lobby" && (
        <div className="card t-card live-lobby">
          <span className="label">Entra a la app de Cóndor, toca “Juego en vivo” y escribe el código</span>
          <strong className="live-code">{session.code}</strong>
          <span className="caption">{players.length} {players.length === 1 ? "jugador" : "jugadores"} · {session.question_keys.length} preguntas · {session.seconds_per_question} s cada una</span>
          <div className="chips-row">{players.map((p) => <span key={p.player_id} className="badge">{p.nickname}</span>)}</div>
          <div className="report-actions">
            <button type="button" className="primary" disabled={busy || !bundle || players.length === 0} onClick={next}>{players.length === 0 ? "Esperando jugadores…" : "Empezar"}</button>
          </div>
        </div>
      )}

      {session.state === "question" && q && (
        <>
          <div className="card live-status">
            <strong>Pregunta {idx + 1} de {session.question_keys.length}</strong>
            <span className="live-clock">{left} s</span>
            <span>{answered} de {players.length} respondieron</span>
            <button type="button" className="primary" disabled={busy} onClick={reveal}>Cerrar y mostrar respuesta</button>
          </div>
          <div className="card" style={{ display: "grid", gap: 8 }}>
            <span className="label">Respuesta(s) correcta(s)</span>
            <div className="chips-row">
              {q.options.map((o) => (
                <button key={o.letter} type="button" aria-pressed={accept.includes(o.letter)} className={accept.includes(o.letter) ? "chip on" : "chip"}
                  onClick={() => setOverride(accept.includes(o.letter) ? accept.filter((l) => l !== o.letter) : [...accept, o.letter])}>{o.letter}</button>
              ))}
            </div>
            <span className="caption">{keyLetter ? `La clave preliminar es ${keyLetter}. Toca otra letra para aceptarla también.` : "Esta pregunta no tiene clave: elige la correcta antes de cerrar."}</span>
          </div>
          <QuestionView question={q} answer={null} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
        </>
      )}

      {session.state === "reveal" && q && (
        <>
          <div className="card live-status">
            <strong>Pregunta {idx + 1}: respuesta {session.current_correct.join(" o ") || "—"}</strong>
            <span>{answered} de {players.length} respondieron</span>
            {last ? <button type="button" className="primary" onClick={end}>Terminar y ver resumen</button>
              : <button type="button" className="primary" disabled={busy} onClick={next}>Siguiente pregunta</button>}
          </div>
          <div className="d-two">
            <div className="card t-card"><strong>Cómo respondieron</strong>
              <Bars unit="" rows={Object.entries(dist).map(([l, n]) => ({ label: l, value: answered ? Math.round((n / answered) * 100) : 0, color: session.current_correct.includes(l) ? "var(--ok)" : undefined }))} />
              <span className="caption">{Object.entries(dist).map(([l, n]) => `${l}: ${n}`).join(" · ")}</span></div>
            <div className="card t-card"><strong>Cómo va la clase</strong>
              <ClassTrend trend={trend} /></div>
          </div>
          <div className="card t-card"><strong>Autopsia de la pregunta</strong>
            <AutopsyCard counts={dist} correct={session.current_correct} enrichRow={bundle.enrich?.[String(q.number)]} meta={bundle.enrichMeta} /></div>
          <QuestionView question={q} answer={null} graded review={{ correctLetter: session.current_correct[0] ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
        </>
      )}

      {session.state === "ended" && (
        <div className="card t-card">
          <h2>Resumen de la clase</h2>
          <span className="caption">{players.length} {players.length === 1 ? "jugador" : "jugadores"}{trend.length ? ` · la clase acertó en promedio el ${Math.round(trend.reduce((s, x) => s + (x.pct ?? 0), 0) / trend.length)} %` : ""}</span>
          <ClassTrend trend={trend} />
          <div className="report-actions"><button type="button" className="secondary" onClick={() => download(`${session.title || "en vivo"}.csv`, resultsCsv(session.title || "En vivo", players))}>Descargar resultados (CSV)</button></div>
        </div>
      )}
    </div>
  );
}

// Share of the class that got each question right, one bar per closed question.
function ClassTrend({ trend }) {
  if (trend.length === 0) return <span className="caption">Aparece cuando se cierre la primera pregunta.</span>;
  return (
    <div className="class-trend">
      {trend.map((x) => (
        <div key={x.n} className="class-trend-row">
          <span>Pregunta {x.n}</span>
          <div className="progress thin"><span style={{ width: `${x.pct ?? 0}%`, background: (x.pct ?? 0) >= 60 ? "var(--ok)" : (x.pct ?? 0) >= 35 ? "var(--flame)" : "var(--bad)" }} /></div>
          <strong>{x.pct == null ? "—" : `${x.pct} %`}</strong>
        </div>
      ))}
    </div>
  );
}

// Sección “En vivo” del panel docente: salas abiertas y crear una nueva con el constructor de preguntas.
export function LiveSection({ api, courses, exams, fetchExam, guard, AssignBuilder }) {
  const [open, setOpen] = useState([]);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState(null);
  useEffect(() => { guard(async () => setOpen(await api.myLiveSessions())); }, [api, guard, active]);

  if (active) return <LiveHost api={api} initial={active} fetchExam={fetchExam} guard={guard} onExit={() => setActive(null)} />;
  if (creating) {
    return (
      <>
        <header className="t-head"><div><h1>Nueva sala en vivo</h1><span className="caption">Elige las preguntas; los estudiantes entran con un código.</span></div></header>
        <AssignBuilder api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} onCancel={() => setCreating(false)}
          live={{ onCreate: async ({ keys, slug, seconds, title, course }) => {
            const created = await api.liveCreate({ title, exam: slug, keys, seconds, course });
            setCreating(false);
            setActive(created);
          } }} />
      </>
    );
  }
  return (
    <>
      <header className="t-head">
        <div><h1>En vivo</h1><span className="caption">Juego en clase estilo Kahoot con preguntas ICFES: los estudiantes responden desde el celular.</span></div>
        <button type="button" className="primary" onClick={() => setCreating(true)}>Nueva sala</button>
      </header>
      {open.length > 0 && (
        <div className="card t-card">
          <strong>Salas abiertas</strong>
          {open.map((s) => (
            <button key={s.id} type="button" className="assign-row" style={{ width: "100%", textAlign: "left" }} onClick={() => setActive(s)}>
              <span className="assign-tile" />
              <div className="assign-body"><strong>{s.title || "En vivo"} · código {s.code}</strong><span className="caption">{s.question_keys.length} preguntas</span></div>
            </button>
          ))}
        </div>
      )}
      {open.length === 0 && <div className="card t-card"><strong>Todavía no hay salas abiertas</strong><span className="caption">Crea una, proyecta el código y empieza cuando los estudiantes hayan entrado.</span></div>}
    </>
  );
}
