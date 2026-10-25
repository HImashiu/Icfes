import { useEffect, useMemo, useState } from "react";
import { areaAverages, histogram, itemsCsv, itemStats, mean, round, bandFor, weakCompetencias } from "../lib/analytics.js";
import { assignmentState, progressRows, questionsForAttempt, resultsCsv } from "../lib/assignments.js";
import { areaColor } from "../lib/brand.js";
import { bankItems } from "../lib/bank.js";
import { DEFAULT_MODEL, MODEL_KINDS, SOURCE_LABEL, describeModel, formatValue, gradeMany, isAdjusted, itemFromRow, normalizeModel, valueRange } from "../lib/grading.js";
import { activityFindings, difficultyOf, groupRows, questionDetail, scoreStats } from "../lib/resultsAnalysis.js";
import { groupOf } from "../lib/teaching.js";
import QuestionView from "../components/QuestionView.jsx";
import AutopsyCard from "../components/AutopsyCard.jsx";
import Popup from "../components/Popup.jsx";
import Icon from "../components/Icon.jsx";
import { Bars, Histogram, Kpi } from "./Dashboard.jsx";
import StudentRun from "./StudentRun.jsx";
import { sampleRunAttempt } from "../lib/studentRun.js";
import { classTimes, fmtDuration } from "../lib/studentRun.js";
import { familyPayload, reportUrl, whatsappLink } from "../lib/family.js";
import ProctorPanel from "./ProctorPanel.jsx";
import { Select, confirmDialog } from "../components/Controls.jsx";
import "./results.css";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
const toneOf = (pct) => difficultyOf(pct)?.tone ?? "none";

