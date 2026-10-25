import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import QuestionView from "../components/QuestionView.jsx";
import {
  GOALS, LETTERS, MODES, classProgress, classShare, distribution, gameReport, isOpenNow, isPaused, liveMessage, modeOf, reaskOf,
  resultsCsv, scoreQuestion, secondsLeft, whenLabel,
} from "../lib/live.js";
import { usePoll } from "../lib/poll.js";
import AutopsyCard from "../components/AutopsyCard.jsx";
import LiveQr from "../components/LiveQr.jsx";
import { DateField, Select, confirmDialog } from "../components/Controls.jsx";
import { joinUrl } from "../lib/joinLink.js";
import { Bars } from "./Dashboard.jsx";
import "./live.css";

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
const pctColor = (p) => ((p ?? 0) >= 60 ? "var(--ok)" : (p ?? 0) >= 35 ? "var(--flame)" : "var(--bad)");
const isoDay = (d) => d.toISOString().slice(0, 10);

// La sala del docente: código, ajustes del juego, jugadores, pregunta con cuenta regresiva (pausa, más tiempo,
// saltar), respuesta con distribución, seguridad de la clase, volver a preguntar después de discutir y, al final,
// el informe completo. Sin podio ni ranking: lo que se proyecta es de la clase entera.
export default function LiveHost({ api, initial, fetchExam, guard, onExit, courses = [], onReplay = null }) {
  const [session, setSession] = useState(initial);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [bundle, setBundle] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const [override, setOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const closing = useRef(null);
  // Share of right answers per question, kept as each one closes (for the trend and the class goal).
  const [trend, setTrend] = useState([]);
  // Letters accepted at each closed question, in case the database is older than 0024 and does not keep them.
  const [closedHere, setClosedHere] = useState({});

  useEffect(() => { guard(() => fetchExam(initial.exam_slug, initial.question_keys)).then((b) => setBundle(b ?? null)); }, [fetchExam, initial.exam_slug, guard]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const mode = modeOf(session);
  const goal = mode === "class_goal" ? session.goal_pct ?? 70 : null;
  const reaskFrom = reaskOf(session, idx);
  const q = useMemo(() => (bundle && idx >= 0 ? bundle.exam.questions.find((x) => x.key === session.question_keys[idx]) ?? null : null), [bundle, idx, session.question_keys]);
  const keyLetter = q ? bundle.key?.get(q.key) ?? null : null;
  // Until the clock is calibrated the full time shows, so a phone with a wrong clock never closes a question early.
  const left = calibrated ? secondsLeft(session, now, offset) : session.seconds_per_question + (session.extra_seconds ?? 0);
  const paused = isPaused(session);
  const last = idx >= session.question_keys.length - 1;

  // The booklet key is the accepted answer unless the teacher changes it. Derived, so there is never a stale empty value.
  useEffect(() => { setOverride(null); closing.current = null; }, [idx]);
  const accept = override ?? (keyLetter ? [keyLetter] : []);
  const fail = (e) => setNote(liveMessage(e));
  const act = (fn) => { setBusy(true); setNote(null); return Promise.resolve().then(fn).catch(fail).finally(() => setBusy(false)); };

  const next = () => act(async () => { setSession(await api.liveNext(initial.id, idx + 1)); setAnswers([]); });
  const progressNow = (t) => classProgress(t, goal);
  const reveal = () => {
    if (closing.current === idx) return;
    closing.current = idx;
    act(async () => {
      const fresh = await api.liveAnswers(initial.id, idx);
      const pts = scoreQuestion(session, players, fresh, accept);
      setSession(await api.liveReveal(initial.id, accept, pts));
      setAnswers(fresh);
      setClosedHere((c) => ({ ...c, [idx]: accept }));
      const share = classShare(fresh, accept);
      const t = [...trend.filter((x) => x.n !== idx + 1), { n: idx + 1, reask: reaskFrom != null, ...share }];
      setTrend(t);
      // Every phone sees how the class did (never a position). Older databases have no live_share: nothing breaks.
      api.liveShare?.(initial.id, { pct: share.pct ?? 0, overall: progressNow(t).pct ?? 0, answered: share.answered }).catch(() => {});
    });
  };
  const end = () => act(async () => setSession(await api.liveEnd(initial.id)));
  // Ends the game at any moment (in the lobby, mid-question): players see the end screen and the room leaves the list.
  const finish = async () => {
    const asked = session.state === "lobby"
      ? "¿Cerrar la sala? Nadie más podrá entrar con este código."
      : `¿Terminar el juego ahora? Se cierran las ${session.question_keys.length - idx - (session.state === "reveal" ? 1 : 0)} preguntas que faltan y ves el informe.`;
    if (!(await confirmDialog(asked, { confirmLabel: session.state === "lobby" ? "Cerrar sala" : "Terminar juego", danger: true }))) return;
    act(async () => setSession(await api.liveEnd(initial.id)));
  };
  const pause = () => act(async () => setSession(await api.livePause(initial.id, !paused)));
  const addTime = () => act(async () => setSession(await api.liveAddTime(initial.id, 15)));
  const skip = () => act(async () => {
    setTrend((t) => [...t.filter((x) => x.n !== idx + 1), { n: idx + 1, skipped: true, answered: 0, right: 0, pct: null }]);
    if (last) setSession(await api.liveEnd(initial.id));
    else { setSession(await api.liveNext(initial.id, idx + 1)); setAnswers([]); }
  });
  const reask = () => act(async () => { setSession(await api.liveReask(initial.id)); setAnswers([]); });

  // Close by itself when time runs out or everyone answered (never while paused).
  useEffect(() => {
    if (session.state !== "question" || !q || paused) return;
    // With no key and nothing chosen, wait for the teacher instead of scoring everyone zero.
    if (accept.length === 0) return;
    if (left <= 0 || (players.length > 0 && answers.length >= players.length)) reveal();
  }, [left, answers.length, players.length, session.state, accept.length, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const dist = distribution(answers, q ? q.options.map((o) => o.letter) : LETTERS);
  const answered = answers.length;
  const prog = progressNow(trend);
  const conf = session.ask_confidence ? confidenceSplit(answers, session.current_correct) : null;
  const before = reaskFrom != null ? trend.find((t) => t.n === reaskFrom + 1) : null;

  if (session.state === "ended") {
    return <LiveReport api={api} session={session} bundle={bundle} courses={courses} guard={guard} closed={closedHere} onExit={onExit} onReplay={onReplay} />;
  }

  return (
    <div className="live-host">
      <header className="t-head">
        <div><h1>{session.title || "En vivo"}</h1>
          <span className="caption">{MODES.find((m) => m.id === mode).label} · puntajes y claves preliminares. Las respuestas de los jugadores no cuentan para la banda estimada.</span></div>
        <span className="live-head-actions">
          <button type="button" className="secondary live-end" disabled={busy} onClick={finish}><Icon name="stop" size={16} />{session.state === "lobby" ? "Cerrar sala" : "Terminar juego"}</button>
          <button type="button" className="link" onClick={onExit}>Salir sin cerrar</button>
        </span>
      </header>
      {note && <p className="notice error" role="alert">{note}</p>}

      {session.state === "lobby" && (
        <div className="lv-lobby">
          <div className="card t-card live-lobby">
            <div className="live-invite">
              <LiveQr value={joinUrl(String(session.code))} size={300} />
              <div className="live-invite-text">
                <span className="label">Escanea el código con la cámara del celular</span>
                <span className="caption">o entra a la app de Cóndor, toca “Juego en vivo” y escribe el código</span>
                <strong className="live-code">{session.code}</strong>
              </div>
            </div>
            <span className="caption">{players.length} {players.length === 1 ? "jugador" : "jugadores"} · {session.question_keys.length} preguntas · {session.seconds_per_question} s cada una</span>
            <div className="chips-row">{players.map((p) => <span key={p.player_id} className="badge">{p.nickname}</span>)}</div>
            <div className="report-actions">
              <button type="button" className="primary" disabled={busy || !bundle || players.length === 0} onClick={next}>{players.length === 0 ? "Esperando jugadores…" : "Empezar"}</button>
            </div>
          </div>
          <GameSettings api={api} session={session} setSession={setSession} onError={fail} />
        </div>
      )}

      {session.state === "question" && q && (
        <>
          <div className={paused ? "card live-status lv-paused" : "card live-status"}>
            <strong>{reaskFrom != null ? `Pregunta ${reaskFrom + 1} otra vez, después de discutir` : `Pregunta ${idx + 1} de ${session.question_keys.length}`}</strong>
            <span className="live-clock">{paused ? "En pausa" : `${left} s`}</span>
            <span>{answered} de {players.length} respondieron</span>
            <span className="lv-controls">
              <button type="button" className="secondary" disabled={busy} onClick={pause}><Icon name={paused ? "play" : "clock"} size={16} />{paused ? "Reanudar" : "Pausar"}</button>
              <button type="button" className="secondary" disabled={busy || paused} onClick={addTime}>+15 s</button>
              <button type="button" className="secondary" disabled={busy} onClick={skip}>Saltar</button>
              <button type="button" className="primary" disabled={busy} onClick={reveal}>Cerrar y mostrar respuesta</button>
            </span>
          </div>
          {goal != null && <GoalBar progress={prog} />}
          <div className="card" style={{ display: "grid", gap: 8 }}>
            <span className="label">Respuesta(s) correcta(s)</span>
            <div className="chips-row">
              {q.options.map((o) => (
                <button key={o.letter} type="button" aria-pressed={accept.includes(o.letter)} className={accept.includes(o.letter) ? "chip on" : "chip"}
                  onClick={() => setOverride(accept.includes(o.letter) ? accept.filter((l) => l !== o.letter) : [...accept, o.letter])}>{o.letter}</button>
              ))}
            </div>
            <span className="caption">{keyLetter ? `La clave preliminar es ${keyLetter}. Toca otra letra para aceptarla también.` : "Esta pregunta no tiene clave: elige la correcta antes de cerrar."}{reaskFrom != null ? " Esta ronda no suma puntos: sirve para ver si la discusión cambió las respuestas." : ""}</span>
          </div>
          <QuestionView question={q} answer={null} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
        </>
      )}

      {session.state === "reveal" && q && (
        <>
          <div className="card live-status">
            <strong>Pregunta {(reaskFrom ?? idx) + 1}{reaskFrom != null ? " (otra vez)" : ""}: respuesta {session.current_correct.join(" o ") || "—"}</strong>
            <span>{answered} de {players.length} respondieron</span>
            <span className="lv-controls">
              {reaskFrom == null && <button type="button" className="secondary" disabled={busy} onClick={reask} title="La clase discute y vuelve a responder la misma pregunta">Volver a preguntar</button>}
              {last ? <button type="button" className="primary" disabled={busy} onClick={end}>Terminar y ver informe</button>
                : <button type="button" className="primary" disabled={busy} onClick={next}>Siguiente pregunta</button>}
            </span>
          </div>
          {goal != null && <GoalBar progress={prog} />}
          <div className="d-two">
            <div className="card t-card"><strong>Cómo respondieron</strong>
              <Bars unit="" rows={Object.entries(dist).map(([l, n]) => ({ label: l, value: answered ? Math.round((n / answered) * 100) : 0, color: session.current_correct.includes(l) ? "var(--ok)" : undefined }))} />
              <span className="caption">{Object.entries(dist).map(([l, n]) => `${l}: ${n}`).join(" · ")}</span></div>
            {before ? (
              <div className="card t-card"><strong>Antes y después de discutir</strong>
                <Bars rows={[{ label: "Antes", value: before.pct ?? 0, color: pctColor(before.pct) }, { label: "Ahora", value: classShare(answers, session.current_correct).pct ?? 0, color: pctColor(classShare(answers, session.current_correct).pct) }]} />
                <span className="caption">{deltaText(before.pct, classShare(answers, session.current_correct).pct)}</span></div>
            ) : (
              <div className="card t-card"><strong>Cómo va la clase</strong><ClassTrend trend={trend} /></div>
            )}
          </div>
          {conf && <ConfidenceCard conf={conf} />}
          {reaskFrom == null && (classShare(answers, session.current_correct).pct ?? 100) < 70 && answered > 1 && (
            <p className="lv-tip"><Icon name="bolt" size={16} />Menos del 70 % acertó. Una buena jugada: que discutan en parejas un minuto y tocar «Volver a preguntar».</p>
          )}
          <div className="card t-card"><strong>Autopsia de la pregunta</strong>
            <AutopsyCard counts={dist} correct={session.current_correct} enrichRow={bundle.enrich?.[String(q.number)]} meta={bundle.enrichMeta} /></div>
          <QuestionView question={q} answer={null} graded review={{ correctLetter: session.current_correct[0] ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
        </>
      )}
    </div>
  );
}

const deltaText = (a, b) => {
  if (a == null || b == null) return "";
  const d = b - a;
  if (d > 0) return `La discusión subió los aciertos ${d} puntos.`;
  if (d < 0) return `Bajaron ${-d} puntos: vale la pena explicarla.`;
  return "Igual que antes: conviene explicarla.";
};

function confidenceSplit(answers, correct) {
  const rows = answers.filter((a) => typeof a.confident === "boolean");
  const c = (sure, right) => rows.filter((a) => a.confident === sure && correct.includes(a.option) === right).length;
  return { total: rows.length, sureRight: c(true, true), sureWrong: c(true, false), unsureRight: c(false, true), unsureWrong: c(false, false) };
}

// Sure + wrong is a misconception (worth stopping for); unsure + right is a lucky or fragile hit.
function ConfidenceCard({ conf }) {
  if (!conf.total) return null;
  const cells = [
    ["Seguros y acertaron", conf.sureRight, "ok"], ["Seguros y se equivocaron", conf.sureWrong, "bad"],
    ["Con dudas y acertaron", conf.unsureRight, "flame"], ["Con dudas y se equivocaron", conf.unsureWrong, "muted"],
  ];
  return (
    <div className="card t-card">
      <strong>Qué tan seguros estaban</strong>
      <div className="lv-conf">{cells.map(([l, n, tone]) => <span key={l} className={`lv-conf-cell ${tone}`}><b>{n}</b>{l}</span>)}</div>
      <span className="caption">{conf.sureWrong >= Math.max(2, conf.sureRight) ? "Muchos estaban seguros de una respuesta equivocada: es una idea errada de la clase, no un descuido." : conf.unsureRight > conf.sureRight ? "Acertaron, pero con dudas: refuerza el porqué." : "La seguridad coincide con los aciertos."}</span>
    </div>
  );
}

function GoalBar({ progress }) {
  const { pct, goal, reached, closed } = progress;
  return (
    <div className={reached ? "card lv-goal reached" : "card lv-goal"}>
      <span className="label">Meta de la clase: {goal} %</span>
      <div className="lv-goal-track"><span style={{ width: `${pct ?? 0}%` }} /><i style={{ left: `${goal}%` }} aria-hidden="true" /></div>
      <span className="caption">{closed === 0 ? "Empieza al cerrar la primera pregunta." : reached ? `¡La clase va en ${pct} %, por encima de la meta!` : `La clase va en ${pct} %. Faltan ${goal - pct} puntos.`}</span>
    </div>
  );
}

// Ajustes del juego en la sala de espera: modo, meta de la clase y si se pregunta la seguridad.
function GameSettings({ api, session, setSession, onError }) {
  const mode = modeOf(session);
  const save = (patch) => {
    const next = { mode, goal: session.goal_pct ?? 70, confidence: Boolean(session.ask_confidence), ...patch };
    if (!api.liveConfigure) return;
    api.liveConfigure(session.id, next).then((s) => s && setSession(s), onError);
  };
  return (
    <div className="card t-card lv-settings">
      <strong>Cómo se juega</strong>
      <div className="lv-modes" role="radiogroup" aria-label="Modo de juego">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? "lv-mode on" : "lv-mode"} onClick={() => save({ mode: m.id })}>
            <b>{m.label}</b><span className="caption">{m.help}</span>
          </button>
        ))}
      </div>
      {mode === "class_goal" && (
        <div className="field"><span className="label">Meta de aciertos de toda la clase</span>
          <div className="chips-row">{GOALS.map((g) => <button key={g} type="button" className={(session.goal_pct ?? 70) === g ? "chip on" : "chip"} aria-pressed={(session.goal_pct ?? 70) === g} onClick={() => save({ goal: g })}>{g} %</button>)}</div>
        </div>
      )}
      <label className="lv-check">
        <input type="checkbox" checked={Boolean(session.ask_confidence)} onChange={(e) => save({ confidence: e.target.checked })} />
        <span><b>Preguntar qué tan seguros están</b><span className="caption">Al responder tocan «Seguro» o «Con dudas». Así ves qué errores son ideas equivocadas y no descuidos.</span></span>
      </label>
      <span className="caption">Durante el juego puedes pausar, dar 15 s más, saltar una pregunta y volver a preguntarla después de que la discutan.</span>
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
          <span>Pregunta {x.n}{x.reask ? " (otra vez)" : ""}</span>
          <div className="progress thin"><span style={{ width: `${x.pct ?? 0}%`, background: pctColor(x.pct) }} /></div>
          <strong>{x.skipped ? "saltada" : x.pct == null ? "—" : `${x.pct} %`}</strong>
        </div>
      ))}
    </div>
  );
}

