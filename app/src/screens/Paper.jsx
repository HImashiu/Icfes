import { useEffect, useMemo, useRef, useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import Logo from "../components/Logo.jsx";
import { questionsForAttempt } from "../lib/assignments.js";
import { scoreAttempt } from "../lib/exam.js";
import AnswerSheet from "../components/AnswerSheet.jsx";
import { LETTERS, MAX_QUESTIONS, readSheetAnyRotation, sheetLayout } from "../lib/omr.js";
import { fileToGray } from "../lib/scan.js";

// The roster order the sheets are printed with and read back with. Keep the list unchanged between printing and scanning.
export const sheetRoster = (members) => members.filter((m) => m.role === "student").sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));

const PRINT_CSS = (page) => `
@media print {
  body * { visibility: hidden; }
  .paper-overlay, .paper-overlay * { visibility: visible; }
  .paper-overlay { position: absolute; left: 0; top: 0; width: 100%; background: #fff; }
  .paper-bar { display: none !important; }
  @page { size: A4; margin: ${page}; }
}`;

function Overlay({ title, onClose, children, page = "0" }) {
  return (
    <div className="paper-overlay" style={{ position: "fixed", inset: 0, zIndex: 60, background: "#fff", color: "#000", overflow: "auto" }}>
      <style>{PRINT_CSS(page)}</style>
      <div className="paper-bar" style={{ position: "sticky", top: 0, display: "flex", gap: 12, alignItems: "center", padding: 12, background: "#f3f4f1", borderBottom: "1px solid #ccc" }}>
        <strong style={{ flex: 1 }}>{title}</strong>
        <button type="button" className="primary" onClick={() => window.print()}>Imprimir</button>
        <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
      </div>
      {children}
    </div>
  );
}

function Booklet({ bundle, questions, title, onClose }) {
  return (
    <Overlay title="Cuadernillo para imprimir" onClose={onClose} page="12mm">
      <div style={{ maxWidth: 780, margin: "0 auto", padding: 16, display: "grid", gap: 14 }}>
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Logo size={28} /><strong>Cóndor</strong></div>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <p style={{ margin: "4px 0" }}>Nombre: ______________________________ Curso: ________ Fecha: ____________</p>
          <p style={{ margin: 0, fontSize: 13 }}>Responde en la hoja de respuestas, no en este cuadernillo. {questions.length} preguntas.</p>
        </header>
        {questions.map((q, i) => (
          <div key={q.key} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
            <QuestionView question={{ ...q, number: i + 1 }} answer={null} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
          </div>
        ))}
      </div>
    </Overlay>
  );
}

function Sheets({ assignment, questions, roster, course, onClose }) {
  const layout = useMemo(() => sheetLayout(questions.length), [questions.length]);
  return (
    <Overlay title={`Hojas de respuestas · ${roster.length} estudiantes`} onClose={onClose} page="0">
      <p className="paper-bar" style={{ padding: "8px 16px", margin: 0 }}>Imprime en tamaño real (100 %, sin márgenes ni “ajustar a la página”). Una hoja por estudiante.</p>
      {roster.map((m, i) => <AnswerSheet key={m.id} layout={layout} title={assignment.title} course={course} student={m.full_name || m.email} index={i} />)}
    </Overlay>
  );
}

