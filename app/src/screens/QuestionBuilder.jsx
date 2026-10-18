import { useEffect, useState } from "react";
import { DIFFICULTY_LABEL } from "../lib/bank.js";
import { clearSession, loadSession } from "../lib/builder/docStore.js";
import { draftFromRow } from "../lib/teacherExam.js";
import Workspace from "./builder/Workspace.jsx";
import "./builder/builder.css";

// “Mis preguntas”: los docentes escriben las suyas, a mano o desde su propio PDF. Nunca se mezclan con el banco
// ICFES ni con la banda estimada.
export default function QuestionBuilder({ api, profile, guard, setNotice }) {
  const [rows, setRows] = useState([]);
  const [work, setWork] = useState(null);
  const [filter, setFilter] = useState("");
  const [resume, setResume] = useState(null);
  const load = () => guard(async () => setRows(await api.teacherQuestions()));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!work) loadSession(profile.id).then((s) => setResume(s?.drafts?.length ? s : null)); }, [work, profile.id]);

  const shown = rows.filter((r) => `${r.question_json?.stem_md ?? ""} ${r.question_json?.group?.stimulus_md ?? ""} ${r.area} ${r.tema ?? ""} ${r.competencia ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const remove = (r) => {
    if (!window.confirm("¿Borrar esta pregunta? Las asignaciones que ya la usan dejarán de mostrarla.")) return;
    guard(async () => { await api.deleteTeacherQuestion(r.id); await load(); });
  };
  // A question that shares its text opens with the rest of its group (the ones this teacher owns), in list order.
  const edit = (r) => {
    const gid = r.question_json?.group?.id;
    const mine = gid ? rows.filter((x) => x.question_json?.group?.id === gid && x.owner_id === profile.id).reverse() : [r];
    setWork({ drafts: mine.map(draftFromRow), at: Math.max(0, mine.indexOf(r)) });
  };
  const copy = (r) => setWork({ drafts: [{ ...draftFromRow(r), id: undefined, visibility: "private", dirty: true }], at: 0 });

  if (work) {
    return <Workspace api={api} profile={profile} guard={guard} initial={work.drafts} startAt={work.at}
      onClose={async (saved) => { setWork(null); setNotice(saved ? "Preguntas guardadas." : ""); await load(); }} />;
  }
  const plain = (h) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return (
    <>
      <header className="t-head">
        <div><h1>Mis preguntas</h1><span className="caption">Escribe tus propias preguntas o ármalas desde tu PDF, y úsalas en asignaciones y juegos en vivo.</span></div>
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
      <div className="card t-card">
        {rows.length > 4 && <input className="qb-input" type="search" placeholder="Buscar" aria-label="Buscar mis preguntas" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        {shown.length === 0 && <p className="caption">{rows.length === 0 ? "Todavía no has escrito preguntas. Con «Nueva pregunta» puedes escribirla o abrir tu examen en PDF al lado y recortar cada pregunta de ahí." : "Ninguna coincide."}</p>}
        <ul className="b-list">
          {shown.map((r) => (
            <li key={r.id} className="b-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <div className="b-body">
                <strong>{r.area || "Otra"}{r.tema ? ` · ${r.tema}` : ""}</strong>
                <span className="b-text">{plain(r.question_json?.stem_md || r.question_json?.group?.stimulus_md).slice(0, 160)}</span>
                <span className="chips-row">
                  <span className="badge pending">{r.visibility === "school" ? "Compartida con el colegio" : "Solo tuya"}</span>
                  {r.dificultad && <span className="badge pending">{DIFFICULTY_LABEL[r.dificultad]}</span>}
                  {r.question_json?.group && <span className="badge pending">Comparte texto</span>}
                  {(r.question_json?.traced?.length > 0 || r.question_json?.options?.some((o) => o.traced)) && <span className="badge pending">Con imagen</span>}
                  {r.owner_id !== profile.id && <span className="badge pending">De otro docente</span>}
                </span>
              </div>
              <span>
                {r.owner_id === profile.id
                  ? <><button type="button" className="link" onClick={() => edit(r)}>Editar</button>{" "}<button type="button" className="link" onClick={() => remove(r)}>Borrar</button></>
                  : <button type="button" className="link" onClick={() => copy(r)}>Copiar y editar</button>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
