import { useState } from "react";
import Icon from "./Icon.jsx";
import Saber11Report from "./Saber11Report.jsx";
import CountUp from "./CountUp.jsx";
import { areaColor } from "../lib/brand.js";
import { nextSession } from "../lib/simulacro.js";
import { areaShort } from "../lib/teaching.js";

const date = (t) => new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(" de ", " ");
const AREA_ORDER = ["Lectura crítica", "Matemáticas", "Sociales y ciudadanas", "Ciencias naturales", "Inglés"];
const ordered = (areas) => [...areas].sort((a, b) => AREA_ORDER.indexOf(a.name) - AREA_ORDER.indexOf(b.name));

// The estimated Saber 11 score: 0-500 global and 0-100 per area, only from a complete simulacro (Sesión 1 + Sesión 2
// of one cuadernillo). A simulacro with one session done shows what is missing and a partial view per area.
// summary: scoreSummary(history). Always labelled as an estimate (item parameters estimated, preliminary key).
export default function ScoreCard({ summary, target, exams = [], onStartSession, compact = false }) {
  const { latest, open, trend } = summary;
  const prev = trend.length > 1 ? trend[trend.length - 2].global : null;
  const next = nextSession(open, exams) ?? (!latest ? firstSession(exams) : null);
  const [report, setReport] = useState(false);
  return (
    <div className={compact ? "card score-card compact" : "card score-card"}>
      <div className="score-main">
        <div className="score-head">
          <span className="label">{latest ? `Tu último simulacro completo · ${latest.code}` : "Puntaje Saber 11 por simulacro"}</span>
          {latest ? (
            <>
              <span className="score-big"><CountUp value={latest.global} format={(n) => String(Math.round(n))} delay={200} /><small>/500</small></span>
              <span className="caption">Solo de este simulacro: Sesión 1 ({date(latest.s1.at)}) + Sesión 2 ({date(latest.s2.at)}) de {latest.code}, primer intento · rango probable {latest.low}–{latest.high}</span>
              <span className="score-tags">
                {latest.percentile != null && <span className="score-tag">Percentil {latest.percentile} del país</span>}
                {target ? <span className={latest.global >= target ? "score-tag ok" : "score-tag"}>{latest.global >= target ? `Meta ${target} alcanzada en este simulacro` : `Faltan ${target - latest.global} para tu meta de ${target}`}</span> : null}
                {prev != null && <span className={latest.global >= prev ? "score-tag ok" : "score-tag bad"}>{latest.global >= prev ? "▲" : "▼"} {Math.abs(latest.global - prev)} vs. tu simulacro anterior</span>}
              </span>
            </>
          ) : (
            <>
              <span className="score-big muted">—<small>/500</small></span>
              <span className="caption">El puntaje se calcula con el examen completo: Sesión 1 y Sesión 2 del mismo cuadernillo, como el día del Saber 11.</span>
            </>
          )}
        </div>
        {(latest?.areas ?? open?.areas ?? []).length > 0 && (
          <div className="score-areas">
            {ordered(latest ? latest.areas : open.areas).map((a) => (
              <span key={a.name} className="score-area" style={{ "--c": areaColor(a.name) }}>
                <b>{a.scale}</b><span className="caption">{areaShort(a.name)}</span>
                <span className="score-bar"><span style={{ width: `${a.scale}%` }} /></span>
                {latest && a.level && <span className="score-level">{a.level.label}</span>}
              </span>
            ))}
          </div>
        )}
        {latest && !compact && (
          <button type="button" className="secondary small score-report-btn" onClick={() => setReport((v) => !v)} aria-expanded={report}>
            {report ? "Ocultar el reporte por prueba" : "Ver el reporte como el del ICFES"}
          </button>
        )}
        {latest && report && <Saber11Report sim={latest} showGlobal={false} />}
        {!latest && open && <span className="caption score-partial">Puntajes por área parciales: solo con la Sesión {open.s1 ? 1 : 2}.</span>}
      </div>
      {(open || !latest) && (
        <div className="score-steps">
          <span className="label">{open ? `Simulacro ${open.code} en curso` : "Tu primer simulacro completo"}</span>
          <span className={open?.s1 ? "score-step done" : "score-step"}><Icon name={open?.s1 ? "check" : "clock"} size={16} strokeWidth={3} /> Sesión 1{open?.s1 ? ` · ${date(open.s1.at)}` : ""}</span>
          <span className={open?.s2 ? "score-step done" : "score-step"}><Icon name={open?.s2 ? "check" : "clock"} size={16} strokeWidth={3} /> Sesión 2{open?.s2 ? ` · ${date(open.s2.at)}` : ""}</span>
          {next && onStartSession && <button type="button" className="primary small" onClick={() => onStartSession(next.slug)}>Hacer Sesión {next.n} de {next.code}</button>}
        </div>
      )}
      {!compact && <span className="caption score-note">Calculado como el ICFES (pesos, niveles y percentiles oficiales); la dificultad de las preguntas y la clave son estimadas: orienta, no es el puntaje oficial.</span>}
    </div>
  );
}

function firstSession(exams) {
  const e = exams.find((x) => /_1ra$/.test(x.slug) && x.status !== "proximamente");
  return e ? { code: e.slug.replace(/_1ra$/, ""), n: 1, slug: e.slug } : null;
}
