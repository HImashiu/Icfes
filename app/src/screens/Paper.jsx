import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PrintBooklet from "../components/PrintBooklet.jsx";
import Icon from "../components/Icon.jsx";
import LiveScanner from "../components/LiveScanner.jsx";
import Picker from "../components/Picker.jsx";
import { questionsForAttempt } from "../lib/assignments.js";
import { scoreAttempt } from "../lib/exam.js";
import AnswerSheet from "../components/AnswerSheet.jsx";
import { LETTERS, MAX_QUESTIONS, readSheetAnyRotation, sheetLayout } from "../lib/omr.js";
import { fileToGray } from "../lib/scan.js";
import { FilePicker, Select } from "../components/Controls.jsx";
import SeatingChart from "../components/SeatingChart.jsx";
import { MAX_VERSIONS, MIN_VERSIONS, apartViolations, generatePlan, loadLocalPlan, orderForVersion, planMatches, sameVersionNeighbours, saveLocalPlan, seatOfMember, swapSeats, loadRooms, saveRoom, deleteRoom, reusePlan, versionCounts, versionLabel, versionOfMember } from "../lib/seating.js";

// The roster order the sheets are printed with and read back with. Keep the list unchanged between printing and scanning.
export const sheetRoster = (members) => members.filter((m) => m.role === "student").sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));

// The overlay lives in <body>, outside the app root, so printing can hide the app and print the overlay as ordinary flowing pages.
export function Overlay({ title, hint, onClose, children, page = "0" }) {
  useEffect(() => {
    document.body.classList.add("print-overlay-open");
    return () => document.body.classList.remove("print-overlay-open");
  }, []);
  return createPortal(
    <div className="print-overlay">
      <style>{`@page { size: A4; margin: ${page}; }`}</style>
      <div className="print-bar">
        <div className="print-bar-title"><strong>{title}</strong>{hint && <span>{hint}</span>}</div>
        <button type="button" className="primary" onClick={() => window.print()}><Icon name="book" size={16} /> Imprimir</button>
        <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
      </div>
      <div className="print-body">{children}</div>
    </div>,
    document.body,
  );
}

function Booklet({ bundle, questions, title, course, plan, onClose }) {
  const counts = plan ? versionCounts(plan) : null;
  const versions = counts ? counts.map((n, v) => v).filter((v) => counts[v] > 0) : [null];
  return (
    <Overlay title="Cuadernillo" hint={counts ? `Versiones ${versions.map(versionLabel).join(", ")} · imprime ${versions.map((v) => `${counts[v]} de la ${versionLabel(v)}`).join(", ")}` : `${questions.length} preguntas · se imprime en hojas A4 con márgenes`} onClose={onClose} page="14mm 14mm 16mm">
      {versions.map((v) => (
        <div key={v ?? "x"} className="pb-version-set" style={{ breakAfter: "page" }}>
          <PrintBooklet questions={v == null ? questions : orderForVersion(questions, v, plan.orderSeed)} figures={bundle.figures} examLabel={bundle.exam.title} title={title} course={course} version={v == null ? null : versionLabel(v)} />
        </div>
      ))}
    </Overlay>
  );
}

function SeatChartSheet({ plan, names, title, course, onClose }) {
  return (
    <Overlay title="Plano del salón" hint="Una hoja A4, en blanco y negro" onClose={onClose} page="0">
      <SeatingChart rows={plan.rows} cols={plan.cols} blocked={plan.blocked} seatVersion={plan.seatVersion} seats={plan.seats} names={names} title={title} course={course} counts={versionCounts(plan)} />
    </Overlay>
  );
}

function Sheets({ assignment, questions, roster, course, plan, onClose }) {
  const layout = useMemo(() => sheetLayout(questions.length), [questions.length]);
  return (
    <Overlay title={`Hojas de respuestas · ${roster.length} estudiantes`} hint="Imprime al 100 %, sin márgenes ni “ajustar a la página”. Una hoja por estudiante." onClose={onClose} page="0">
      {roster.map((m, i) => <AnswerSheet key={m.id} layout={layout} title={assignment.title} course={course} student={m.full_name || m.email} index={i} version={plan && versionOfMember(plan, m.id) != null ? versionLabel(versionOfMember(plan, m.id)) : null} seat={plan && seatOfMember(plan, m.id) ? seatOfMember(plan, m.id).split(",").map((n) => Number(n) + 1).join("-") : null} />)}
    </Overlay>
  );
}

