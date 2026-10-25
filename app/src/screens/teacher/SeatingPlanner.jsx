import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../components/Icon.jsx";
import Picker from "../../components/Picker.jsx";
import SeatingChart from "../../components/SeatingChart.jsx";
import {
  MAX_VERSIONS, MIN_VERSIONS, apartViolations, deleteRoom, generatePlan, loadRooms, planMatches, reusePlan, saveRoom, sameVersionNeighbours,
  swapSeats, versionCounts, versionLabel,
} from "../../lib/seating.js";

const inRoom = (blocked, rows, cols) => blocked.filter((s) => { const [r, c] = s.split(",").map(Number); return r < rows && c < cols; });
const STEPS = [["salon", "Salón"], ["reglas", "Versiones"], ["puestos", "Puestos"]];

// The paper page shows the seating plan as one short card; the plan itself is built in a three-step dialog.
export function SeatingCard({ plan, roster, onOpen, onPrint }) {
  const counts = plan ? versionCounts(plan) : null;
  return (
    <section className="card spl-card">
      <span className="pg-ico" aria-hidden="true"><Icon name="grid" size={22} /></span>
      <span className="spl-card-text">
        <strong>Plano del salón <span className="caption">· opcional</span></strong>
        {plan ? (
          <span className="caption">{plan.rows} filas × {plan.cols} puestos · {roster.length} estudiantes · {counts.filter(Boolean).length} versiones ({counts.map((n, v) => (n ? `${versionLabel(v)} ${n}` : null)).filter(Boolean).join(", ")})</span>
        ) : (
          <span className="caption">Reparte versiones del cuadernillo (las mismas preguntas en otro orden) para que nadie tenga al lado a alguien con su misma versión.</span>
        )}
      </span>
      <span className="spl-card-actions">
        {plan && <button type="button" className="secondary" onClick={onPrint}><Icon name="print" size={16} /> Imprimir plano</button>}
        <button type="button" className={plan ? "secondary" : "primary"} disabled={roster.length === 0} onClick={onOpen}>{plan ? "Editar plano" : "Armar plano"}</button>
      </span>
    </section>
  );
}

