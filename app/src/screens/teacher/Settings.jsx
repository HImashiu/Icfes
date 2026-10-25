import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { DateField, confirmDialog } from "../../components/Controls.jsx";
import { CONSENT_VERSION, GUARDIAN_TEXT, hasGuardianAuth } from "../../lib/consent.js";
import { GRADES, gradeLabel } from "../../lib/spaces.js";
import { ACCESS_LABEL, ROLE_LABEL, accessOf, grantText } from "../../lib/colegio.js";
import { areaColor } from "../../lib/brand.js";
import { areaOf, classLabel } from "../../lib/teaching.js";
import "./colegio.css";

const YEAR = new Date().getFullYear();
// Domains anyone can sign up for: fine for a test school, never for a real one.
const PUBLIC_MAIL = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "live.com", "icloud.com"]);
// Four terms is the usual Colombian calendar; the school edits names and dates.
export const DEFAULT_PERIODS = [1, 2, 3, 4].map((n) => ({ name: `Periodo ${n}`, from: "", to: "" }));

function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? "aj-switch on" : "aj-switch"} onClick={() => onChange(!on)} />;
}

// Colegio › Ajustes: the school (name, year, grades it teaches, academic periods), how teachers get in and what
// they may do, and the guardians' authorization. Each change is saved at once and written to the log.
export function SchoolSettings({ api, profile, settings, school, guard, setNotice, reload, log }) {
  const s = settings ?? {};
  const [name, setName] = useState(school?.name ?? "");
  const [code, setCode] = useState(null);
  const [consents, setConsents] = useState(null);
  const [ok, setOk] = useState(false);
  const [periods, setPeriods] = useState(s.periods?.length ? s.periods : DEFAULT_PERIODS);
  const [year, setYear] = useState(String(s.year ?? YEAR));
  useEffect(() => { setName(school?.name ?? ""); }, [school?.name]);
  useEffect(() => { setPeriods(settings?.periods?.length ? settings.periods : DEFAULT_PERIODS); setYear(String(settings?.year ?? YEAR)); }, [settings]);
  useEffect(() => { guard(async () => { setCode(await api.teacherCode()); setConsents(await api.schoolConsents()); }); }, [api, guard]);
  const missing = settings === null;
  const grades = s.grades?.length ? s.grades.map(String) : GRADES;
  const periodsDirty = JSON.stringify(periods) !== JSON.stringify(s.periods?.length ? s.periods : DEFAULT_PERIODS) || year !== String(s.year ?? YEAR);

  const save = (patch, what) => guard(async () => {
    await api.saveSchoolSettings(profile.school_id, { ...s, ...patch });
    await log("settings", { what });
    setNotice("Ajustes guardados.");
    await reload();
  });
  const rename = () => guard(async () => { await api.updateSchoolName(name.trim()); setNotice("Nombre del colegio actualizado."); await reload(); });
  const regenerate = async () => {
    if (!(await confirmDialog("¿Generar un código nuevo? El actual deja de funcionar; quienes ya entraron no se ven afectados.", { confirmLabel: "Generar código nuevo" }))) return;
    guard(async () => { setCode(await api.regenerateTeacherCode()); setNotice("Código nuevo listo. Compártelo solo con docentes."); });
  };
  const toggleGrade = (g) => {
    const next = grades.includes(g) ? grades.filter((x) => x !== g) : [...grades, g].sort((a, b) => Number(a) - Number(b));
    if (next.length) save({ grades: next }, "grados");
  };
  const record = () => guard(async () => {
    await api.recordSchoolConsent(profile.school_id, profile.id, "guardian_authorization", CONSENT_VERSION);
    setConsents(await api.schoolConsents());
    setNotice("Quedó registrada la autorización de acudientes del colegio.");
  });
  const recorded = hasGuardianAuth(consents);
  const grantedAt = (consents ?? []).find((c) => c.kind === "guardian_authorization" && c.version === CONSENT_VERSION)?.granted_at;
  const when = grantedAt ? new Date(grantedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : null;
  const setPeriod = (i, patch) => setPeriods(periods.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  return (
    <>
      {missing && <p className="notice">Para guardar estos ajustes falta ejecutar la migración 0020 en Supabase. Mientras tanto se muestran los valores de siempre.</p>}
      <div className="aj-grid">
        <section className="card t-card">
          <h2>Colegio</h2>
          <label className="aj-field">
            <span>Nombre</span>
            <span className="aj-inline">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Escribe el nombre del colegio" aria-label="Nombre del colegio" />
              <button type="button" className={name.trim() && name.trim() !== school?.name ? "primary" : "secondary"} disabled={!name.trim() || name.trim() === school?.name} onClick={rename}>Guardar</button>
            </span>
            {!school?.name && <span className="caption">Todavía sin nombre. Aparece en los reportes, los cuadernillos impresos y la invitación a docentes.</span>}
          </label>
          {school?.domains?.length > 0 && (
            <div className="aj-field">
              <span>Quién entra al colegio</span>
              <div className="cg-chips">{school.domains.map((d) => <span key={d} className={PUBLIC_MAIL.has(d.toLowerCase()) ? "cg-badge warn" : "cg-badge edit"}>@{d}</span>)}</div>
              {school.domains.some((d) => PUBLIC_MAIL.has(d.toLowerCase()))
                ? <span className="caption aj-warn">@{school.domains.find((d) => PUBLIC_MAIL.has(d.toLowerCase()))} es un correo público: cualquier persona con esa cuenta que entre queda en este colegio como estudiante. Sirve para pruebas; el colegio real usa su propio dominio (por ejemplo @micolegio.edu.co).</span>
                : <span className="caption">Todo el que entra con un correo {school.domains.map((d) => `@${d}`).join(" o ")} queda en este colegio como estudiante. Los docentes con otro correo entran por invitación (Docentes › Invitar).</span>}
            </div>
          )}
          <div className="aj-field">
            <span>Grados que tiene el colegio</span>
            <div className="cg-chips" role="group" aria-label="Grados que tiene el colegio">
              {GRADES.map((g) => {
                const on = grades.includes(g);
                return (
                  <button key={g} type="button" className={on ? "cg-chip aj-grade on" : "cg-chip aj-grade"} aria-pressed={on} disabled={missing || (on && grades.length === 1)} onClick={() => toggleGrade(g)}>
                    {on ? <Icon name="check" size={14} strokeWidth={3.2} /> : <Icon name="plus" size={14} strokeWidth={2.6} />}{gradeLabel(g)}
                  </button>
                );
              })}
            </div>
            <span className="caption">Marcados: {grades.map(gradeLabel).join(", ")}. Solo estos se ofrecen al crear cursos y en los filtros. Toca un grado para agregarlo o quitarlo.</span>
          </div>
        </section>

        <section className="card t-card">
          <h2>Año y periodos</h2>
          <label className="aj-field">
            <span>Año lectivo</span>
            <input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-label="Año lectivo" />
          </label>
          <div className="aj-field">
            <span>Periodos académicos</span>
            {periods.map((p, i) => (
              <div key={i} className="aj-period">
                <input value={p.name} onChange={(e) => setPeriod(i, { name: e.target.value })} aria-label={`Nombre del periodo ${i + 1}`} />
                <DateField value={p.from} onChange={(v) => setPeriod(i, { from: v })} placeholder="Desde" aria-label={`Inicio de ${p.name}`} />
                <DateField value={p.to} min={p.from || undefined} onChange={(v) => setPeriod(i, { to: v })} placeholder="Hasta" aria-label={`Fin de ${p.name}`} />
                <button type="button" className="cm-x" aria-label={`Quitar ${p.name}`} onClick={() => setPeriods(periods.filter((_, k) => k !== i))}><Icon name="x" size={12} strokeWidth={3} /></button>
              </div>
            ))}
            <div className="cg-row">
              {periods.length < 6 && <button type="button" className="link" onClick={() => setPeriods([...periods, { name: `Periodo ${periods.length + 1}`, from: "", to: "" }])}>+ Agregar periodo</button>}
              <span style={{ flex: 1 }} />
              <button type="button" className="primary" disabled={!periodsDirty || missing || !/^\d{4}$/.test(year)} onClick={() => save({ periods: periods.filter((p) => p.name.trim()), year: Number(year) }, "año y periodos")}>Guardar</button>
            </div>
            <span className="caption">Sirven para leer resultados y notas por periodo.</span>
          </div>
        </section>

        <section className="card t-card">
          <h2>Docentes</h2>
          <div className="aj-field">
            <span>Código de docente</span>
            <strong className="aj-code">{code ?? "…"}</strong>
            <span className="caption">Lo escribe un docente nuevo la primera vez que entra. Es más fácil invitarlos por correo (Docentes › Invitar). No lo compartas con estudiantes.</span>
            <div className="cg-row">
              <button type="button" className="secondary" disabled={!code} onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice("Código copiado."); } catch { /* blocked */ } }}>Copiar</button>
              <button type="button" className="link" onClick={regenerate}>Generar uno nuevo</button>
            </div>
          </div>
          <div className="aj-toggle">
            <span><strong>Los docentes pueden crear sus propias clases</strong><span className="caption">Si lo apagas, solo coordinación crea cursos y clases en Cursos y materias.</span></span>
            <Switch on={s.teachers_create_classes !== false} label="Los docentes pueden crear clases" onChange={(v) => !missing && save({ teachers_create_classes: v }, v ? "docentes crean clases" : "solo coordinación crea clases")} />
          </div>
          <div className="aj-toggle">
            <span><strong>Un co-docente agregado desde la lista de la clase entra como «Solo ve»</strong><span className="caption">Útil para practicantes o jefes de área. Siempre puedes cambiarlo por clase.</span></span>
            <Switch on={s.coteacher_access === "view"} label="Co-docentes solo ven" onChange={(v) => !missing && save({ coteacher_access: v ? "view" : "edit" }, "permiso de co-docentes")} />
          </div>
        </section>

        <section className="card t-card">
          <h2>Autorización de acudientes</h2>
          {recorded ? (
            <div className="aj-status ok">
              <Icon name="check" size={18} strokeWidth={3} />
              <span><strong>Registrada{when ? ` el ${when}` : ""}</strong><span className="caption">El colegio declaró que tiene la autorización de los acudientes para que sus estudiantes usen la plataforma. Además, cada estudiante acepta los términos de uso la primera vez que entra.</span></span>
            </div>
          ) : (
            <>
              <div className="aj-status">
                <Icon name="flag" size={18} />
                <span><strong>Falta registrarla</strong><span className="caption">Antes de que entren estudiantes, el colegio declara que los acudientes lo autorizaron.</span></span>
              </div>
              <p className="cg-help">{GUARDIAN_TEXT}</p>
              <label className="b-check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Lo declaro en nombre del colegio</label>
              <div className="report-actions"><button type="button" className="primary" disabled={!ok || consents === null} onClick={record}>Registrar</button></div>
            </>
          )}
          <span className="cg-badge warn aj-draft">Texto legal en borrador ({CONSENT_VERSION}): revisarlo con un abogado antes de usarlo con estudiantes reales</span>
        </section>
      </div>
    </>
  );
}

