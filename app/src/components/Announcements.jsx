import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { DateField, confirmDialog } from "./Controls.jsx";
import { areaColor } from "../lib/brand.js";
import { activeAnnouncements, groupSent, whenText } from "../lib/announcements.js";
import { areaOf, classLabel } from "../lib/teaching.js";

const today = () => new Date().toISOString().slice(0, 10);

// Teacher: the anuncios of the classes in view, and a short form to post one to one or several of them.
// classes: the classes the teacher can edit (a notice goes to each one's students).
export function TeacherAnnouncements({ api, profile, classes }) {
  const [rows, setRows] = useState(undefined); // undefined loading, null migration missing
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const ids = classes.map((c) => c.id);
  const idsKey = ids.join(",");
  const load = () => api.listAnnouncements(ids).then(setRows, (e) => { setRows([]); setError(e.message); });
  useEffect(() => { if (ids.length && api?.listAnnouncements) load(); else setRows([]); }, [api, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!api?.listAnnouncements) return null;

  const name = (id) => { const c = classes.find((x) => x.id === id); return c ? classLabel(c) : ""; };
  const list = groupSent(activeAnnouncements(rows ?? []));
  const act = async (fn) => { setError(null); try { await fn(); await load(); } catch (e) { setError(e.message); } };

  return (
    <section className="card td-card an-card">
      <div className="section-head">
        <h2>Anuncios</h2>
        {rows !== null && classes.length > 0 && !open && <button type="button" className="secondary small" onClick={() => setOpen(true)}><Icon name="plus" size={16} strokeWidth={2.8} /> Nuevo</button>}
      </div>
      {rows === null && <p className="caption">Para publicar anuncios falta correr la migración 0026 en Supabase.</p>}
      {error && <p className="notice error">{error}</p>}
      {open && <Composer classes={classes} profile={profile} onCancel={() => setOpen(false)} onPost={(a) => act(async () => { await api.postAnnouncement(a); setOpen(false); })} />}
      {rows !== null && !open && list.length === 0 && <p className="caption">Avisa a una clase algo que deba saber: una fecha, un material, un cambio. Lo ven sus estudiantes en Inicio y en la materia.</p>}
      {list.slice(0, 6).map((a) => (
        <article key={a.id} className={a.pinned ? "an-item pinned" : "an-item"}>
          <div className="an-top">
            <strong>{a.pinned && <Icon name="flag" size={14} strokeWidth={2.6} />} {a.title}</strong>
            <span className="caption">{whenText(a.created_at)}</span>
          </div>
          {a.body && <p className="an-body">{a.body}</p>}
          <div className="an-foot">
            <span className="an-to">{a.courseIds.map((id) => <span key={id} className="an-chip" style={{ "--c": areaColor(areaOf(classes.find((c) => c.id === id)) ?? "") }}>{name(id)}</span>)}</span>
            <span className="an-actions">
              <button type="button" className="link" onClick={() => act(() => api.updateAnnouncements(a.ids, { pinned: !a.pinned }))}>{a.pinned ? "Desfijar" : "Fijar"}</button>
              <button type="button" className="link danger" onClick={async () => { if (await confirmDialog(`¿Borrar «${a.title}»? Sus estudiantes dejan de verlo.`, { confirmLabel: "Borrar", danger: true })) act(() => api.deleteAnnouncements(a.ids)); }}>Borrar</button>
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}

function Composer({ classes, profile, onCancel, onPost }) {
  const [to, setTo] = useState(() => (classes.length === 1 ? [classes[0].id] : []));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setTo((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const ready = to.length > 0 && title.trim().length > 0;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    await onPost({ courseIds: to, title: title.trim().slice(0, 120), body: body.trim().slice(0, 2000), pinned, expiresAt: until ? new Date(`${until}T23:59:59`).toISOString() : null, authorName: profile?.full_name ?? "" });
    setBusy(false);
  };
  return (
    <form className="an-form" onSubmit={submit}>
      <div className="an-field">
        <span className="label">Para</span>
        <div className="chips" role="group" aria-label="Clases">
          {classes.map((c) => <button key={c.id} type="button" role="checkbox" aria-checked={to.includes(c.id)} className={to.includes(c.id) ? "chip on" : "chip"} onClick={() => toggle(c.id)}>{to.includes(c.id) ? "✓ " : ""}{classLabel(c)}</button>)}
          {classes.length > 1 && <button type="button" className="chip ghost" onClick={() => setTo(to.length === classes.length ? [] : classes.map((c) => c.id))}>{to.length === classes.length ? "Ninguna" : "Todas"}</button>}
        </div>
      </div>
      <label className="an-field"><span className="label">Título</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ej.: Simulacro el viernes" /></label>
      <label className="an-field"><span className="label">Mensaje <span className="caption">(opcional)</span></span><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Qué deben saber o traer" /></label>
      <div className="an-row">
        <label className="check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fijar arriba</label>
        <span className="an-until"><span className="caption">Visible hasta</span><DateField value={until} onChange={setUntil} min={today()} placeholder="Sin fecha" aria-label="Visible hasta" /></span>
      </div>
      <div className="an-row end">
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary" disabled={!ready || busy}>{busy ? "Publicando…" : to.length > 1 ? `Publicar en ${to.length} clases` : "Publicar"}</button>
      </div>
    </form>
  );
}

// Student: the class notices, newest first, pinned on top. rows: activeAnnouncements(...). subjectOf(courseId) names
// the subject (on Inicio, where notices of every subject meet).
export function StudentAnnouncements({ rows, subjectOf = null, limit = 4, title = "Anuncios" }) {
  const [all, setAll] = useState(false);
  if (!rows?.length) return null;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <section className="card sh-card an-card">
      <div className="section-head"><span className="label">{title}</span><span className="caption">{rows.length}</span></div>
      {shown.map((a) => {
        const s = subjectOf?.(a.course_id);
        return (
          <article key={a.id} className={a.pinned ? "an-item pinned" : "an-item"} style={s?.color ? { "--c": s.color } : undefined}>
            <div className="an-top">
              <strong>{a.pinned && <Icon name="flag" size={14} strokeWidth={2.6} />} {a.title}</strong>
              <span className="caption">{whenText(a.created_at)}</span>
            </div>
            {a.body && <p className="an-body">{a.body}</p>}
            <span className="caption an-by">{s ? <span className="an-chip">{s.name}</span> : null}{a.author_name ? `${a.author_name}` : ""}</span>
          </article>
        );
      })}
      {rows.length > limit && <button type="button" className="link" onClick={() => setAll(!all)}>{all ? "Ver menos" : `Ver los ${rows.length}`}</button>}
    </section>
  );
}
