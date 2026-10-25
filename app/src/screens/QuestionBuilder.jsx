import { useEffect, useState } from "react";
import { confirmDialog, Select } from "../components/Controls.jsx";
import QuestionView from "../components/QuestionView.jsx";
import RichText from "../components/RichText.jsx";
import { questionStats } from "../lib/questionStats.js";
import { Bars } from "./Dashboard.jsx";
import { Dialog } from "./builder/ui.jsx";
import { DIFFICULTY_LABEL } from "../lib/bank.js";
import { clearSession, loadSession } from "../lib/builder/docStore.js";
import { TEACHER_SLUG, draftFromRow, teacherExam } from "../lib/teacherExam.js";
import Workspace from "./builder/Workspace.jsx";
import "./builder/builder.css";

// “Mis preguntas”: los docentes escriben las suyas, a mano o desde su propio PDF. Nunca se mezclan con el banco
// ICFES ni con la banda estimada. La lista se filtra (área, dificultad, quién la escribió, compartidas, con imagen,
// sin explicación), muestra cómo la han respondido los estudiantes, se previsualiza como la ve el estudiante y
// admite acciones en grupo (compartir, dejar solo tuyas, cambiar dificultad, borrar).
const SORTS = [["recent", "Más recientes"], ["area", "Por área"], ["hard", "Más difíciles primero"], ["used", "Más respondidas"]];
const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function QuestionBuilder({ api, profile, guard, setNotice }) {
  const [rows, setRows] = useState([]);
  const [work, setWork] = useState(null);
  const [filter, setFilter] = useState("");
  const [areas, setAreas] = useState([]);
  const [diffs, setDiffs] = useState([]);
  const [who, setWho] = useState("all");
  const [flags, setFlags] = useState([]);
  const [sort, setSort] = useState("recent");
  const [picked, setPicked] = useState([]);
  const [preview, setPreview] = useState(null);
  const [stats, setStats] = useState(new Map());
  const [resume, setResume] = useState(null);
  const load = () => guard(async () => setRows(await api.teacherQuestions()));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!work) loadSession(profile.id).then((s) => setResume(s?.drafts?.length ? s : null)); }, [work, profile.id]);
  // How students answered them (every delivered attempt with teacher questions this teacher may read).
  useEffect(() => {
    if (!api.examAttempts || rows.length === 0) return;
    const answer = new Map(rows.map((r) => [r.id, r.answer]));
    api.examAttempts(TEACHER_SLUG).then((all) => setStats(questionStats(all, (k) => answer.get(k) ?? null)), () => {});
  }, [api, rows]);

  const plain = (h) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const hasImage = (r) => r.question_json?.traced?.length > 0 || r.question_json?.options?.some((o) => o.traced);
  const FLAGS = [
    ["shared", "Compartidas", (r) => r.visibility === "school"], ["image", "Con imagen", hasImage],
    ["noexpl", "Sin explicación", (r) => !r.explanation], ["suspect", "Revisar clave", (r) => Boolean(stats.get(r.id)?.suspect)],
    ["unused", "Sin respuestas aún", (r) => !stats.get(r.id)],
  ];
  const areaOf = (r) => r.area || "Otra";
  const text = filter.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (text && !`${r.question_json?.stem_md ?? ""} ${r.question_json?.group?.stimulus_md ?? ""} ${r.area} ${r.tema ?? ""} ${r.competencia ?? ""}`.toLowerCase().includes(text)) return false;
    if (areas.length && !areas.includes(areaOf(r))) return false;
    if (diffs.length && !diffs.includes(Number(r.dificultad))) return false;
    if (who === "mine" && r.owner_id !== profile.id) return false;
    if (who === "others" && r.owner_id === profile.id) return false;
    return flags.every((f) => FLAGS.find((x) => x[0] === f)[2](r));
  }).sort((a, b) => {
    if (sort === "area") return areaOf(a).localeCompare(areaOf(b), "es");
    if (sort === "hard") return (stats.get(a.id)?.pct ?? 101) - (stats.get(b.id)?.pct ?? 101);
    if (sort === "used") return (stats.get(b.id)?.answered ?? 0) - (stats.get(a.id)?.answered ?? 0);
    return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
  });
  const mineIds = new Set(rows.filter((r) => r.owner_id === profile.id).map((r) => r.id));
  const sel = picked.filter((id) => mineIds.has(id));
  const allAreas = [...new Set(rows.map(areaOf))];

  const remove = async (r) => {
    if (!(await confirmDialog("¿Borrar esta pregunta? Las asignaciones que ya la usan dejarán de mostrarla.", { confirmLabel: "Borrar", danger: true }))) return;
    guard(async () => { await api.deleteTeacherQuestion(r.id); await load(); });
  };
  const bulk = async (kind, value) => {
    if (sel.length === 0) return;
    if (kind === "delete" && !(await confirmDialog(`¿Borrar ${sel.length} ${sel.length === 1 ? "pregunta" : "preguntas"}? Las asignaciones que ya las usan dejarán de mostrarlas.`, { confirmLabel: "Borrar", danger: true }))) return;
    guard(async () => {
      for (const id of sel) {
        if (kind === "delete") await api.deleteTeacherQuestion(id);
        else await api.saveTeacherQuestion(kind === "share" ? { visibility: value } : { dificultad: value }, id);
      }
      setNotice(`${sel.length} ${sel.length === 1 ? "pregunta actualizada" : "preguntas actualizadas"}.`);
      setPicked([]);
      await load();
    });
  };
  // A question that shares its text opens with the rest of its group (the ones this teacher owns), in list order.
  const edit = (r) => {
    const gid = r.question_json?.group?.id;
    const mine = gid ? rows.filter((x) => x.question_json?.group?.id === gid && x.owner_id === profile.id).reverse() : [r];
    setWork({ drafts: mine.map(draftFromRow), at: Math.max(0, mine.indexOf(r)) });
  };
  const copy = (r) => setWork({ drafts: [{ ...draftFromRow(r), id: undefined, visibility: "private", dirty: true }], at: 0 });
  // A variant: same question to rewrite (other numbers, other context), kept private until saved.
  const variant = (r) => setWork({ drafts: [{ ...draftFromRow(r), id: undefined, visibility: "private", groupId: null, groupText: "", groupFigures: [], dirty: true }], at: 0 });

  if (work) {
    return <Workspace api={api} profile={profile} guard={guard} initial={work.drafts} startAt={work.at}
      onClose={async (saved) => { setWork(null); setNotice(saved ? "Preguntas guardadas." : ""); await load(); }} />;
  }
  const pv = preview ? rows.find((r) => r.id === preview) : null;
  const pvExam = pv ? teacherExam([pv]) : null;
  const pvStats = pv ? stats.get(pv.id) : null;
  return (
    <>
      <header className="t-head">
        <div><h1>Mis preguntas</h1><span className="caption">Escribe tus propias preguntas o ármalas desde tu PDF, y úsalas en asignaciones y juegos en vivo. Aquí ves cómo las han respondido tus estudiantes.</span></div>
        <button type="button" className="primary" onClick={() => setWork({ drafts: [], at: 0 })}>Nueva pregunta</button>
      </header>
      {resume && (
        <div className="card t-card qb-resume">
          <span><b>{resume.drafts.length === 1 ? "Una pregunta quedó" : `${resume.drafts.length} preguntas quedaron`} sin guardar</b> la última vez.</span>
          <span className="qb-grow" />
          <button type="button" className="link" onClick={() => { clearSession(profile.id); setResume(null); }}>Descartar</button>
          <button type="button" className="primary" onClick={() => setWork({ drafts: resume.drafts, at: 0 })}>Seguir donde iba</button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card t-card qb-filters">
          <input className="qb-input" type="search" placeholder="Buscar en el texto, tema o competencia" aria-label="Buscar mis preguntas" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="chips-row">
            {allAreas.map((a) => <button key={a} type="button" aria-pressed={areas.includes(a)} className={areas.includes(a) ? "chip on" : "chip"} onClick={() => setAreas(toggle(areas, a))}>{a} <span className="muted">{rows.filter((r) => areaOf(r) === a).length}</span></button>)}
          </div>
          <div className="chips-row">
            {[1, 2, 3, 4, 5].map((d) => <button key={d} type="button" aria-pressed={diffs.includes(d)} className={diffs.includes(d) ? "chip on" : "chip"} onClick={() => setDiffs(toggle(diffs, d))}>{DIFFICULTY_LABEL[d]}</button>)}
            {FLAGS.map(([id, label]) => <button key={id} type="button" aria-pressed={flags.includes(id)} className={flags.includes(id) ? "chip on" : "chip"} onClick={() => setFlags(toggle(flags, id))}>{label}</button>)}
          </div>
          <div className="qb-filterbar">
            <div className="segmented small" role="radiogroup" aria-label="Quién la escribió">
              {[["all", "Todas"], ["mine", "Mías"], ["others", "De colegas"]].map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={who === id} className={who === id ? "seg active" : "seg"} onClick={() => setWho(id)}>{l}</button>)}
            </div>
            <Select value={sort} onChange={setSort} aria-label="Ordenar">{SORTS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select>
          </div>
        </div>
      )}
      {sel.length > 0 && (
        <div className="card t-card qb-bulk" role="toolbar" aria-label="Acciones con las elegidas">
          <b>{sel.length} {sel.length === 1 ? "elegida" : "elegidas"}</b>
          <button type="button" className="secondary" onClick={() => bulk("share", "school")}>Compartir con el colegio</button>
          <button type="button" className="secondary" onClick={() => bulk("share", "private")}>Solo mías</button>
          <Select value="" placeholder="Cambiar dificultad…" onChange={(v) => bulk("diff", Number(v))} aria-label="Cambiar dificultad">{[1, 2, 3, 4, 5].map((d) => <option key={d} value={String(d)}>{DIFFICULTY_LABEL[d]}</option>)}</Select>
          <button type="button" className="secondary danger" onClick={() => bulk("delete")}>Borrar</button>
          <button type="button" className="link" onClick={() => setPicked([])}>Quitar selección</button>
        </div>
      )}
      <div className="card t-card">
        {shown.length === 0 && <p className="caption">{rows.length === 0 ? "Todavía no has escrito preguntas. Con «Nueva pregunta» puedes escribirla o abrir tu examen en PDF al lado y recortar cada pregunta de ahí." : "Ninguna coincide."}</p>}
        {shown.length > 0 && (
          <div className="qb-listhead">
            <span className="caption">{shown.length} de {rows.length}</span>
            {shown.some((r) => mineIds.has(r.id)) && <button type="button" className="link" onClick={() => setPicked(sel.length ? [] : shown.filter((r) => mineIds.has(r.id)).map((r) => r.id))}>{sel.length ? "Quitar selección" : "Elegir todas las mías"}</button>}
          </div>
        )}
        <ul className="b-list">
          {shown.map((r) => {
            const st = stats.get(r.id);
            const own = r.owner_id === profile.id;
            return (
              <li key={r.id} className="b-row qb-item">
                {own ? <input type="checkbox" aria-label="Elegir" checked={picked.includes(r.id)} onChange={() => setPicked(toggle(picked, r.id))} /> : <span />}
                <div className="b-body">
                  <strong>{areaOf(r)}{r.tema ? ` · ${r.tema}` : ""}</strong>
                  <span className="b-text">{plain(r.question_json?.stem_md || r.question_json?.group?.stimulus_md).slice(0, 160)}</span>
                  <span className="chips-row">
                    <span className="badge pending">{r.visibility === "school" ? "Compartida con el colegio" : "Solo tuya"}</span>
                    {r.dificultad && <span className="badge pending">{DIFFICULTY_LABEL[r.dificultad]}</span>}
                    {r.question_json?.group && <span className="badge pending">Comparte texto</span>}
                    {hasImage(r) && <span className="badge pending">Con imagen</span>}
                    {(r.question_json?.hint || r.question_json?.feedback) && <span className="badge pending">Con pista o retroalimentación</span>}
                    {!own && <span className="badge pending">De otro docente</span>}
                    {st && <span className="badge" title={Object.entries(st.dist).map(([l, n]) => `${l}: ${n}`).join(" · ")}>{st.answered} {st.answered === 1 ? "respuesta" : "respuestas"} · {st.pct} % acierta</span>}
                    {st?.suspect && <span className="badge bad">Muchos eligen {st.suspect}: revisa la clave</span>}
                  </span>
                </div>
                <span className="qb-actions">
                  <button type="button" className="link" onClick={() => setPreview(r.id)}>Ver</button>
                  {own ? <><button type="button" className="link" onClick={() => edit(r)}>Editar</button><button type="button" className="link" onClick={() => variant(r)}>Variante</button><button type="button" className="link" onClick={() => remove(r)}>Borrar</button></>
                    : <button type="button" className="link" onClick={() => copy(r)}>Copiar y editar</button>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {pv && (
        <Dialog title="Así la ve el estudiante" wide onClose={() => setPreview(null)}>
          <div className="qb-preview">
            <QuestionView question={pvExam.exam.questions[0]} answer={null} graded review={{ correctLetter: pv.answer }} figures={null} report={false} examLabel="" />
            {pv.explanation && <div className="card qb-explain"><span className="label">Explicación</span><RichText html={pv.explanation} className="stimulus" /></div>}
            {pv.question_json?.hint && <div className="card qb-explain"><span className="label">Pista</span><p>{pv.question_json.hint}</p></div>}
            {pvStats ? (
              <div className="card qb-explain">
                <span className="label">Cómo la respondieron · {pvStats.answered} {pvStats.answered === 1 ? "respuesta" : "respuestas"}</span>
                <Bars rows={["A", "B", "C", "D"].map((l) => ({ label: l, value: pvStats.answered ? Math.round(((pvStats.dist[l] ?? 0) / pvStats.answered) * 100) : 0, color: l === pv.answer ? "var(--ok)" : undefined }))} />
                <span className="caption">{pvStats.pct} % acierta: en la práctica resultó {pvStats.level}.{pvStats.suspect ? ` Más estudiantes eligen ${pvStats.suspect} que la respuesta marcada (${pv.answer}): revisa la clave o la redacción de ${pvStats.suspect}.` : ""}</span>
              </div>
            ) : <p className="caption">Nadie la ha respondido todavía.</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