// Mi cuenta, for every teacher: name, role, and exactly what they can edit and only see.
export function MyAccount({ api, profile, courses, members, grants, guard, setNotice, onExit }) {
  const [name, setName] = useState(profile.full_name ?? "");
  const access = useMemo(() => accessOf(profile, { courses, members, grants: grants ?? [] }), [profile, courses, members, grants]);
  const admin = profile.role === "school_admin";
  const mine = (grants ?? []).filter((g) => g.profile_id === profile.id);
  const save = () => guard(async () => { await api.updateMyName(profile.id, name.trim()); setNotice("Nombre guardado. Se verá así la próxima vez que entres."); });
  return (
    <div className="aj-grid">
      <section className="card t-card">
        <h2>Mi cuenta</h2>
        <label className="aj-field">
          <span>Nombre que ven estudiantes y colegas</span>
          <span className="aj-inline">
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Tu nombre" />
            <button type="button" className="secondary" disabled={!name.trim() || name.trim() === profile.full_name} onClick={save}>Guardar</button>
          </span>
        </label>
        <div className="aj-field"><span>Correo</span><span>{profile.email}</span></div>
        <div className="aj-field"><span>Rol</span><span>{ROLE_LABEL[profile.role] ?? profile.role}{admin ? " · ves y editas todo el colegio" : ""}</span></div>
        <div className="cg-row"><button type="button" className="secondary" onClick={onExit}>Ir a la app de estudiante</button></div>
      </section>
      <section className="card t-card">
        <h2>Mis permisos</h2>
        {admin ? <p className="cg-help">Como coordinación editas todas las clases.</p> : (
          <div className="aj-mine">
            {access.length === 0 && <p className="cg-empty">Todavía no tienes clases. Coordinación te las asigna en Colegio › Cursos y materias.</p>}
            {access.map((a) => {
              const ar = areaOf(a.course);
              return (
                <div key={a.course.id} className="st-class">
                  <span className="cg-dot" style={{ background: ar ? areaColor(ar) : "var(--accent)" }} />
                  <span><strong>{classLabel(a.course)}</strong></span>
                  <span className={`cg-badge ${a.access}`}>{ACCESS_LABEL[a.access]}</span>
                </div>
              );
            })}
            {mine.map((g) => <span key={g.id} className="caption">Permiso por materia: {grantText(g)} · {ACCESS_LABEL[g.access]}</span>)}
          </div>
        )}
        <p className="cg-help">«Solo ve» deja revisar actividades y resultados sin cambiarlos. Para pedir más acceso, habla con coordinación.</p>
      </section>
    </div>
  );
}