// Calificar fotos: cada foto se lee en el navegador, se muestra para corregir lo dudoso y se guarda con el resto de resultados.
function Scan({ api, assignment, bundle, questions, roster, guard, setNotice, onClose }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const n = questions.length;

  const toResult = (file, read) => {
    const member = read.ok && read.studentIndex != null ? roster[read.studentIndex] ?? null : null;
    return { id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, read, memberId: member?.id ?? "", answers: read.ok ? read.answers.slice() : [], flags: read.ok ? read.flags.slice() : [] };
  };
  const onFiles = async (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    setBusy(true);
    for (const file of files) {
      try {
        const { gray, w, h } = await fileToGray(file);
        const read = readSheetAnyRotation(gray, w, h, n);
        setItems((cur) => [...cur, toResult(file, read)]);
      } catch {
        setItems((cur) => [...cur, { id: `${file.name}-${Math.random()}`, name: file.name, read: { ok: false, error: "No se pudo abrir esa imagen." }, memberId: "", answers: [], flags: [] }]);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    setBusy(false);
  };

  const byKey = (answers) => Object.fromEntries(questions.map((q, i) => [q.key, answers[i]]).filter(([, a]) => a));
  const scoreOf = (it) => scoreAttempt(questions, byKey(it.answers), bundle.key);
  const setAnswer = (id, q, letter) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, answers: it.answers.map((a, i) => (i === q ? letter : a)), flags: it.flags.map((f, i) => (i === q ? false : f)) } : it)));
  const setMember = (id, memberId) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, memberId } : it)));
  const ready = items.filter((it) => it.read.ok && it.memberId);
  const taken = new Map();
  for (const it of ready) taken.set(it.memberId, (taken.get(it.memberId) ?? 0) + 1);
  const dup = [...taken.values()].some((c) => c > 1);

  const save = () => {
    setBusy(true);
    guard(async () => {
      for (const it of ready) {
        const s = scoreOf(it);
        await api.paperSubmit(assignment.id, it.memberId, byKey(it.answers), { keyed: s.keyed, correct: s.correct, answered: s.answered, total: s.total, perArea: s.perArea });
      }
      setNotice(`Se guardaron ${ready.length} hojas de papel en "${assignment.title}". Ya cuentan en los informes.`);
      setItems((cur) => cur.filter((it) => !ready.includes(it)));
    }).finally(() => setBusy(false));
  };

  return (
    <div className="card t-card">
      <div className="section-head"><strong>Calificar hojas fotografiadas</strong><button type="button" className="link" onClick={onClose}>Cerrar</button></div>
      <p className="caption">Fotografía cada hoja completa, con buena luz y las cuatro marcas negras visibles. Puedes elegir varias fotos a la vez.</p>
      <input ref={inputRef} type="file" accept="image/*" multiple aria-label="Fotos de las hojas" onChange={onFiles} disabled={busy} />
      {busy && <p className="caption">Leyendo…</p>}
      {items.map((it) => {
        const s = it.read.ok ? scoreOf(it) : null;
        const doubtful = it.flags.filter(Boolean).length;
        return (
          <div key={it.id} className="card" style={{ display: "grid", gap: 8 }}>
            <div className="section-head"><strong>{it.name}</strong><button type="button" className="link" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))}>Quitar</button></div>
            {!it.read.ok ? <p className="notice error">{it.read.error}</p> : (
              <>
                <label className="field"><span className="label">Estudiante</span>
                  <select value={it.memberId} onChange={(e) => setMember(it.id, e.target.value)}>
                    <option value="">Elegir…</option>
                    {roster.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                  </select>
                  {it.read.studentIndex == null && <span className="caption">No pude leer el código del estudiante: elígelo a mano.</span>}
                </label>
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

// Sección “Papel”: simulacro impreso para colegios sin un dispositivo por estudiante.
export default function Paper({ api, assignments, fetchExam, guard, setNotice }) {
  const [id, setId] = useState(assignments[0]?.id ?? "");
  const [mode, setMode] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [roster, setRoster] = useState([]);
  const [course, setCourse] = useState("");
  const assignment = assignments.find((a) => a.id === id) ?? null;

  useEffect(() => {
    if (!assignment) return;
    setBundle(null);
    guard(async () => {
      const [b, members] = await Promise.all([fetchExam(assignment.exam_slug, assignment.question_keys), api.listMembers(assignment.course_id)]);
      setBundle(b);
      setRoster(sheetRoster(members));
      setCourse(assignment.courses?.name ?? "");
    });
    setMode(null);
  }, [assignment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const questions = useMemo(() => (bundle && assignment ? questionsForAttempt(bundle.exam, { scope: assignment.scope, keys: assignment.question_keys }) : []), [bundle, assignment]);
  const tooMany = questions.length > MAX_QUESTIONS;
  const personal = assignment?.assignee_id;

  return (
    <>
      <header className="t-head"><div><h1>Papel</h1><span className="caption">Imprime el cuadernillo y las hojas de respuestas, fotografía las hojas con el celular y los resultados aparecen junto a los demás.</span></div></header>
      {assignments.length === 0 ? <p className="caption">Crea primero una asignación (con las preguntas del simulacro) y vuelve aquí.</p> : (
        <div className="card t-card assign-form">
          <label className="field"><span className="label">Asignación</span>
            <select value={id} onChange={(e) => setId(e.target.value)}>{assignments.filter((a) => !a.assignee_id).map((a) => <option key={a.id} value={a.id}>{a.courses?.name} · {a.title}</option>)}</select></label>
          {!bundle && assignment && <p className="caption">Cargando preguntas…</p>}
          {bundle && <p className="caption">{questions.length} preguntas · {roster.length} estudiantes en la lista.</p>}
          {tooMany && <p className="notice error">Una hoja admite hasta {MAX_QUESTIONS} preguntas.</p>}
          {personal && <p className="notice error">Esta asignación es personal.</p>}
          <div className="report-actions">
            <button type="button" className="secondary" disabled={!bundle || tooMany} onClick={() => setMode("booklet")}>Imprimir cuadernillo</button>
            <button type="button" className="secondary" disabled={!bundle || tooMany || roster.length === 0} onClick={() => setMode("sheets")}>Imprimir hojas de respuestas</button>
            <button type="button" className="primary" disabled={!bundle || tooMany || roster.length === 0} onClick={() => setMode("scan")}>Calificar fotos</button>
          </div>
          <p className="caption">La lista de estudiantes se ordena por correo. No agregues ni quites estudiantes entre imprimir y calificar: cada hoja lleva el código de su estudiante.</p>
        </div>
      )}
      {mode === "booklet" && bundle && <Booklet bundle={bundle} questions={questions} title={assignment.title} onClose={() => setMode(null)} />}
      {mode === "sheets" && bundle && <Sheets assignment={assignment} questions={questions} roster={roster} course={course} onClose={() => setMode(null)} />}
      {mode === "scan" && bundle && <Scan api={api} assignment={assignment} bundle={bundle} questions={questions} roster={roster} guard={guard} setNotice={setNotice} onClose={() => setMode(null)} />}
    </>
  );
}