// Informe de una actividad. Primero el análisis del grupo (notas, áreas, hallazgos, preguntas); la lista de estudiantes
// queda plegada y agrupada por curso. Los detalles (un estudiante, una pregunta) se abren en una ventana.
export default function AssignmentReport({ api, assignment, course = null, related = [], fetchExam, guard, reload, model: savedModel = DEFAULT_MODEL, modelSource = "default", onGrading, onOpenStudent, initialStudent = null }) {
  const [data, setData] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [board, setBoard] = useState(null);
  const [share, setShare] = useState(null);
  const [familyMsg, setFamilyMsg] = useState(null);
  const [student, setStudent] = useState(initialStudent);
  const [sample, setSample] = useState(false);
  const [who, setWho] = useState("all"); // all | done | pending
  const [viewKind, setViewKind] = useState(""); // "" = the activity's own model; otherwise a model kind to look through
  const [showStudents, setShowStudents] = useState(Boolean(initialStudent));
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [qMode, setQMode] = useState("map"); // map | table
  const [qOrder, setQOrder] = useState("number"); // number | hardest
  const [qArea, setQArea] = useState("");
  const [question, setQuestion] = useState(null); // key of the question open in the window
  const [withRelated, setWithRelated] = useState(false);
  const model = useMemo(() => (viewKind && viewKind !== savedModel.kind ? normalizeModel({ ...savedModel, kind: viewKind }) : savedModel), [viewKind, savedModel]);

  const relatedKey = related.map((r) => r.assignment.id).join(",");
  useEffect(() => {
    guard(async () => {
      const own = [{ assignment, course }];
      const sets = withRelated ? [...own, ...related] : own;
      const [lists, b] = await Promise.all([
        Promise.all(sets.map(async (s) => {
          const [members, attempts] = await Promise.all([api.listMembers(s.assignment.course_id), api.assignmentAttempts(s.assignment.id)]);
          const group = s.course ? groupOf(s.course).name : s.assignment.courses?.name ?? "";
          return { members: members.map((m) => ({ ...m, __group: group })), attempts };
        })),
        fetchExam(assignment.exam_slug, assignment.question_keys),
      ]);
      setBundle(b);
      setData({ members: lists.flatMap((l) => l.members), attempts: lists.flatMap((l) => l.attempts) });
    });
  }, [api, assignment, course, fetchExam, guard, withRelated, relatedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => {
    if (!data) return null;
    const prog = progressRows(data.members, data.attempts);
    const groupById = new Map(data.members.map((m) => [m.id, m.__group]));
    const questions = bundle ? questionsForAttempt(bundle.exam, { scope: assignment.scope, keys: assignment.question_keys }) : [];
    const delivered = data.attempts.filter((a) => a.submitted_at);
    const items = bundle ? itemStats(questions, bundle.key, delivered) : [];
    const timed = assignment.kind === "exam";
    const ctx = bundle ? { questions, key: bundle.key } : {};
    const graded = prog.rows.filter((r) => r.attempt);
    // The group is graded together (IRT needs it); each student's best delivered attempt counts, like the percent column.
    const grades = gradeMany(graded.map((r) => itemFromRow(r.attempt, r.attempts.indexOf(r.attempt) + 1)), model, ctx);
    const gradeOf = new Map(graded.map((r, i) => [r.id, grades[i]]));
    const rows = prog.rows.map((r) => ({
      ...r,
      group: groupById.get(r.id) ?? "",
      grade: gradeOf.get(r.id) ?? null,
      band: timed && r.attempt?.score?.keyed ? bandFor(r.attempt.score.perArea) : null,
      answers: r.attempt?.answers ?? {},
    }));
    const values = rows.map((r) => r.grade?.value).filter((v) => v != null);
    const range = valueRange(model) ?? (values.length ? [Math.min(...values), Math.max(...values) + 1e-9] : [0, 1]);
    const pcts = rows.map((r) => r.pct).filter((p) => p != null);
    const passed = rows.filter((r) => r.grade?.passed != null);
    const secs = rows.filter((r) => r.done && !r.paper).map((r) => r.attempt?.duration_sec).filter((s) => s > 0);
    const areas = areaAverages(rows.map((r) => r.attempt).filter(Boolean));
    const pctStats = scoreStats(pcts);
    const tags = bundle ? bankItems(bundle.exam, { enrich: bundle.enrich, key: bundle.key }) : [];
    return {
      prog, rows, questions, items, timed, areas, pctStats,
      gradeStats: scoreStats(values),
      avgTimes: classTimes(questions, delivered),
      avg: round(mean(pcts)),
      gradeAvg: values.length ? mean(values) : null,
      hist: histogram(values, range[0], range[1], 5),
      passed: passed.length ? { yes: passed.filter((r) => r.grade.passed).length, of: passed.length } : null,
      medianSec: secs.length ? scoreStats(secs).median : null,
      competencias: bundle ? weakCompetencias(tags, bundle.key, delivered, { minAnswered: 6 }).slice(0, 6) : [],
      groups: new Set(rows.map((r) => r.group)).size,
    };
  }, [data, bundle, assignment, model]);

  const details = useMemo(() => (view ? new Map(view.items.map((i) => [i.key, questionDetail(i, view.rows)])) : new Map()), [view]);

  if (!view) return <p className="caption">Cargando resultados…</p>;
  const { prog, rows, items, timed } = view;
  const sorted = [...items].filter((i) => i.pct != null).sort((a, b) => a.pct - b.pct);
  const areaNames = [...new Set(items.map((i) => i.section))];
  const shownItems = items.filter((i) => !qArea || i.section === qArea);
  const orderedItems = qOrder === "hardest" ? [...shownItems].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)) : shownItems;
  const gradeLabel = model.kind === "percent" ? "Puntaje" : "Nota";
  const passLabel = view.passed ? `${view.passed.yes} de ${view.passed.of} aprueban con ${describeModel(model).split(" · ")[0].toLowerCase()}.` : null;
  const findings = activityFindings({ rows, items, areas: view.areas, stats: view.pctStats, passLabel });
  const visibleRows = rows.filter((r) => who === "all" || (who === "done" ? r.done : !r.done)).sort((a, b) => Number(b.done) - Number(a.done) || a.name.localeCompare(b.name, "es"));
  const groups = groupRows(visibleRows, (r) => r.group);
  const groupOpen = (name) => groups.length === 1 || openGroups.has(name);
  const toggleGroup = (name) => setOpenGroups((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  const closeNow = () => guard(async () => { await api.setAssignmentStatus(assignment.id, "closed"); await reload(); });
  const remove = async () => {
    if (await confirmDialog("¿Borrar esta asignación? Los intentos de los estudiantes se conservan.", { confirmLabel: "Borrar", danger: true })) guard(async () => { await api.deleteAssignment(assignment.id); await reload(); });
  };
  const family = (r) => {
    const profileId = r.attempt?.profile_id ?? data.members.find((m) => m.id === r.id)?.profile_id;
    if (!profileId) { setFamilyMsg(`${r.name} todavía no ha ingresado a la plataforma: el informe familiar necesita una cuenta. Cuando ingrese con su correo, sus resultados en papel quedan en su cuenta.`); return; }
    setFamilyMsg(null);
    guard(async () => {
      try {
        const attempts = await api.studentAttempts(profileId);
        const token = await api.createFamilyReport(profileId, familyPayload({ studentName: r.name, attempts }));
        setShare({ token, name: r.name });
      } catch (e) {
        if (String(e.message).includes("no_guardian_authorization")) { setFamilyMsg("Antes de compartir informes con familias, la coordinación debe registrar la autorización de acudientes en Ajustes."); return; }
        throw e;
      }
    });
  };
  const reinforce = async () => {
    const keys = sorted.slice(0, 10).map((i) => i.key);
    if (keys.length === 0 || !(await confirmDialog(`¿Crear una práctica nueva con las ${keys.length} preguntas más falladas para este curso?`, { confirmLabel: "Crear práctica" }))) return;
    guard(async () => {
      const me = await api.getProfile();
      await api.createAssignment({
        course_id: assignment.course_id, created_by: me.id, kind: "task", title: `Refuerzo · ${assignment.title}`.slice(0, 120),
        exam_slug: assignment.exam_slug, scope: assignment.scope, question_keys: keys,
        due_at: new Date(Date.now() + 7 * 864e5).toISOString(), reveal_policy: "after_submit", status: "active",
      });
      await reload();
    });
  };

  const openRow = rows.find((r) => r.id === student);
  const qIndex = question ? orderedItems.findIndex((i) => i.key === question) : -1;
  const q = question ? details.get(question) : null;

  return (
    <div className="ar2" id="report">
      <GradingStrip model={savedModel} source={modelSource} onGrading={onGrading} />

      <section className="card t-card ar2-head">
        <div className="section-head">
          <strong>{prog.done} de {prog.total} entregaron</strong>
          <span className="muted">{prog.completion} %</span>
        </div>
        <div className="progress thin"><span style={{ width: `${prog.completion}%` }} /></div>
        {related.length > 0 && (
          <label className="ar2-related">
            <input type="checkbox" checked={withRelated} onChange={(e) => setWithRelated(e.target.checked)} />
            <span>Ver junto con {related.map((r) => (r.course ? groupOf(r.course).name : r.assignment.courses?.name)).join(", ")} (la misma actividad en otros cursos)</span>
          </label>
        )}
      </section>

      {prog.done > 0 && (
        <>
          <div className="d-kpis ar2-kpis">
            <Kpi label={model.kind === "percent" ? "Promedio" : "Nota promedio"} value={view.gradeAvg == null ? null : formatValue(model, view.gradeAvg)} hint={isAdjusted(model) && view.avg != null ? `${view.avg} % de aciertos` : undefined} />
            <Kpi label="Mediana" value={view.gradeStats.median == null ? null : formatValue(model, view.gradeStats.median)} hint={view.gradeStats.q1 != null ? `La mitad central: ${formatValue(model, view.gradeStats.q1)} a ${formatValue(model, view.gradeStats.q3)}` : undefined} />
            {view.passed && <Kpi label="Aprueban" value={`${view.passed.yes}/${view.passed.of}`} hint={`${Math.round((view.passed.yes / view.passed.of) * 100)} % del grupo`} />}
            <Kpi label="Entregaron" value={`${prog.done}/${prog.total}`} hint={prog.total - prog.done ? `faltan ${prog.total - prog.done}` : "todos"} />
            {view.medianSec != null && <Kpi label="Tiempo típico" value={fmtDuration(view.medianSec)} hint="la mitad tardó menos" />}
          </div>

          <div className="d-two">
            <section className="card t-card">
              <span className="label">Distribución de {model.kind === "percent" ? "puntajes" : "notas"}</span>
              <Histogram bins={view.hist} format={(b) => `${formatValue(model, b.from)}–${formatValue(model, b.to)}`} />
              <span className="caption">Cada barra cuenta estudiantes en ese rango. Desviación: {view.pctStats.sd == null ? "—" : `${Math.round(view.pctStats.sd)} puntos de aciertos`}.</span>
              {findings.length > 0 && (
                <>
                  <span className="label ar2-sub">Lo que muestran los datos</span>
                  <ul className="ar2-findings">{findings.map((f, i) => <li key={i} className={`tone-${f.tone}`}>{f.text}</li>)}</ul>
                </>
              )}
            </section>
            <section className="card t-card">
              <span className="label">Aciertos por área</span>
              <Bars rows={view.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} />
              {view.competencias.length > 0 && (
                <>
                  <span className="label ar2-sub">Competencias más bajas</span>
                  <Bars rows={view.competencias.map((c) => ({ label: c.competencia, value: c.pct, color: c.pct < 40 ? "var(--bad)" : "var(--flame)" }))} />
                </>
              )}
            </section>
          </div>
        </>
      )}

      {items.length > 0 && prog.done > 0 && (
        <section className="card t-card">
          <div className="section-head ar2-qhead">
            <div><strong>Preguntas</strong><span className="caption"> · toca una para ver qué respondió todo el grupo</span></div>
            <div className="segmented small" role="group" aria-label="Vista">
              {[["map", "Mapa"], ["table", "Tabla"]].map(([id, l]) => <button key={id} type="button" className={qMode === id ? "seg active" : "seg"} aria-pressed={qMode === id} onClick={() => setQMode(id)}>{l}</button>)}
            </div>
          </div>
          <div className="ar2-qtools">
            <div className="chips-row" role="group" aria-label="Área">
              <button type="button" className={qArea ? "chip" : "chip on"} aria-pressed={!qArea} onClick={() => setQArea("")}>Todas · {items.length}</button>
              {areaNames.length > 1 && areaNames.map((a) => <button key={a} type="button" className={qArea === a ? "chip on" : "chip"} aria-pressed={qArea === a} onClick={() => setQArea(a)}><span className="dot" style={{ background: areaColor(a) }} />{a}</button>)}
            </div>
            <div className="segmented small" role="group" aria-label="Orden">
              {[["number", "Por número"], ["hardest", "Más falladas"]].map(([id, l]) => <button key={id} type="button" className={qOrder === id ? "seg active" : "seg"} aria-pressed={qOrder === id} onClick={() => setQOrder(id)}>{l}</button>)}
            </div>
          </div>
          {qMode === "map" ? (
            <>
              <div className="ar2-qmap">
                {orderedItems.map((i) => (
                  <button key={i.key} type="button" className={`ar2-q tone-${toneOf(i.pct)}`} onClick={() => setQuestion(i.key)} aria-label={`Pregunta ${i.number}: ${i.pct == null ? "sin clave" : `${i.pct} % acertó`}`}>
                    <span className="ar2-qn">{i.number}</span>
                    <span className="ar2-qp">{i.pct == null ? "—" : `${i.pct}%`}</span>
                    {i.suspect && <span className="ar2-qflag" title="Revisar clave">!</span>}
                  </button>
                ))}
              </div>
              <div className="ar2-legend caption">
                <span><i className="tone-bad" /> Difícil: menos del 40 % acertó</span>
                <span><i className="tone-mid" /> Media: 40 a 69 %</span>
                <span><i className="tone-ok" /> Fácil: 70 % o más</span>
                <span><b>!</b> Revisar clave</span>
              </div>
            </>
          ) : (
            <div className="table-wrap">
              <table className="t-table">
                <thead><tr><th>N.°</th><th>Área</th><th>Acierto</th><th>Dificultad</th><th>Respuestas (A · B · C · D)</th><th>Error común</th><th>Tiempo medio</th><th /></tr></thead>
                <tbody>
                  {orderedItems.map((i) => (
                    <tr key={i.key} className="t-row-link" onClick={() => setQuestion(i.key)}>
                      <td>{i.number}</td>
                      <td>{i.section}</td>
                      <td>{i.pct == null ? "—" : `${i.pct} %`}</td>
                      <td>{difficultyOf(i.pct)?.label ?? "—"}</td>
                      <td>{["A", "B", "C", "D"].map((l) => <span key={l} className={l === i.keyed ? "d-opt key" : "d-opt"}>{l} {i.dist[l] ?? 0}</span>)}</td>
                      <td>{i.topWrong ? `${i.topWrong} (${i.dist[i.topWrong]})` : "—"}</td>
                      <td>{i.avgSec == null ? "—" : fmtDuration(i.avgSec)}</td>
                      <td>{i.suspect && <span className="badge pending" title="La mayoría eligió otra opción: revisa la clave, que es preliminar.">Revisar clave</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="report-actions no-print">
            {sorted.length > 0 && <button type="button" className="secondary" onClick={() => setBoard(0)}><Icon name="expand" size={16} /> Proyectar las más falladas</button>}
            {sorted.length >= 3 && <button type="button" className="secondary" onClick={reinforce}>Crear refuerzo con las más falladas</button>}
          </div>
        </section>
      )}

      <section className="card t-card ar2-students">
        <button type="button" className="ar2-toggle" aria-expanded={showStudents} onClick={() => setShowStudents(!showStudents)}>
          <Icon name="users" size={18} />
          <strong>Estudiantes</strong>
          <span className="caption">{prog.done} entregaron · {prog.total - prog.done} faltan{view.groups > 1 ? ` · ${view.groups} cursos` : ""}</span>
          <span className="ar2-toggle-cta">{showStudents ? "Ocultar" : "Mostrar lista"}<span className="chev"><Icon name="right" size={14} strokeWidth={3} /></span></span>
        </button>
        {showStudents && (
          <>
            {prog.done > 0 && (
              <div className="ar-tools no-print">
                <div className="segmented small" role="group" aria-label="Quién aparece">
                  {[["all", `Todos · ${rows.length}`], ["done", `Entregaron · ${prog.done}`], ["pending", `Faltan · ${rows.length - prog.done}`]].map(([id, l]) => (
                    <button key={id} type="button" className={who === id ? "seg active" : "seg"} aria-pressed={who === id} onClick={() => setWho(id)}>{l}</button>
                  ))}
                </div>
                <label className="ar-viewas"><span className="label">Ver notas como</span>
                  <Select aria-label="Ver notas como" value={viewKind || savedModel.kind} onChange={(v) => setViewKind(v === savedModel.kind ? "" : v)}
                    options={MODEL_KINDS.map((k) => ({ value: k.id, label: k.id === savedModel.kind ? `${k.label} (el de esta actividad)` : k.label }))} />
                </label>
              </div>
            )}
            {viewKind && <p className="caption no-print">Vista de comparación: así quedarían las notas con «{MODEL_KINDS.find((k) => k.id === viewKind)?.label}». No cambia nada guardado; para usarlo de verdad, cámbialo en Calificación.</p>}
            {groups.map((g) => (
              <div key={g.name} className="ar2-group">
                {groups.length > 1 && (
                  <button type="button" className="ar2-group-head" aria-expanded={groupOpen(g.name)} onClick={() => toggleGroup(g.name)}>
                    <span className="chev"><Icon name="right" size={14} strokeWidth={3} /></span>
                    <strong>{g.name}</strong>
                    <span className="caption">{g.rows.filter((r) => r.done).length} de {g.n} entregaron{g.avg != null ? ` · ${g.avg} % de aciertos` : ""}</span>
                  </button>
                )}
                {groupOpen(g.name) && (
                  <div className="table-wrap">
                    <table className="t-table m-cards">
                      <thead><tr><th>Estudiante</th><th>Estado</th><th>{gradeLabel}</th>{isAdjusted(model) && <th>Aciertos</th>}{timed && <th>Banda estimada</th>}<th>Entregado</th><th>Tiempo</th><th>Intentos</th><th className="no-print" /></tr></thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.id} className={r.done ? "" : "ar-pending"}>
                            <td className="m-main">{onOpenStudent && r.email ? <button type="button" className="link" title="Abrir su perfil completo" onClick={() => onOpenStudent(r.email)}>{r.name}</button> : r.name}</td>
                            <td>{r.done ? <span className="badge ok">{r.paper ? "Entregado (papel)" : "Entregado"}</span> : <span className="badge pending">{r.joined ? "Pendiente" : "Sin ingresar"}</span>}</td>
                            <td data-l={gradeLabel} className={r.grade ? "ar-grade" : "m-hide"} title={r.grade?.error ?? r.grade?.note ?? undefined}>{r.grade ? r.grade.display : "—"}{r.grade?.passed === false && <span className="badge pending"> no aprueba</span>}</td>
                            {isAdjusted(model) && <td data-l="Aciertos" className={r.pct == null ? "m-hide" : ""}>{r.pct == null ? "—" : `${r.pct} %`}</td>}
                            {timed && <td data-l="Banda" className={r.band?.global == null ? "m-hide" : ""}>{r.band?.global == null ? "—" : `${r.band.low}–${r.band.high}`}</td>}
                            <td data-l="Entregado" className={r.at ? "" : "m-hide"}>{r.at ? shortDate(r.at) : "—"}</td>
                            <td data-l="Tiempo" className={r.done && !r.paper ? "" : "m-hide"}>{r.done && !r.paper ? fmtDuration(r.attempt?.duration_sec) : "—"}</td>
                            <td data-l="Intentos" className={r.attempts.length ? "" : "m-hide"}>{r.attempts.length || "—"}</td>
                            <td className={r.done ? "no-print ar-actions" : "no-print m-hide"}>{r.done && <button type="button" className="link" onClick={() => setStudent(r.id)}>Ver detalle</button>}{r.done && <button type="button" className="link" onClick={() => family(r)}>Informe familiar</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {rows.length === 0 && <p className="caption">El curso no tiene estudiantes.</p>}
            {isAdjusted(model) && <span className="caption no-print">Calificación: {describeModel(model)}.{rows.find((r) => r.grade?.provisional)?.grade.note ? ` ${rows.find((r) => r.grade?.provisional).grade.note}` : ""}</span>}
            {timed && <span className="caption">La banda (0–500) se calcula como el ICFES, con dificultad de preguntas estimada y clave preliminar: es un estimado, no el puntaje oficial.</span>}
          </>
        )}
      </section>

      {prog.done === 0 && bundle && view.questions.length > 0 && (
        <button type="button" className="secondary no-print" onClick={() => setSample(true)}>Ver un ejemplo de reporte individual</button>
      )}
      {sample && bundle && (
        <Popup title="Estudiante de ejemplo" subtitle="Datos inventados" onClose={() => setSample(false)} wide>
          <StudentRun name="Estudiante de ejemplo (datos inventados)" attempts={[sampleRunAttempt(view.questions.slice(0, 20), bundle.key)]} questions={view.questions.slice(0, 20)} answerKey={bundle.key} avgTimes={new Map()} onClose={() => setSample(false)} />
        </Popup>
      )}
      {assignment.proctor && <ProctorPanel api={api} assignment={assignment} members={data.members} />}

      {openRow && openRow.attempts.length > 0 && bundle && (
        <Popup title={openRow.name} subtitle={`${assignment.title}${openRow.group ? ` · ${openRow.group}` : ""}`} onClose={() => setStudent(null)} wide
          actions={onOpenStudent && openRow.email ? <button type="button" className="secondary pp-act" onClick={() => onOpenStudent(openRow.email)}>Perfil completo</button> : null}>
          <StudentRun key={student} name={openRow.name} attempts={openRow.attempts} questions={view.questions} answerKey={bundle.key} avgTimes={view.avgTimes} onClose={() => setStudent(null)} />
        </Popup>
      )}

      {q && bundle && (
        <QuestionPopup q={q} total={orderedItems.length} index={qIndex} bundle={bundle} question={view.questions.find((x) => x.key === q.key)}
          onPrev={qIndex > 0 ? () => setQuestion(orderedItems[qIndex - 1].key) : null}
          onNext={qIndex < orderedItems.length - 1 ? () => setQuestion(orderedItems[qIndex + 1].key) : null}
          onClose={() => setQuestion(null)} />
      )}

      {familyMsg && <p className="notice no-print" role="alert">{familyMsg}</p>}
      {share && (
        <div className="notice no-print" role="status" style={{ display: "grid", gap: 8 }}>
          <strong>Informe de {share.name} listo</strong>
          <input readOnly aria-label="Enlace del informe" value={reportUrl(share.token)} onFocus={(e) => e.target.select()} />
          <div className="report-actions">
            <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(reportUrl(share.token))}>Copiar enlace</button>
            <a className="secondary" href={whatsappLink(reportUrl(share.token), share.name)} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
            <a className="secondary" href={reportUrl(share.token)} target="_blank" rel="noreferrer">Ver como la familia</a>
            <button type="button" className="link" onClick={() => guard(async () => { await api.revokeFamilyReport(share.token); setShare(null); })}>Retirar enlace</button>
          </div>
          <span className="caption">Quien tenga el enlace puede ver el informe, sin iniciar sesión. Envíalo solo a la familia.</span>
        </div>
      )}

      {board !== null && sorted[board] && bundle && (() => {
        const it = sorted[board];
        const bq = view.questions.find((x) => x.key === it.key);
        const top5 = sorted.slice(0, 5);
        return (
          <Popup title={`Pregunta ${it.number} · ${board + 1} de ${top5.length}`} subtitle="Las más falladas, para proyectar en clase" onClose={() => setBoard(null)} wide
            actions={<span className="pp-nav"><button type="button" className="secondary" disabled={board === 0} onClick={() => setBoard(board - 1)}>Anterior</button><button type="button" className="secondary" disabled={board >= top5.length - 1} onClick={() => setBoard(board + 1)}>Siguiente</button></span>}>
            <AutopsyCard counts={Object.fromEntries((bq?.options ?? []).map((o) => [o.letter, it.dist[o.letter] ?? 0]))} correct={it.keyed ? [it.keyed] : []} enrichRow={bundle.enrich?.[String(it.number)]} meta={bundle.enrichMeta} />
            {bq && <QuestionView question={bq} answer={null} graded review={{ correctLetter: it.keyed }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />}
          </Popup>
        );
      })()}

      <span className="caption">Puntaje según la clave preliminar, no oficial.</span>
      <div className="report-actions no-print">
        <button type="button" className="secondary" onClick={() => download(`${assignment.title}.csv`, resultsCsv(assignment.title, rows, isAdjusted(model) ? { label: `Nota (${MODEL_KINDS.find((k) => k.id === model.kind).label})`, of: (r) => r.grade?.display } : null))}>Exportar CSV</button>
        <button type="button" className="secondary" disabled={!bundle || prog.done === 0} onClick={() => download(`${assignment.title} · por pregunta.csv`, itemsCsv(assignment.title, view.questions, bundle.key, rows.filter((r) => r.done)))}>CSV por pregunta</button>
        <button type="button" className="secondary" onClick={() => window.print()}>Imprimir o PDF</button>
        {assignmentState(assignment) !== "closed" && <button type="button" className="secondary" onClick={closeNow}>Cerrar ahora</button>}
        <button type="button" className="link" onClick={remove}>Borrar</button>
      </div>
    </div>
  );
}

// What grading this activity uses and where it comes from, above the results. Without a chosen method the results
// are plain percentages and the strip asks the teacher to choose first.
export function GradingStrip({ model, source, onGrading }) {
  const chosen = source !== "default";
  return (
    <div className={chosen ? "ar2-grading" : "ar2-grading ask"}>
      <Icon name="pencil" size={18} />
      <div>
        {chosen
          ? <><strong>Calificación: {describeModel(model)}</strong><span className="caption">Definida para {SOURCE_LABEL[source]}. Las notas de abajo ya la usan.</span></>
          : <><strong>Aún no eliges cómo calificar</strong><span className="caption">Por ahora ves el porcentaje de aciertos. Elige el método (escala 1–5, estimado ICFES…) y mira cómo cambia cada nota antes de guardarlo.</span></>}
      </div>
      {onGrading && <button type="button" className={chosen ? "secondary" : "primary"} onClick={onGrading}>{chosen ? "Cambiar" : "Elegir cómo calificar"}</button>}
    </div>
  );
}

// One question for the whole group: how hard it was, whether it separates who masters the topic, what each option
// drew and who chose it, and the question itself.
function QuestionPopup({ q, total, index, bundle, question, onPrev, onNext, onClose }) {
  const [openLetter, setOpenLetter] = useState(null);
  const letters = (question?.options ?? []).map((o) => o.letter);
  const all = letters.length ? letters : ["A", "B", "C", "D"];
  const max = Math.max(1, ...all.map((l) => q.dist[l] ?? 0), q.blank.length);
  return (
    <Popup title={`Pregunta ${q.number}`} subtitle={`${q.section} · ${index + 1} de ${total}`} onClose={onClose} wide
      actions={<span className="pp-nav"><button type="button" className="secondary" disabled={!onPrev} onClick={onPrev} aria-label="Pregunta anterior"><Icon name="left" size={16} /></button><button type="button" className="secondary" disabled={!onNext} onClick={onNext} aria-label="Pregunta siguiente"><Icon name="right" size={16} /></button></span>}>
      <div className="qp-stats">
        <div className={`qp-stat tone-${q.difficulty?.tone ?? "none"}`}><span className="label">Acierto del grupo</span><strong>{q.pct == null ? "—" : `${q.pct} %`}</strong><span className="caption">{q.difficulty ? `Dificultad: ${q.difficulty.label}` : "Sin clave"}</span></div>
        <div className={`qp-stat tone-${q.discInfo.tone}`}><span className="label">¿Separa a quienes dominan el tema?</span><strong>{q.discInfo.label}</strong><span className="caption">{q.disc == null ? "" : `Índice ${String(q.disc).replace(".", ",")}`}</span></div>
        <div className="qp-stat"><span className="label">Tiempo medio</span><strong>{q.avgSec == null ? "—" : fmtDuration(q.avgSec)}</strong><span className="caption">{q.hintN ? `${q.hintN} usaron pista` : `${q.answered} respuestas`}</span></div>
      </div>
      <ul className="ar2-findings">{q.reading.map((t, i) => <li key={i}>{t}</li>)}<li className="caption">{q.discInfo.text}</li></ul>

      <div className="qp-options" role="list" aria-label="Qué eligió el grupo">
        {all.map((l) => {
          const n = q.dist[l] ?? 0;
          const names = q.who[l] ?? [];
          const key = l === q.keyed;
          return (
            <div key={l} className={key ? "qp-opt key" : "qp-opt"} role="listitem">
              <button type="button" className="qp-opt-row" aria-expanded={openLetter === l} disabled={!names.length} onClick={() => setOpenLetter(openLetter === l ? null : l)}>
                <span className="qp-letter">{l}</span>
                <span className="qp-track"><span style={{ width: `${(n / max) * 100}%` }} /></span>
                <span className="qp-n">{n}{q.answered ? ` · ${Math.round((n / q.answered) * 100)} %` : ""}</span>
                <span className="qp-tag">{key ? "Clave" : l === q.topWrong && n ? "Error común" : ""}</span>
              </button>
              {openLetter === l && <p className="qp-names">{names.join(", ")}</p>}
            </div>
          );
        })}
        {q.blank.length > 0 && (
          <div className="qp-opt" role="listitem">
            <button type="button" className="qp-opt-row" aria-expanded={openLetter === "-"} onClick={() => setOpenLetter(openLetter === "-" ? null : "-")}>
              <span className="qp-letter">–</span>
              <span className="qp-track"><span style={{ width: `${(q.blank.length / max) * 100}%` }} /></span>
              <span className="qp-n">{q.blank.length}</span>
              <span className="qp-tag">En blanco</span>
            </button>
            {openLetter === "-" && <p className="qp-names">{q.blank.join(", ")}</p>}
          </div>
        )}
        <span className="caption">Toca una opción para ver quiénes la eligieron.</span>
      </div>

      <AutopsyCard bars={false} counts={Object.fromEntries(all.map((l) => [l, q.dist[l] ?? 0]))} correct={q.keyed ? [q.keyed] : []} enrichRow={bundle.enrich?.[String(q.number)]} meta={bundle.enrichMeta} />
      {question && <QuestionView question={question} answer={null} graded review={{ correctLetter: q.keyed }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />}
    </Popup>
  );
}
