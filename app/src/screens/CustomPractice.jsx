import { useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import { areaColor } from "../lib/brand.js";
import { DIFFICULTY_LABEL, bankItems } from "../lib/bank.js";
import { COUNTS, ORDERS, PACES, SOURCES, matching, pickKeys, questionHistory } from "../lib/customPractice.js";
import { loadHistory } from "../lib/local.js";
import { bookletCode, sessionOf } from "../lib/booklets.js";
import "./study.css";

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// Práctica a medida: el estudiante arma su ronda con las áreas, competencias y dificultad que quiere, de dónde salen
// las preguntas (todas, nunca respondidas, las que falló, las que marcó), cuántas, en qué orden y con qué ritmo.
export default function CustomPractice({ bundle, slug, onStart, onBack, preset = null }) {
  const items = useMemo(() => bankItems(bundle.exam, { enrich: bundle.enrich, key: bundle.key, notes: bundle.notes }), [bundle]);
  const qh = useMemo(() => questionHistory(loadHistory(), slug), [slug]);
  const [f, setF] = useState(() => ({ areas: preset?.area ? [preset.area] : [], competencias: [], difficulty: [], source: preset?.source ?? "all", count: 10, order: "booklet" }));
  const [pace, setPace] = useState("free");
  const [allComp, setAllComp] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const tagged = items.some((it) => it.competencia);

  const areas = useMemo(() => [...new Set(items.map((it) => it.section))], [items]);
  const inAreas = (it) => !f.areas.length || f.areas.includes(it.section);
  const competencias = useMemo(() => {
    const m = new Map();
    for (const it of items.filter(inAreas)) if (it.competencia) m.set(it.competencia, (m.get(it.competencia) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items, f.areas]); // eslint-disable-line react-hooks/exhaustive-deps
  const pool = useMemo(() => matching(items, f, qh), [items, f, qh]);
  const sourceCount = (id) => matching(items, { ...f, source: id }, qh).length;
  const keys = useMemo(() => pickKeys(pool, { count: f.count, order: f.order, seed: 7 }), [pool, f.count, f.order]);
  const label = f.source === "missed" ? "Las que fallé" : f.source === "flagged" ? "Las que marqué" : f.areas.length === 1 ? `A medida · ${f.areas[0]}` : "Práctica a medida";
  const p = PACES.find((x) => x.id === pace);

  const start = () => {
    const picked = pickKeys(pool, { count: f.count, order: f.order, seed: Date.now() });
    onStart(picked, { label, mode: pace === "free" ? "practice" : "timed", perQuestionSec: pace === "fast" ? 60 : null });
  };

  return (
    <section className="setup cp">
      <header className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver"><Icon name="left" /></button>
        <h1>Práctica a medida</h1>
      </header>
      <p className="caption">Cuadernillo {bookletCode(slug)} · Sesión {sessionOf(slug)}. Elige qué quieres practicar; las preguntas que comparten un texto salen juntas.</p>

      <div className="card cp-block">
        <span className="label">Áreas</span>
        <div className="chips-row">
          {areas.map((a) => (
            <button key={a} type="button" aria-pressed={f.areas.includes(a)} className={f.areas.includes(a) ? "chip on" : "chip"} onClick={() => set({ areas: toggle(f.areas, a), competencias: [] })}>
              <span className="dot" style={{ background: areaColor(a) }} />{a} <span className="muted">{items.filter((it) => it.section === a).length}</span>
            </button>
          ))}
        </div>
      </div>

      {tagged && competencias.length > 0 && (
        <div className="card cp-block">
          <span className="label">Competencias</span>
          <div className="chips-row">
            {(allComp ? competencias : competencias.filter(([c], i) => i < 5 || f.competencias.includes(c))).map(([c, n]) => (
              <button key={c} type="button" aria-pressed={f.competencias.includes(c)} className={f.competencias.includes(c) ? "chip on" : "chip"} onClick={() => set({ competencias: toggle(f.competencias, c) })}>
                {c} <span className="muted">{n}</span>
              </button>
            ))}
            {competencias.length > 5 && <button type="button" className="link" onClick={() => setAllComp((v) => !v)}>{allComp ? "Ver menos" : `Ver las ${competencias.length}`}</button>}
          </div>
        </div>
      )}

      {tagged && (
        <div className="card cp-block">
          <span className="label">Dificultad</span>
          <div className="chips-row">
            {[1, 2, 3, 4, 5].map((d) => (
              <button key={d} type="button" aria-pressed={f.difficulty.includes(d)} className={f.difficulty.includes(d) ? "chip on" : "chip"} onClick={() => set({ difficulty: toggle(f.difficulty, d) })}>
                <span className="cp-diff" aria-hidden="true">{"●".repeat(d)}</span>{DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
          <span className="caption">Dificultad estimada con IA a partir del tipo de pregunta; es una guía, no la del ICFES.</span>
        </div>
      )}

      <div className="card cp-block">
        <span className="label">De dónde salen</span>
        <div className="cp-sources" role="radiogroup" aria-label="De dónde salen las preguntas">
          {SOURCES.map((s) => {
            const n = sourceCount(s.id);
            return (
              <button key={s.id} type="button" role="radio" aria-checked={f.source === s.id} className={f.source === s.id ? "cp-source on" : "cp-source"} onClick={() => set({ source: s.id })}>
                <b>{n}</b><span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card cp-block cp-two">
        <div>
          <span className="label">Cuántas</span>
          <div className="chips-row">
            {COUNTS.map((n) => <button key={n} type="button" aria-pressed={f.count === n} className={f.count === n ? "chip on" : "chip"} onClick={() => set({ count: n })}>{n || "Todas"}</button>)}
          </div>
        </div>
        <div>
          <span className="label">Orden</span>
          <div className="chips-row">
            {ORDERS.map((o) => <button key={o.id} type="button" aria-pressed={f.order === o.id} className={f.order === o.id ? "chip on" : "chip"} onClick={() => set({ order: o.id })}>{o.label}</button>)}
          </div>
        </div>
      </div>

      <div className="mode-cards cp-paces" role="radiogroup" aria-label="Ritmo">
        {PACES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={pace === x.id} className={pace === x.id ? "mode-card on" : "mode-card"} onClick={() => setPace(x.id)}>
            <Icon name={x.id === "free" ? "bolt" : "clock"} />
            <strong>{x.label}</strong>
            <span className="caption">{x.help}</span>
          </button>
        ))}
      </div>

      <div className="sticky-cta">
        <button type="button" className="primary big" disabled={keys.length === 0} onClick={start}>
          {keys.length === 0 ? "Ninguna pregunta coincide" : `Empezar · ${keys.length} ${keys.length === 1 ? "pregunta" : "preguntas"}`}
        </button>
        <span className="caption">{pool.length} coinciden · {p.label}{pace === "fast" ? ` · ${keys.length} min` : ""}</span>
      </div>
    </section>
  );
}