// Plano del salón in three steps: 1 the room (rows, seats per row, gaps; saved rooms), 2 versions and pairs to keep
// apart, 3 the seats (deal, swap two students, deal again, print).
export function SeatingWizard({ api, roster, plan, savePlan, onClose, onPrint, siblings, loadSibling }) {
  const live = plan && planMatches(plan, roster.map((m) => m.id)) ? plan : null;
  const [step, setStep] = useState(live ? "puestos" : "salon");
  const [cols, setCols] = useState(plan?.cols ?? 6);
  const [rows, setRows] = useState(plan?.rows ?? Math.min(12, Math.max(5, Math.ceil(roster.length / 6))));
  const [versions, setVersions] = useState(plan?.versions ?? MIN_VERSIONS);
  const [blocked, setBlocked] = useState(plan?.blocked ?? []);
  const [apart, setApart] = useState(plan?.apart ?? []);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(null);
  const [rooms, setRooms] = useState(loadRooms);
  const [shared, setShared] = useState(false); // rooms come from the school (migration 0019) instead of this browser
  const [roomName, setRoomName] = useState("");
  const [roomOn, setRoomOn] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve(api?.seatingRooms?.()).then((list) => {
      if (!alive || !Array.isArray(list)) return;
      // Rooms kept in this browser before the migration ran are offered too, and go up to the school when saved again.
      const names = new Set(list.map((r) => r.name));
      setRooms([...list, ...loadRooms().filter((r) => !names.has(r.name))]);
      setShared(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, [api]);
  useEffect(() => {
    document.body.classList.add("spl-open");
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.classList.remove("spl-open"); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const names = useMemo(() => Object.fromEntries(roster.map((m) => [m.id, m.full_name || m.email])), [roster]);
  const gaps = inRoom(blocked, rows, cols);
  const seatsLeft = rows * cols - gaps.length;
  const short = seatsLeft < roster.length;
  // The room on screen differs from the one the plan was dealt in: dealing again is needed.
  const changed = live && (live.rows !== rows || live.cols !== cols || live.versions !== versions || inRoom(live.blocked, rows, cols).sort().join() !== [...gaps].sort().join()
    || JSON.stringify(live.apart ?? []) !== JSON.stringify(apart));
  const clash = live ? apartViolations(live).length : 0;
  const counts = live ? versionCounts(live) : null;

  const deal = (keepOrder = true) => {
    setError("");
    try {
      savePlan(generatePlan({ rows, cols, blocked: gaps, versions, studentIds: roster.map((m) => m.id), apart, orderSeed: keepOrder && live ? live.orderSeed : undefined }));
      setPicked(null);
      setStep("puestos");
    } catch (e) {
      setError(e.message);
    }
  };
  const tapSeat = (id) => {
    if (!live || !(id in live.seatVersion)) return;
    if (picked == null) { if (live.seats[id]) setPicked(id); return; }
    if (picked !== id) savePlan(swapSeats(live, picked, id));
    setPicked(null);
  };
  const toggleGap = (id) => setBlocked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const useRoom = (r) => { setRows(r.rows); setCols(r.cols); setBlocked(r.blocked); setRoomOn(r.name); setRoomName(r.name); };
  const keepRoom = () => {
    const name = roomName.trim();
    if (!name) return;
    const room = { name, rows, cols, blocked: gaps };
    setRooms(shared ? [...rooms.filter((r) => r.name !== name), room].sort((x, y) => x.name.localeCompare(y.name, "es")) : saveRoom(room));
    if (shared) api.saveSeatingRoom(room).catch(() => saveRoom(room));
    setRoomOn(name);
  };
  const forgetRoom = (name) => {
    const left = deleteRoom(name);
    setRooms(shared ? rooms.filter((r) => r.name !== name) : left);
    if (shared) api.deleteSeatingRoom(name).catch(() => {});
    if (roomOn === name) setRoomOn(null);
  };
  const reuse = async (id) => {
    const found = await loadSibling(id);
    if (!found) { setError("Esa actividad todavía no tiene plano."); return; }
    if (!planMatches(found, roster.map((m) => m.id))) { setError("Ese plano es de otra lista de estudiantes. Reparte uno nuevo."); return; }
    setError("");
    const next = reusePlan(found);
    setRows(next.rows); setCols(next.cols); setBlocked(next.blocked); setVersions(next.versions); setApart(next.apart ?? []);
    savePlan(next);
    setStep("puestos");
  };
  const addPair = () => {
    if (!a || !b || a === b || apart.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
    setApart((cur) => [...cur, [a, b]]);
    setA(""); setB("");
  };
  const memberOptions = roster.map((m) => ({ value: m.id, label: names[m.id] }));
  const at = STEPS.findIndex(([id]) => id === step);

  const stepper = (label, value, set, min, max) => (
    <div className="spl-stepper"><span className="label">{label}</span>
      <span className="spl-stepper-ctl">
        <button type="button" className="b-btn" aria-label={`Menos ${label.toLowerCase()}`} disabled={value <= min} onClick={() => set(value - 1)}>−</button>
        <b aria-live="polite">{value}</b>
        <button type="button" className="b-btn" aria-label={`Más ${label.toLowerCase()}`} disabled={value >= max} onClick={() => set(value + 1)}>+</button>
      </span></div>
  );

  return createPortal(
    <div className="spl" role="dialog" aria-modal="true" aria-label="Plano del salón">
      <div className="spl-box">
        <header className="spl-head">
          <strong>Plano del salón</strong>
          <ol className="spl-steps" aria-label="Pasos">
            {STEPS.map(([id, label], i) => (
              <li key={id}><button type="button" className={step === id ? "on" : i < at ? "done" : ""} aria-current={step === id ? "step" : undefined} disabled={id === "puestos" && !live} onClick={() => setStep(id)}>
                <b>{i < at ? <Icon name="check" size={12} strokeWidth={3.4} /> : i + 1}</b>{label}</button></li>
            ))}
          </ol>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={20} /></button>
        </header>

        <div className="spl-body">
          {step === "salon" && (
            <>
              <p className="caption">¿Cómo está el salón? Toca un puesto para quitarlo (pasillo, columna, silla dañada). El tablero está arriba.</p>
              {rooms.length > 0 && (
                <div className="spl-rooms" role="group" aria-label="Salones guardados">
                  {rooms.map((r) => (
                    <span key={r.name} className={roomOn === r.name ? "chip on" : "chip"}>
                      <button type="button" className="link" onClick={() => useRoom(r)}>{r.name} <span className="muted">{r.rows}×{r.cols}</span></button>
                      <button type="button" className="link" aria-label={`Borrar el salón ${r.name}`} onClick={() => forgetRoom(r.name)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="spl-config">
                {stepper("Filas", rows, setRows, 1, 12)}
                {stepper("Puestos por fila", cols, setCols, 1, 12)}
                <span className={short ? "chip seat-short" : "chip"}><strong>{seatsLeft}</strong> puestos · <strong>{roster.length}</strong> estudiantes</span>
                {short && <button type="button" className="secondary" onClick={() => setRows(Math.min(12, Math.ceil((roster.length + gaps.filter((s) => Number(s.split(",")[1]) < cols).length) / cols)))}>Faltan {roster.length - seatsLeft}: agregar filas</button>}
              </div>
              <SeatingChart rows={rows} cols={cols} blocked={blocked} names={names} onToggle={toggleGap} />
              <div className="spl-save">
                <input type="text" aria-label="Nombre del salón" placeholder="Nombre del salón (ej. Aula 201)" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                <button type="button" className="secondary" disabled={!roomName.trim()} onClick={keepRoom}>{rooms.some((r) => r.name === roomName.trim()) ? "Actualizar salón" : "Guardar salón"}</button>
                <span className="caption">{shared ? "Los salones guardados los ven todos los docentes del colegio." : "Los salones se guardan en este navegador."}</span>
              </div>
            </>
          )}

          {step === "reglas" && (
            <>
              <div className="field"><span className="label">Versiones del cuadernillo</span>
                <div className="segmented small" role="radiogroup" aria-label="Versiones">
                  {Array.from({ length: MAX_VERSIONS - MIN_VERSIONS + 1 }, (_, i) => MIN_VERSIONS + i).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={versions === n} className={versions === n ? "seg active" : "seg"} onClick={() => setVersions(n)}>{n} versiones</button>
                  ))}
                </div>
                <span className="caption">Todas las versiones tienen las mismas preguntas; cambia el orden dentro de cada área. Con {versions} versiones nadie tiene al lado, adelante, atrás ni en diagonal a alguien con la suya. Imprimes {versions} cuadernillos distintos y cada hoja de respuestas dice qué versión le toca.</span>
              </div>
              <div className="field"><span className="label">Mantener separados</span>
                <span className="caption">Parejas que no deben quedar cerca (se ayudan, se distraen).</span>
                <div className="seat-apart">
                  <Picker label="Primer estudiante" value={a} onChange={setA} placeholder="Estudiante…" options={memberOptions} />
                  <Picker label="Segundo estudiante" value={b} onChange={setB} placeholder="Estudiante…" options={memberOptions} />
                  <button type="button" className="secondary" disabled={!a || !b || a === b} onClick={addPair}>Añadir pareja</button>
                </div>
                {apart.length > 0 && <div className="seat-apart">{apart.map(([x, y]) => <span className="chip" key={`${x}${y}`}>{names[x] ?? "?"} y {names[y] ?? "?"}<button type="button" className="link" aria-label="Quitar pareja" onClick={() => setApart((cur) => cur.filter((p) => p[0] !== x || p[1] !== y))}>×</button></span>)}</div>}
              </div>
              {siblings.length > 0 && (
                <div className="field"><span className="label">O usa el plano de otra actividad</span>
                  <Picker label="Usar el plano de otra actividad" value="" onChange={reuse} placeholder="Elegir actividad…" options={siblings.map((s) => ({ value: s.id, label: s.title }))} />
                  <span className="caption">Mismos puestos; el orden de las preguntas cambia para que no sirva lo memorizado.</span></div>
              )}
            </>
          )}

          {step === "puestos" && live && (
            <>
              {changed && <p className="notice">Cambiaste el salón o las reglas. <button type="button" className="link" onClick={() => deal(true)}>Repartir de nuevo</button> para aplicarlo.</p>}
              <p className="caption">{picked ? `Toca el puesto al que va ${names[live.seats[picked]] ?? ""} (si está ocupado, se intercambian).` : "Para mover a alguien, tócalo y luego toca su nuevo puesto. Al cambiar de puesto cambia de versión: reimprime su hoja."}</p>
              <div className="spl-legend">{counts.map((n, v) => (n ? <span key={v} className={`spl-key v${v}`}><b>{versionLabel(v)}</b>{n} copias</span> : null))}</div>
              <SeatingChart rows={live.rows} cols={live.cols} blocked={live.blocked} seatVersion={live.seatVersion} seats={live.seats} names={names} onToggle={tapSeat} picked={picked} />
              {clash > 0 && <p className="notice error">{clash === 1 ? "Una pareja quedó" : `${clash} parejas quedaron`} cerca porque el salón no deja más opciones. Reparte de nuevo o agranda el salón.</p>}
              {!sameVersionNeighbours(live).length && <p className="caption spl-ok"><Icon name="check" size={14} strokeWidth={3.4} /> Revisado: ningún puesto vecino comparte versión.</p>}
              <p className="caption">Después imprime los cuadernillos y las hojas: cada hoja lleva la versión y el puesto del estudiante.</p>
            </>
          )}
          {error && <p className="notice error">{error}</p>}
        </div>

        <footer className="spl-foot">
          {at > 0 ? <button type="button" className="secondary" onClick={() => setStep(STEPS[at - 1][0])}>Atrás</button> : <span />}
          <span className="spl-foot-right">
            {step === "salon" && <button type="button" className="primary" onClick={() => setStep("reglas")}>Siguiente: versiones</button>}
            {step === "reglas" && <button type="button" className="primary" disabled={short} onClick={() => (live && !changed ? setStep("puestos") : deal(true))}>{live && !changed ? "Siguiente: puestos" : "Repartir puestos"}</button>}
            {step === "puestos" && (
              <>
                <button type="button" className="secondary" onClick={() => deal(true)}>Mezclar de nuevo</button>
                <button type="button" className="secondary" onClick={onPrint}><Icon name="print" size={16} /> Imprimir plano</button>
                <button type="button" className="primary" onClick={onClose}>Listo</button>
              </>
            )}
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