// Calificar hojas: la cámara en vivo o fotos subidas. Cada hoja se lee en el navegador, se muestra para corregir lo dudoso y se guarda con el resto de resultados.
function Scan({ api, assignment, bundle, questions, roster, plan, guard, setNotice, onSaved, onClose }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const inputRef = useRef(null);
  const n = questions.length;

  const toResult = (id, name, read, thumb = null) => {
    const member = read.ok && read.studentIndex != null ? roster[read.studentIndex] ?? null : null;
    return { id, name, thumb, read, memberId: member?.id ?? "", answers: read.ok ? read.answers.slice() : [], flags: read.ok ? read.flags.slice() : [] };
  };
  // A sheet read again (a second photo, a second pass of the camera) replaces the earlier one of the same student.
  const addItem = (item) => setItems((cur) => [...cur.filter((x) => !(item.memberId && x.memberId === item.memberId)), item]);
  const onCameraSheet = (read, thumb) => {
    const who = read.studentIndex != null ? roster[read.studentIndex] : null;
    addItem(toResult(`cam-${Date.now()}-${Math.random()}`, who ? `Hoja de ${who.full_name || who.email}` : "Hoja sin código", read, thumb));
  };
  const onFiles = async (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    setBusy(true);
    for (const file of files) {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      try {
        const { gray, w, h } = await fileToGray(file);
        addItem(toResult(id, file.name, readSheetAnyRotation(gray, w, h, n)));
      } catch {
        setItems((cur) => [...cur, { id: `${id}-${Math.random()}`, name: file.name, read: { ok: false, error: "No se pudo abrir esa imagen." }, memberId: "", answers: [], flags: [] }]);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    setBusy(false);
  };

  // With a seating plan each student answered the booklet version of their seat: position i on the sheet is that version's i-th question.
  const questionsOf = (it) => (plan && it.memberId && versionOfMember(plan, it.memberId) != null ? orderForVersion(questions, versionOfMember(plan, it.memberId), plan.orderSeed) : questions);
  const byKey = (answers, qs = questions) => Object.fromEntries(qs.map((q, i) => [q.key, answers[i]]).filter(([, a]) => a));
  const scoreOf = (it) => scoreAttempt(questions, byKey(it.answers, questionsOf(it)), bundle.key);
  const setAnswer = (id, q, letter) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, answers: it.answers.map((a, i) => (i === q ? letter : a)), flags: it.flags.map((f, i) => (i === q ? false : f)) } : it)));
  const setMember = (id, memberId) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, memberId } : it)));
  const ready = items.filter((it) => it.read.ok && it.memberId);
  const taken = new Map();
  for (const it of ready) taken.set(it.memberId, (taken.get(it.memberId) ?? 0) + 1);
  const dup = [...taken.values()].some((c) => c > 1);

  const save = () => {
    setBusy(true);
    guard(async () => {
      const pcts = [];
      for (const it of ready) {
        const s = scoreOf(it);
        await api.paperSubmit(assignment.id, it.memberId, byKey(it.answers, questionsOf(it)), { keyed: s.keyed, correct: s.correct, answered: s.answered, total: s.total, perArea: s.perArea });
        if (s.keyed && s.total) pcts.push((s.correct / s.total) * 100);
      }
      // The teacher panel shows a receipt with every place the results went; elsewhere a notice says it.
      if (onSaved) onSaved({ count: ready.length, average: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null });
      else setNotice(`Se guardaron ${ready.length} hojas de papel en "${assignment.title}". Ya cuentan en los informes.`);
      setItems((cur) => cur.filter((it) => !ready.includes(it)));
    }).finally(() => setBusy(false));
  };

  return (
    <div className="card t-card">
      <div className="section-head"><strong>Escanear hojas</strong><button type="button" className="link" onClick={onClose}>Cerrar</button></div>
      <p className="caption">Con la cámara, pasa las hojas una tras otra frente al celular: cada una se lee sola cuando queda quieta. También puedes subir fotos; deben mostrar la hoja completa, con buena luz y las cuatro marcas negras.</p>
      <div className="scan-modes">
        <button type="button" className="primary scan-camera" onClick={() => setCamera(true)}><Icon name="bolt" size={20} /> Escanear con la cámara</button>
        <label className={busy ? "paper-drop compact busy" : "paper-drop compact"}><Icon name="flag" size={20} /><span>{busy ? "Leyendo…" : "Subir fotos"}</span><input ref={inputRef} type="file" accept="image/*" multiple aria-label="Fotos de las hojas" onChange={onFiles} disabled={busy} /></label>
      </div>
      {camera && <LiveScanner n={n} roster={roster} onCapture={onCameraSheet} onClose={() => setCamera(false)} />}
      {items.map((it) => {
        const s = it.read.ok ? scoreOf(it) : null;
        const doubtful = it.flags.filter(Boolean).length;
        return (
          <div key={it.id} className={`card paper-scan-item ${!it.read.ok ? "is-bad" : doubtful ? "is-doubt" : "is-ok"}`}>
            <div className="section-head"><strong className="scan-name">{it.thumb && <img className="scan-thumb" src={it.thumb} alt="" />}{it.name}</strong><button type="button" className="link" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))}>Quitar</button></div>
            {!it.read.ok ? <p className="notice error">{it.read.error}</p> : (
              <>
                <div className="field"><span className="label">Estudiante</span>
                  <Picker label="Estudiante de la hoja" value={it.memberId} onChange={(v) => setMember(it.id, v)} placeholder="Elegir estudiante…" options={roster.map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
                  {it.read.studentIndex == null && <span className="caption">No pude leer el código del estudiante: elígelo a mano.</span>}
                </div>
                {plan && versionOfMember(plan, it.memberId) != null && <span className="chip">Versión {versionLabel(versionOfMember(plan, it.memberId))}</span>}
                <span className="caption">{s.answered} de {s.total} marcadas · {s.keyed ? `${s.correct} correctas (clave preliminar)` : "sin clave"}{doubtful ? ` · ${doubtful} para revisar` : ""}</span>
                <details open={doubtful > 0}>
                  <summary>Respuestas leídas{doubtful ? ` (revisa las marcadas en amarillo)` : ""}</summary>
                  <div className="answers-grid">
                    {it.answers.map((a, i) => (
                      <button key={i} type="button" className="answer-cell" style={it.flags[i] ? { outline: "2px solid #d9a400" } : undefined}
                        aria-label={`Pregunta ${i + 1}: ${a ?? "en blanco"}`}
                        onClick={() => setAnswer(it.id, i, a === "D" ? null : LETTERS[LETTERS.indexOf(a) + 1] ?? "A")}>{i + 1}{a ? ` ${a}` : " –"}</button>
                    ))}
                  </div>
                  <span className="caption">Toca una casilla para cambiar la letra (A, B, C, D, en blanco).</span>
                </details>
              </>
            )}
          </div>
        );
      })}
      {dup && <p className="notice error">Dos fotos están asignadas al mismo estudiante: se guardará solo la última.</p>}
      <div className="report-actions">
        <button type="button" className="primary" disabled={busy || ready.length === 0} onClick={save}>Guardar {ready.length} {ready.length === 1 ? "hoja" : "hojas"}</button>
      </div>
    </div>
  );
}