// El informe de un juego (al terminar o desde «Juegos anteriores»): resumen, cada pregunta, cada estudiante en orden
// alfabético (solo lo ve el docente) y qué reforzar, con la tarea de refuerzo y la revancha a un clic.
export function LiveReport({ api, session, bundle: given = null, fetchExam = null, courses = [], guard, closed = null, onExit, onReplay = null }) {
  const [bundle, setBundle] = useState(given);
  const [players, setPlayers] = useState(null);
  const [answers, setAnswers] = useState(null);
  const [tab, setTab] = useState("preguntas");
  const [open, setOpen] = useState(null);
  const [making, setMaking] = useState(false);
  useEffect(() => { if (given) setBundle(given); }, [given]);
  useEffect(() => { if (!given && fetchExam) guard(() => fetchExam(session.exam_slug, session.question_keys)).then((b) => setBundle(b ?? null)); }, [given, fetchExam, session.exam_slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    guard(async () => {
      const [p, a] = await Promise.all([api.livePlayers(session.id), api.liveAllAnswers ? api.liveAllAnswers(session.id) : []]);
      setPlayers(p ?? []);
      setAnswers(a ?? []);
    });
  }, [api, session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const report = useMemo(() => (players && answers ? gameReport({ session, players, answers, keyFor: (k) => bundle?.key?.get(k) ?? null, closed }) : null), [session, players, answers, bundle, closed]);
  const qOf = useCallback((key) => bundle?.exam.questions.find((x) => x.key === key) ?? null, [bundle]);
  const mode = modeOf(session);
  const goal = mode === "class_goal" ? session.goal_pct ?? 70 : null;
  const reinforceKeys = [...new Set((report?.toReinforce ?? []).map((x) => x.key))];

  return (
    <div className="live-host">
      <header className="t-head">
        <div><h1>Informe · {session.title || "En vivo"}</h1>
          <span className="caption">{new Date(session.created_at ?? Date.now()).toLocaleDateString("es-CO", { day: "numeric", month: "long" })} · {MODES.find((m) => m.id === mode).label} · solo tú ves los nombres; nadie ve posiciones.</span></div>
        <button type="button" className="secondary" onClick={onExit}>Cerrar</button>
      </header>
      {!report && <p className="caption">Cargando el informe…</p>}
      {report && (
        <>
          <div className="lv-tiles">
            <span className="lv-tile"><b>{report.people.length}</b>jugadores</span>
            <span className="lv-tile"><b>{report.questions.filter((x) => x.reaskOf == null && !x.skipped).length}</b>preguntas{report.questions.some((x) => x.skipped) ? ` (${report.questions.filter((x) => x.skipped).length} saltadas)` : ""}</span>
            <span className="lv-tile"><b style={{ color: pctColor(report.classPct) }}>{report.classPct == null ? "—" : `${report.classPct} %`}</b>aciertos de la clase</span>
            <span className="lv-tile"><b>{report.participation == null ? "—" : `${report.participation} %`}</b>participación</span>
            {goal != null && <span className={report.classPct >= goal ? "lv-tile ok" : "lv-tile"}><b>{report.classPct >= goal ? "¡Lograda!" : "No esta vez"}</b>meta de {goal} %</span>}
          </div>
          {report.reasks.length > 0 && (
            <div className="card t-card"><strong>Lo que cambió al discutir</strong>
              {report.reasks.map((r) => <span key={r.n} className="caption">Pregunta {r.of}: {r.before ?? "—"} % → {r.after ?? "—"} %{r.changedToRight ? ` · ${r.changedToRight} ${r.changedToRight === 1 ? "estudiante cambió" : "estudiantes cambiaron"} a la correcta` : ""}</span>)}
            </div>
          )}
          <div className="segmented lv-tabs" role="tablist">
            {[["preguntas", "Preguntas"], ["estudiantes", "Estudiantes"], ["reforzar", `Para reforzar (${reinforceKeys.length})`]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "seg active" : "seg"} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === "preguntas" && (
            <ul className="lv-qlist">
              {report.questions.filter((x) => !x.skipped).map((x) => {
                const question = qOf(x.key);
                return (
                  <li key={x.index} className="card lv-qrow">
                    <button type="button" className="lv-qhead" aria-expanded={open === x.index} onClick={() => setOpen(open === x.index ? null : x.index)}>
                      <span className="lv-qn">{x.n}</span>
                      <span className="lv-qmain">
                        <b>{question ? `${question.section} · pregunta ${question.number}` : `Pregunta ${x.n}`}{x.reaskOf != null ? " · otra vez" : ""}</b>
                        <span className="caption">{x.skipped ? "Saltada" : `${x.right} de ${x.answered} acertaron · respuesta ${x.correct.join(" o ") || "—"}`}{x.topWrong ? ` · la errada más elegida: ${x.topWrong.letter} (${x.topWrong.count})` : ""}{x.sureWrong ? ` · ${x.sureWrong} seguros y equivocados` : ""}</span>
                      </span>
                      <span className="lv-qpct" style={{ color: pctColor(x.pct) }}>{x.pct == null ? "—" : `${x.pct} %`}</span>
                    </button>
                    {open === x.index && question && (
                      <div className="lv-qbody">
                        <Bars unit="" rows={Object.entries(x.dist).map(([l, n]) => ({ label: l, value: x.answered ? Math.round((n / x.answered) * 100) : 0, color: x.correct.includes(l) ? "var(--ok)" : undefined }))} />
                        <AutopsyCard counts={x.dist} correct={x.correct} enrichRow={bundle.enrich?.[String(question.number)]} meta={bundle.enrichMeta} />
                        <QuestionView question={question} answer={null} graded review={{ correctLetter: x.correct[0] ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "estudiantes" && (
            <div className="card t-card">
              <span className="caption">En orden alfabético. ✓ acertó · ✗ falló · · no respondió{report.questions.some((x) => x.withConfidence) ? " · ! seguro y equivocado" : ""}.</span>
              <ul className="lv-people">
                {report.people.map((p) => (
                  <li key={p.player_id} className="lv-person">
                    <span className="lv-pname"><b>{p.nickname}</b><span className="caption">{p.guest ? "Invitado · " : ""}{p.right} de {p.of}{p.of > p.answered ? ` · ${p.of - p.answered} sin responder` : ""}</span></span>
                    <span className="lv-cells" aria-label={`Respuestas de ${p.nickname}`}>
                      {p.cells.filter((c, i) => !report.questions[i].skipped).map((c) => <i key={c.n} title={`Pregunta ${c.n}: ${c.option ?? "sin respuesta"}`} className={!c.option ? "none" : c.right ? "ok" : c.confident === true ? "bad sure" : "bad"}>{!c.option ? "·" : c.right ? "✓" : c.confident === true ? "!" : "✗"}</i>)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "reforzar" && (
            <div className="card t-card lv-reinforce">
              {reinforceKeys.length === 0 && <span className="caption">Ninguna pregunta quedó por debajo del 60 %. ¡Buen juego!</span>}
              {report.toReinforce.map((x) => {
                const question = qOf(x.key);
                return <span key={x.index} className="lv-rrow"><b style={{ color: pctColor(x.pct) }}>{x.pct ?? 0} %</b>{question ? `${question.section} · pregunta ${question.number}` : `Pregunta ${x.n}`}</span>;
              })}
              {report.misconceptions.length > 0 && (
                <>
                  <span className="label">Ideas erradas de la clase</span>
                  {report.misconceptions.map((m) => <span key={m.n} className="caption">Pregunta {m.n}: {m.count} de {m.answered} eligieron {m.letter}. Explica por qué {m.letter} parece correcta y no lo es.</span>)}
                </>
              )}
              <div className="report-actions">
                {reinforceKeys.length > 0 && api.createAssignment && <button type="button" className="primary" onClick={() => setMaking(true)}>Crear tarea de refuerzo</button>}
                {reinforceKeys.length > 0 && onReplay && <button type="button" className="secondary" onClick={() => onReplay(session, reinforceKeys)}>Jugar otra vez solo estas</button>}
              </div>
            </div>
          )}

          {making && <ReinforceDialog api={api} session={session} keys={reinforceKeys} courses={courses} guard={guard} onClose={() => setMaking(false)} />}
          <div className="report-actions">
            {onReplay && <button type="button" className="secondary" onClick={() => onReplay(session, session.question_keys.filter((k, i) => reaskOf(session, i) == null))}>Jugar otra vez</button>}
            <button type="button" className="secondary" onClick={() => download(`${session.title || "en vivo"}.csv`, resultsCsv(session.title || "En vivo", players, report))}>Descargar informe (CSV)</button>
          </div>
        </>
      )}
    </div>
  );
}

// A task for the class with the questions it missed most, due in a week by default.
function ReinforceDialog({ api, session, keys, courses, guard, onClose }) {
  const [courseId, setCourseId] = useState(session.course_id ?? courses[0]?.id ?? "");
  const [due, setDue] = useState(isoDay(new Date(Date.now() + 7 * 864e5)));
  const [title, setTitle] = useState(`Refuerzo · ${session.title || "juego en vivo"}`);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    guard(async () => {
      const me = await api.getProfile();
      await api.createAssignment({
        course_id: courseId, created_by: me.id, kind: "task", title: title.trim() || "Refuerzo", exam_slug: session.exam_slug, scope: "all",
        question_keys: keys, opens_at: new Date().toISOString(), due_at: due ? new Date(`${due}T23:59:00`).toISOString() : null,
        reveal_policy: "after_submit", status: "active",
      });
      setDone(true);
    }).finally(() => setBusy(false));
  };
  return (
    <div className="qb-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qb-dialog" role="dialog" aria-modal="true" aria-label="Tarea de refuerzo">
        <header><h2>Tarea de refuerzo</h2><button type="button" className="qb-icon" aria-label="Cerrar" onClick={onClose}>✕</button></header>
        {done ? (
          <><p>Listo: la tarea con {keys.length} {keys.length === 1 ? "pregunta" : "preguntas"} ya aparece en Actividades y en el celular de cada estudiante.</p>
            <div className="report-actions"><button type="button" className="primary" onClick={onClose}>Cerrar</button></div></>
        ) : (
          <div className="assign-form">
            <span className="caption">{keys.length} {keys.length === 1 ? "pregunta" : "preguntas"} con menos del 60 % de aciertos, con corrección inmediata y pistas.</span>
            <label className="field"><span className="label">Nombre</span><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field"><span className="label">Clase</span>
              <Select value={courseId} onChange={setCourseId} aria-label="Clase">{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
            <label className="field"><span className="label">Entrega</span><DateField value={due} onChange={setDue} aria-label="Fecha de entrega" /></label>
            <div className="report-actions">
              <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
              <button type="button" className="primary" disabled={busy || !courseId} onClick={save}>{busy ? "Creando…" : "Crear tarea"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sección “En vivo” del panel docente: salas abiertas, crear una nueva con el constructor de preguntas y los
// juegos anteriores con su informe.
export function LiveSection({ api, courses, exams, fetchExam, guard, AssignBuilder, startCreating = false }) {
  const [open, setOpen] = useState([]);
  const [past, setPast] = useState([]);
  const [creating, setCreating] = useState(startCreating);
  const [active, setActive] = useState(null);
  const [report, setReport] = useState(null);
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    guard(async () => setOpen(await api.myLiveSessions()));
    if (api.livePastSessions) api.livePastSessions().then(setPast, () => setPast([]));
  }, [api, guard, active, report, tick]);
  const close = async (s) => {
    if (!(await confirmDialog(`¿Cerrar la sala «${s.title || "En vivo"}»? Nadie más podrá entrar con el código ${s.code}.`, { confirmLabel: "Cerrar sala", danger: true }))) return;
    guard(async () => { await api.liveEnd(s.id); setTick((n) => n + 1); });
  };

  // A rematch: a new room with the same (or only the missed) questions and the same settings.
  const replay = (s, keys) => guard(async () => {
    const created = await api.liveCreate({ title: `${s.title || "En vivo"} · otra vez`, exam: s.exam_slug, keys, seconds: s.seconds_per_question, course: s.course_id });
    let room = created;
    if (api.liveConfigure && s.mode) room = (await api.liveConfigure(created.id, { mode: s.mode, goal: s.goal_pct, confidence: s.ask_confidence }).catch(() => null)) ?? created;
    setReport(null);
    setActive(room);
  });

  // Programmed games wait for their time; the rest are open now.
  const programmed = open.filter((s) => !isOpenNow(s)).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const openNow = open.filter((s) => isOpenNow(s));
  const courseName = (s) => courses.find((c) => c.id === s.course_id)?.name ?? "";
  // Opening a programmed room early opens it for its students too.
  const openNow_ = (s) => guard(async () => {
    const row = api.liveReschedule ? await api.liveReschedule(s.id, null) : s;
    setActive(row ?? s);
  });
  if (active) return <LiveHost api={api} initial={active} fetchExam={fetchExam} guard={guard} courses={courses} onReplay={replay} onExit={() => setActive(null)} />;
  if (report) return <LiveReport api={api} session={report} fetchExam={fetchExam} courses={courses} guard={guard} onReplay={replay} onExit={() => setReport(null)} />;
  if (creating) {
    return (
      <>
        <header className="t-head"><div><h1>Nueva sala en vivo</h1><span className="caption">Elige las preguntas; el modo de juego se ajusta en la sala de espera.</span></div></header>
        <AssignBuilder api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} onCancel={() => setCreating(false)}
          live={{ onCreate: async ({ keys, slug, seconds, title, course, at }) => {
            if (at) {
              const made = await api.liveSchedule({ title, exam: slug, keys, seconds, course, at });
              setCreating(false);
              const where = courses.find((c) => c.id === course)?.name;
              setNotice(`«${made.title || title}» quedó programado para ${whenLabel(made.scheduled_at ?? at)}${where ? `: los estudiantes de ${where} lo ven en Inicio y entran desde esa hora` : ""}. Código ${made.code}.`);
              setTick((n) => n + 1);
              return;
            }
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
        <div><h1>En vivo</h1><span className="caption">Juego en clase con preguntas ICFES: los estudiantes responden desde el celular. Tres modos, pausa, volver a preguntar después de discutir e informe al final.</span></div>
        <button type="button" className="primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />Nueva sala</button>
      </header>
      {notice && <p className="notice" role="status">{notice}</p>}
      {programmed.length > 0 && (
        <section className="lv-past" aria-label="Juegos programados">
          <span className="label">Programados</span>
          <ul className="lv-past-list">
            {programmed.map((s) => (
              <li key={s.id} className="card lv-past-row lv-sched-row">
                <span className="lv-sched-when"><Icon name="clock" size={18} /></span>
                <span className="lv-qmain"><b>{s.title || "En vivo"}</b>
                  <span className="caption">{whenLabel(s.scheduled_at)} · {s.question_keys.length} preguntas{courseName(s) ? ` · ${courseName(s)}` : ""} · código {s.code}</span></span>
                <span className="lv-controls">
                  <button type="button" className="link" onClick={() => close(s)}>Cancelar</button>
                  <button type="button" className="secondary" onClick={() => openNow_(s)}>Abrir ahora</button>
                </span>
              </li>
            ))}
          </ul>
          <span className="caption">Los estudiantes de su curso lo ven en Inicio y pueden entrar desde la hora programada. «Abrir ahora» abre la sala ya.</span>
        </section>
      )}
      {openNow.length > 0 && (
        <section className="live-rooms" aria-label="Salas abiertas">
          <span className="label">Salas abiertas</span>
          <div className="room-grid">
            {openNow.map((s) => (
              <div key={s.id} className="room-cell">
                <button type="button" className="room-card" onClick={() => setActive(s)}>
                  <span className="room-live"><i aria-hidden="true" />{s.state === "lobby" ? "Esperando" : "En vivo"}</span>
                  <strong className="room-title">{s.title || "En vivo"}</strong>
                  <span className="room-code" aria-label={`Código ${s.code}`}>{String(s.code).replace(/(\d{3})(?=\d)/, "$1 ")}</span>
                  <span className="room-foot"><span><Icon name="book" size={16} />{s.question_keys.length} {s.question_keys.length === 1 ? "pregunta" : "preguntas"}</span><span className="room-go">Abrir <Icon name="arrow" size={16} /></span></span>
                </button>
                <button type="button" className="link room-close" onClick={() => close(s)} aria-label={`Cerrar la sala ${s.title || "En vivo"}`}><Icon name="stop" size={14} /> Cerrar sala</button>
              </div>
            ))}
          </div>
        </section>
      )}
      {open.length === 0 && (
        <div className="card t-card empty-card">
          <span className="drop-ico"><Icon name="play" size={26} /></span>
          <strong>Todavía no hay salas abiertas</strong>
          <span className="caption">Crea una y empieza ya, o prográmala para un día y una hora: su curso la ve en Inicio.</span>
        </div>
      )}
      {past.length > 0 && (
        <section className="lv-past" aria-label="Juegos anteriores">
          <span className="label">Juegos anteriores</span>
          <ul className="lv-past-list">
            {past.map((s) => (
              <li key={s.id} className="card lv-past-row">
                <span className="lv-qmain"><b>{s.title || "En vivo"}</b>
                  <span className="caption">{new Date(s.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })} · {s.question_keys.length} preguntas · {MODES.find((m) => m.id === modeOf(s)).label}{courses.find((c) => c.id === s.course_id) ? ` · ${courses.find((c) => c.id === s.course_id).name}` : ""}</span></span>
                <span className="lv-controls">
                  <button type="button" className="link" onClick={() => replay(s, s.question_keys.filter((k, i) => reaskOf(s, i) == null))}>Jugar otra vez</button>
                  <button type="button" className="secondary" onClick={() => setReport(s)}>Ver informe</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
