import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PrintBooklet from "../components/PrintBooklet.jsx";
import Icon from "../components/Icon.jsx";
import { questionsForAttempt } from "../lib/assignments.js";
import { scoreAttempt } from "../lib/exam.js";
import AnswerSheet from "../components/AnswerSheet.jsx";
import { LETTERS, MAX_QUESTIONS, readSheetAnyRotation, sheetLayout } from "../lib/omr.js";
import { fileToGray } from "../lib/scan.js";

// The roster order the sheets are printed with and read back with. Keep the list unchanged between printing and scanning.
export const sheetRoster = (members) => members.filter((m) => m.role === "student").sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));

// The overlay lives in <body>, outside the app root, so printing can hide the app and print the overlay as ordinary flowing pages.
function Overlay({ title, hint, onClose, children, page = "0" }) {
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

function Booklet({ bundle, questions, title, course, onClose }) {
  return (
    <Overlay title="Cuadernillo" hint={`${questions.length} preguntas · se imprime en hojas A4 con márgenes`} onClose={onClose} page="14mm 14mm 16mm">
      <PrintBooklet questions={questions} figures={bundle.figures} examLabel={bundle.exam.title} title={title} course={course} />
    </Overlay>
  );
}

function Sheets({ assignment, questions, roster, course, onClose }) {
  const layout = useMemo(() => sheetLayout(questions.length), [questions.length]);
  return (
    <Overlay title={`Hojas de respuestas · ${roster.length} estudiantes`} hint="Imprime al 100 %, sin márgenes ni “ajustar a la página”. Una hoja por estudiante." onClose={onClose} page="0">
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
      <label className="paper-drop"><Icon name="flag" size={24} /><span>{busy ? "Leyendo…" : "Elegir fotos de las hojas"}</span><input ref={inputRef} type="file" accept="image/*" multiple aria-label="Fotos de las hojas" onChange={onFiles} disabled={busy} /></label>
      {items.map((it) => {
        const s = it.read.ok ? scoreOf(it) : null;
        const doubtful = it.flags.filter(Boolean).length;
        return (
          <div key={it.id} className={`card paper-scan-item ${!it.read.ok ? "is-bad" : doubtful ? "is-doubt" : "is-ok"}`}>
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
  const choices = assignments.filter((a) => !a.assignee_id);
  const [id, setId] = useState(choices[0]?.id ?? "");
  const [mode, setMode] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [roster, setRoster] = useState([]);
  const [course, setCourse] = useState("");
  const assignment = choices.find((a) => a.id === id) ?? choices[0] ?? null;

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
  const noRoster = roster.length === 0;
  const areas = new Set(questions.map((q) => q.section)).size;
  const ready = Boolean(bundle) && !tooMany;
  const steps = [
    { n: 1, icon: "book", title: "Cuadernillo", text: "Las preguntas en hojas A4, en blanco y negro, con el texto de cada grupo una sola vez.", action: "Imprimir cuadernillo", mode: "booklet", off: !ready },
    { n: 2, icon: "user", title: "Hojas de respuestas", text: "Una hoja por estudiante, con su código y las burbujas A a D. Imprime al 100 %.", action: "Imprimir hojas", mode: "sheets", off: !ready || noRoster },
    { n: 3, icon: "bolt", title: "Calificar fotos", text: "Fotografía las hojas llenas con el celular. Los resultados entran junto a los demás.", action: "Calificar fotos", mode: "scan", off: !ready || noRoster, primary: true },
  ];

  return (
    <>
      <header className="t-head"><div><h1>Papel</h1><span className="caption">Simulacro impreso para salones sin un dispositivo por estudiante. Tres pasos: imprimir, resolver, fotografiar.</span></div></header>
      {choices.length === 0 ? <div className="card paper-empty"><Icon name="book" size={28} /><p>Crea primero una asignación con las preguntas del simulacro y vuelve aquí.</p></div> : (
        <>
          <div className="card paper-pick">
            <label className="field"><span className="label">Asignación</span>
              <select value={assignment?.id ?? ""} onChange={(e) => setId(e.target.value)}>{choices.map((a) => <option key={a.id} value={a.id}>{a.courses?.name} · {a.title}</option>)}</select></label>
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
            {bundle && noRoster && <p className="notice error">Este curso no tiene estudiantes en la lista. Agrégalos en “Cursos y estudiantes”.</p>}
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
          <p className="caption paper-note">La lista de estudiantes se ordena por correo. No agregues ni quites estudiantes entre imprimir y calificar: cada hoja lleva el código de su estudiante.</p>
        </>
      )}
      {mode === "booklet" && bundle && <Booklet bundle={bundle} questions={questions} title={assignment.title} course={course} onClose={() => setMode(null)} />}
      {mode === "sheets" && bundle && <Sheets assignment={assignment} questions={questions} roster={roster} course={course} onClose={() => setMode(null)} />}
      {mode === "scan" && bundle && <Scan api={api} assignment={assignment} bundle={bundle} questions={questions} roster={roster} guard={guard} setNotice={setNotice} onClose={() => setMode(null)} />}
    </>
  );
}