const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => ({ value: String(a + i), label: String(a + i) }));

// Plano del salón: filas × puestos, puestos vacíos, parejas que deben quedar separadas y mezclar con un toque.
function Seating({ assignment, roster, plan, savePlan, setMode, siblings, loadSibling }) {
  const [rows, setRows] = useState(plan?.rows ?? 5);
  const [cols, setCols] = useState(plan?.cols ?? 6);
  const [versions, setVersions] = useState(plan?.versions ?? MIN_VERSIONS);
  const [blocked, setBlocked] = useState(plan?.blocked ?? []);
  const [apart, setApart] = useState(plan?.apart ?? []);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState("layout");
  const [picked, setPicked] = useState(null);
  const [rooms, setRooms] = useState(loadRooms);
  const [roomName, setRoomName] = useState("");
  const names = useMemo(() => Object.fromEntries(roster.map((m) => [m.id, m.full_name || m.email])), [roster]);
  const seatsLeft = rows * cols - blocked.filter((s) => { const [r, c] = s.split(",").map(Number); return r < rows && c < cols; }).length;
  const stale = plan && !planMatches(plan, roster.map((m) => m.id));
  const live = plan && !stale;
  const clash = live ? apartViolations(plan).length : 0;

  const build = (keepOrder) => {
    setError("");
    try {
      const inRoom = blocked.filter((s) => { const [r, c] = s.split(",").map(Number); return r < rows && c < cols; });
      savePlan(generatePlan({ rows, cols, blocked: inRoom, versions, studentIds: roster.map((m) => m.id), apart, orderSeed: keepOrder && live ? plan.orderSeed : undefined }));
    } catch (e) {
      setError(e.message);
    }
  };
  const pick = (id) => {
    if (!(id in plan.seatVersion)) return;
    if (picked == null) { if (plan.seats[id]) setPicked(id); return; }
    savePlan(swapSeats(plan, picked, id));
    setPicked(null);
  };
  const useRoom = (name) => {
    const r = rooms.find((x) => x.name === name);
    if (!r) return;
    setRows(r.rows); setCols(r.cols); setBlocked(r.blocked);
  };
  const keepRoom = () => {
    const name = roomName.trim();
    if (!name) return;
    setRooms(saveRoom({ name, rows, cols, blocked }));
    setRoomName("");
  };
  const reuse = async (id) => {
    const found = await loadSibling(id);
    if (!found) { setError("Esa asignación todavía no tiene plano."); return; }
    if (!planMatches(found, roster.map((m) => m.id))) { setError("Ese plano es de otra lista de estudiantes. Genera uno nuevo."); return; }
    setError("");
    savePlan(reusePlan(found));
  };
  const toggle = (id) => setBlocked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const addPair = () => {
    if (!a || !b || a === b || apart.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
    setApart((cur) => [...cur, [a, b]]);
    setA(""); setB("");
  };
  const shown = live ? plan : { rows, cols, blocked, seatVersion: {}, seats: {} };
  const memberOptions = roster.map((m) => ({ value: m.id, label: names[m.id] }));

  return (
    <section className="card seat-card">
      <h2>Plano del salón</h2>
      <p className="caption">Cada estudiante recibe una versión del cuadernillo (las preguntas en otro orden) y se sienta de modo que nadie tenga al lado, adelante, atrás ni en diagonal a alguien con su misma versión. Toca un puesto para dejarlo vacío (pasillo, columna sin silla).</p>
      <div className="seat-config">
        <div className="field"><span className="label">Filas</span><Select aria-label="Filas" value={String(rows)} onChange={(v) => setRows(Number(v))} options={range(1, 12)} /></div>
        <div className="field"><span className="label">Puestos por fila</span><Select aria-label="Puestos por fila" value={String(cols)} onChange={(v) => setCols(Number(v))} options={range(1, 12)} /></div>
        <div className="field"><span className="label">Versiones</span><Select aria-label="Versiones" value={String(versions)} onChange={(v) => setVersions(Number(v))} options={range(MIN_VERSIONS, MAX_VERSIONS)} /></div>
        <span className="chip"><strong>{seatsLeft}</strong> puestos · <strong>{roster.length}</strong> estudiantes</span>
      </div>
      <div className="seat-rooms">
        {rooms.length > 0 && <Picker label="Salones guardados" value="" onChange={useRoom} placeholder="Salones guardados…" options={rooms.map((r) => ({ value: r.name, label: `${r.name} (${r.rows}×${r.cols})` }))} />}
        {siblings.length > 0 && <Picker label="Usar el plano de otra asignación" value="" onChange={reuse} placeholder="Usar el plano de otra asignación…" options={siblings.map((a) => ({ value: a.id, label: a.title }))} />}
        <input type="text" aria-label="Nombre del salón" placeholder="Nombre del salón (ej. Aula 201)" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
        <button type="button" className="secondary" disabled={!roomName.trim()} onClick={keepRoom}>Guardar salón</button>
        {rooms.some((r) => r.name === roomName.trim()) && <button type="button" className="link" onClick={() => { setRooms(deleteRoom(roomName.trim())); setRoomName(""); }}>Borrar “{roomName.trim()}”</button>}
      </div>
      {live && (
        <div className="seat-modes" role="group" aria-label="Qué hacer al tocar un puesto">
          <button type="button" className={edit === "layout" ? "primary" : "secondary"} aria-pressed={edit === "layout"} onClick={() => { setEdit("layout"); setPicked(null); }}>Dejar puestos vacíos</button>
          <button type="button" className={edit === "swap" ? "primary" : "secondary"} aria-pressed={edit === "swap"} onClick={() => setEdit("swap")}>Cambiar de puesto</button>
        </div>
      )}
      {live && edit === "swap" && <p className="caption">{picked ? "Toca el puesto de destino (o el de otro estudiante para intercambiarlos)." : "Toca un estudiante y luego el puesto al que va. Al cambiar de puesto cambia de versión: reimprime su hoja."}</p>}
      <SeatingChart rows={live && edit === "swap" ? plan.rows : rows} cols={live && edit === "swap" ? plan.cols : cols} blocked={live && edit === "swap" ? plan.blocked : blocked} seatVersion={shown.seatVersion} seats={shown.seats} names={names} onToggle={live && edit === "swap" ? pick : toggle} picked={live && edit === "swap" ? picked : null} />
      <div className="seat-apart">
        <span className="label">Mantener separados</span>
        <Picker label="Primer estudiante" value={a} onChange={setA} placeholder="Estudiante…" options={memberOptions} />
        <Picker label="Segundo estudiante" value={b} onChange={setB} placeholder="Estudiante…" options={memberOptions} />
        <button type="button" className="secondary" disabled={!a || !b || a === b} onClick={addPair}>Añadir pareja</button>
      </div>
      {apart.length > 0 && <div className="seat-apart">{apart.map(([x, y]) => <span className="chip" key={`${x}${y}`}>{names[x] ?? "?"} y {names[y] ?? "?"}<button type="button" className="link" aria-label="Quitar pareja" onClick={() => setApart((cur) => cur.filter((p) => p[0] !== x || p[1] !== y))}>×</button></span>)}</div>}
      {error && <p className="notice error">{error}</p>}
      {stale && <p className="notice error">La lista de estudiantes cambió desde que se generó el plano. Genera uno nuevo antes de imprimir.</p>}
      {live && clash > 0 && <p className="notice error">{clash === 1 ? "Una pareja quedó" : `${clash} parejas quedaron`} una junto a la otra porque el salón no deja más opciones. Toca “Mezclar” o agranda el salón.</p>}
      {live && !sameVersionNeighbours(plan).length && <p className="caption">Revisado: ningún puesto vecino comparte versión. Copias: {versionCounts(plan).map((n, v) => `${versionLabel(v)} ${n}`).join(" · ")}.</p>}
      <div className="report-actions">
        <button type="button" className="primary" disabled={roster.length === 0} onClick={() => build(true)}>{live ? "Mezclar de nuevo" : "Generar plano"}</button>
        {live && <button type="button" className="secondary" onClick={() => setMode("chart")}>Imprimir plano</button>}
      </div>
      {live && <p className="caption">Mezclar cambia a los estudiantes de puesto; las versiones del cuadernillo siguen siendo las mismas. Imprime los cuadernillos y las hojas después de dejar el plano listo: cada hoja lleva la versión del estudiante.</p>}
    </section>
  );
}

// Sección “Papel”: simulacro impreso para colegios sin un dispositivo por estudiante.
// Inside an activity page it works on that one assignment (fixedId) without its own header or picker.
export default function Paper({ api, assignments, fetchExam, guard, setNotice, fixedId = null, embedded = false, initialMode = null, onSaved = null }) {
  const choices = assignments.filter((a) => !a.assignee_id);
  const [id, setId] = useState(fixedId ?? choices[0]?.id ?? "");
  const [mode, setMode] = useState(initialMode);
  const [bundle, setBundle] = useState(null);
  const [roster, setRoster] = useState([]);
  const [course, setCourse] = useState("");
  const [savedPlan, setSavedPlan] = useState(null);
  const assignment = choices.find((a) => a.id === id) ?? choices[0] ?? null;

  useEffect(() => {
    if (!assignment) return;
    setBundle(null);
    guard(async () => {
      const [b, members] = await Promise.all([fetchExam(assignment.exam_slug, assignment.question_keys), api.listMembers(assignment.course_id)]);
      setBundle(b);
      setRoster(sheetRoster(members));
      setCourse(assignment.courses?.name ?? "");
      // The plan lives in the database (migration 0013); this browser's copy covers a database without that table.
      const remote = await api.getSeating?.(assignment.id).catch(() => null);
      setSavedPlan(remote ?? loadLocalPlan(assignment.id));
    });
    setSavedPlan(null);
    setMode((m) => (m === initialMode ? m : null));
  }, [assignment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const questions = useMemo(() => (bundle && assignment ? questionsForAttempt(bundle.exam, { scope: assignment.scope, keys: assignment.question_keys }) : []), [bundle, assignment]);
  const savePlan = (next) => {
    setSavedPlan(next);
    saveLocalPlan(assignment.id, next);
    Promise.resolve(api.saveSeating?.(assignment.id, next)).catch(() => {}); // without migration 0013 the plan stays in this browser
  };
  const loadSibling = async (id) => (await api.getSeating?.(id).catch(() => null)) ?? loadLocalPlan(id);
  const plan = savedPlan && planMatches(savedPlan, roster.map((m) => m.id)) ? savedPlan : null;
  const tooMany = questions.length > MAX_QUESTIONS;
  const noRoster = roster.length === 0;
  const areas = new Set(questions.map((q) => q.section)).size;
  const ready = Boolean(bundle) && !tooMany;
  const steps = [
    { n: 1, icon: "book", title: "Cuadernillo", text: "Las preguntas en hojas A4, en blanco y negro, con el texto de cada grupo una sola vez.", action: "Imprimir cuadernillo", mode: "booklet", off: !ready },
    { n: 2, icon: "user", title: "Hojas de respuestas", text: "Una hoja por estudiante, con su código y las burbujas A a D. Imprime al 100 %.", action: "Imprimir hojas", mode: "sheets", off: !ready || noRoster },
    { n: 3, icon: "bolt", title: "Escanear hojas", text: "Pasa las hojas llenas frente a la cámara del celular, o sube fotos. Los resultados entran junto a los demás.", action: "Escanear hojas", mode: "scan", off: !ready || noRoster, primary: true },
  ];

  return (
    <>
      {!embedded && <header className="t-head"><div><h1>Papel</h1><span className="caption">Simulacro impreso para salones sin un dispositivo por estudiante. Tres pasos: imprimir, resolver, fotografiar.</span></div></header>}
      {choices.length === 0 ? <div className="card paper-empty"><Icon name="book" size={28} /><p>Crea primero una asignación con las preguntas del simulacro y vuelve aquí.</p></div> : (
        <>
          <div className="card paper-pick">
            {!fixedId && <div className="field"><span className="label">Asignación</span>
              <Picker label="Asignación" value={assignment?.id ?? ""} onChange={setId} options={choices.map((a) => ({ value: a.id, label: `${a.courses?.name} · ${a.title}` }))} /></div>}
            <div className="paper-stats" aria-live="polite">
              {!bundle ? <span className="chip">Cargando preguntas…</span> : (
                <>
                  <span className="chip"><strong>{questions.length}</strong> preguntas</span>
                  <span className="chip"><strong>{areas}</strong> {areas === 1 ? "área" : "áreas"}</span>
                  <span className="chip"><strong>{roster.length}</strong> estudiantes</span>
                </>
              )}
            </div>
            {tooMany && <p className="notice error">Una hoja admite hasta {MAX_QUESTIONS} preguntas.</p>}
            {bundle && noRoster && <p className="notice error">Este curso no tiene estudiantes en la lista. Agrégalos en Estudiantes › Listas de clase.</p>}
          </div>
          <div className="paper-steps">
            {steps.map((st) => (
              <section key={st.n} className={st.primary ? "card paper-step primary-step" : "card paper-step"}>
                <span className="step-badge" aria-hidden="true">{st.n}</span>
                <span className="step-icon" aria-hidden="true"><Icon name={st.icon} size={26} /></span>
                <h2>{st.title}</h2>
                <p className="caption">{st.text}</p>
                <button type="button" className={st.primary ? "primary" : "secondary"} disabled={st.off} onClick={() => setMode(st.mode)}>{st.action}</button>
              </section>
            ))}
          </div>
          {bundle && !noRoster && <Seating key={`${assignment.id}-${roster.length}-${savedPlan?.seed ?? 0}-${savedPlan?.orderSeed ?? 0}`} assignment={assignment} roster={roster} plan={savedPlan} savePlan={savePlan} setMode={setMode} siblings={choices.filter((a) => a.id !== assignment.id && a.course_id === assignment.course_id)} loadSibling={loadSibling} />}
          <p className="caption paper-note">La lista de estudiantes se ordena por correo. No agregues ni quites estudiantes entre imprimir y calificar: cada hoja lleva el código de su estudiante.</p>
        </>
      )}
      {mode === "booklet" && bundle && <Booklet bundle={bundle} questions={questions} title={assignment.title} course={course} plan={plan} onClose={() => setMode(null)} />}
      {mode === "sheets" && bundle && <Sheets assignment={assignment} questions={questions} roster={roster} course={course} plan={plan} onClose={() => setMode(null)} />}
      {mode === "chart" && bundle && plan && <SeatChartSheet plan={plan} names={Object.fromEntries(roster.map((m) => [m.id, m.full_name || m.email]))} title={assignment.title} course={course} onClose={() => setMode(null)} />}
      {mode === "scan" && bundle && <Scan api={api} assignment={assignment} bundle={bundle} questions={questions} roster={roster} plan={plan} guard={guard} setNotice={setNotice} onSaved={onSaved} onClose={() => setMode(null)} />}
    </>
  );
}
