import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Mascot from "../components/Mascot.jsx";
import Logo from "../components/Logo.jsx";
import Icon from "../components/Icon.jsx";
import CountUp from "../components/CountUp.jsx";
import { APP_NAME, MASCOT_NAME, areaColor } from "../lib/brand.js";
import { confetti, play } from "../lib/motion.js";
import "./presentation.css";

// Sales deck for schools, drawn with the app's own pieces (tokens, buttons, cards, options, Cóndi).
// Opens with #presentacion (or #presentacion/5 for a slide). Arrows, space, PageUp/PageDown (clickers),
// Home/End, F for full screen, Esc to leave. Everything shown is sample data written for the deck:
// no exam content lives in this file.

const W = 1600;
const H = 900;

// Runs `steps` (ms after the slide opens) one by one and returns how many have fired.
function useSteps(times) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const ids = times.map((t, i) => setTimeout(() => setN(i + 1), t));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return n;
}

const Rise = ({ d = 0, as: Tag = "div", className = "", children, ...rest }) => (
  <Tag className={`pz-rise ${className}`} style={{ animationDelay: `${d}s` }} {...rest}>{children}</Tag>
);

function Kicker({ icon, children }) {
  return (
    <Rise className="pz-kicker">
      {icon && <Icon name={icon} size={22} />}
      <span>{children}</span>
    </Rise>
  );
}

function Title({ children, d = 0.05 }) {
  return <Rise as="h2" className="pz-title" d={d}>{children}</Rise>;
}

function SampleTag({ children = "Datos de ejemplo" }) {
  return <span className="pz-sample">{children}</span>;
}

// A list in the look of the app's answer options: an icon tile, a bold line and an optional second line.
function Features({ items, d = 0.15, compact = false }) {
  return (
    <ul className={`pz-feats${compact ? " compact" : ""}`}>
      {items.map(([icon, title, sub], i) => (
        <li key={title} className="option pz-feat pz-rise" style={{ animationDelay: `${d + i * 0.08}s` }}>
          <span className="letter-tile"><Icon name={icon} size={compact ? 20 : 24} /></span>
          <span className="pz-feat-body"><strong>{title}</strong>{sub && <span>{sub}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

// Cóndi says the punchline, like the tips on the home screen.
function Tip({ children, d = 0.5 }) {
  return (
    <Rise className="pz-tip" d={d}>
      <Logo size={64} />
      <p className="pz-bubble">{children}</p>
    </Rise>
  );
}

/* ---------- Slides ---------- */

function Cover() {
  return (
    <div className="pz-cover">
      <div className="pz-cover-text">
        <Rise className="pz-brand"><Logo size={56} />{APP_NAME}</Rise>
        <Rise as="h1" className="pz-hero" d={0.08}>
          Preparación <span className="accent-text">Saber 11</span> para todo tu colegio
        </Rise>
        <Rise as="p" className="pz-lead" d={0.16}>
          Preguntas reales del ICFES, explicaciones con IA y un panel para docentes y coordinación.
        </Rise>
        <Rise className="pz-pills" d={0.24}>
          <span className="pill"><Icon name="book" size={20} className="accent-ico" /> Estudiantes</span>
          <span className="pill"><Icon name="pencil" size={20} className="accent-ico" /> Docentes</span>
          <span className="pill"><Icon name="school" size={20} className="accent-ico" /> Coordinación</span>
        </Rise>
      </div>
      <div className="pz-cover-art pz-pop">
        <div className="pz-halo" />
        <Logo size={460} className="pz-bob" />
      </div>
    </div>
  );
}

function Problem() {
  const step = useSteps([900, 1400, 1900]);
  const rows = [
    ["Calificar 40 hojas a mano toma una tarde entera", "Fotos con el celular y queda calificado"],
    ["El colegio ve los resultados cuando ya es tarde", "Panel por curso y por área cada semana"],
    ["Practicar con fotocopias aburre y nadie ve su avance", "Racha, XP y celebración en cada acierto"],
  ];
  return (
    <div className="pz-pad">
      <Kicker icon="flag">El reto</Kicker>
      <Title>El Saber 11 define becas y admisiones, pero <span className="accent-text">prepararlo cuesta mucho</span></Title>
      <div className="pz-vs">
        <Rise className="pz-vs-head" d={0.1}><span className="label">Hoy</span><span className="label accent-text">Con {APP_NAME}</span></Rise>
        {rows.map(([bad, ok], i) => (
          <div key={bad} className="pz-vs-row">
            <Rise className="feedback bad pz-verdict" d={0.15 + i * 0.1}>
              <span className="verdict-ico"><Icon name="x" size={22} /></span>
              <div><strong>{bad}</strong></div>
            </Rise>
            <Icon name="arrow" size={30} className={`pz-vs-arrow${step > i ? " on" : ""}`} />
            {step > i ? (
              <div className="feedback ok pz-verdict pz-pop-fast">
                <span className="verdict-ico"><Icon name="check" size={22} /></span>
                <div><strong>{ok}</strong></div>
              </div>
            ) : <div className="pz-verdict pz-ghost" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatIs() {
  const days = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <div className="pz-pad">
      <Kicker icon="bolt">Qué es {APP_NAME}</Kicker>
      <Title>Una sola app para quien <span className="accent-text">practica</span>, quien <span className="accent-text">enseña</span> y quien <span className="accent-text">dirige</span></Title>
      <div className="pz-roles">
        <Rise className="pz-role" d={0.15}>
          <div className="pz-role-head"><span className="letter-tile"><Icon name="book" size={24} /></span><strong>Estudiantes</strong></div>
          <div className="card streak-card pz-mini">
            <div>
              <span className="label">Racha</span>
              <p className="display"><Icon name="flame" size={28} className="flame-ico" /> 12 días</p>
              <div className="week-row">
                {days.map((d, i) => <span key={i} className={`day ${i < 4 ? "done" : i === 4 ? "today" : "future"}`} style={{ animationDelay: `${0.5 + i * 0.07}s` }}>{d}</span>)}
              </div>
            </div>
          </div>
          <span className="primary pz-mini-btn">Seguir practicando <Icon name="arrow" size={20} /></span>
          <p className="pz-role-sub">Practican en el celular o el computador, con explicación de cada respuesta.</p>
        </Rise>
        <Rise className="pz-role" d={0.25}>
          <div className="pz-role-head"><span className="letter-tile"><Icon name="pencil" size={24} /></span><strong>Docentes</strong></div>
          <div className="card pz-mini">
            <span className="label">Asignaciones</span>
            {[["Matemáticas", "Simulacro · 11-A", 18, 24], ["Lectura crítica", "Tarea · 11-B", 27, 30]].map(([a, t, n, of], i) => (
              <div key={t} className="pz-asg">
                <span className="assign-tile" style={{ background: areaColor(a) }} />
                <div><strong>{a}</strong><span className="caption">{t}</span>
                  <div className="progress thin"><span className="pz-grow" style={{ width: `${(n / of) * 100}%`, animationDelay: `${0.6 + i * 0.15}s` }} /></div>
                </div>
                <span className="pz-asg-n">{n}/{of}</span>
              </div>
            ))}
          </div>
          <span className="secondary pz-mini-btn">Nueva asignación</span>
          <p className="pz-role-sub">Asignan en minutos, juegan en vivo y califican el papel con fotos.</p>
        </Rise>
        <Rise className="pz-role" d={0.35}>
          <div className="pz-role-head"><span className="letter-tile"><Icon name="school" size={24} /></span><strong>Coordinación</strong></div>
          <div className="card pz-mini">
            <span className="label">Resumen del colegio</span>
            {AREAS.slice(0, 3).map(([a, p], i) => (
              <div key={a} className="area-row">
                <div className="area-row-head"><span><span className="dot" style={{ background: areaColor(a) }} />{a}</span><span>{p} %</span></div>
                <div className="progress thin"><span className="pz-grow" style={{ width: `${p}%`, background: areaColor(a), animationDelay: `${0.7 + i * 0.1}s` }} /></div>
              </div>
            ))}
          </div>
          <span className="pz-alert-pill"><Icon name="flag" size={18} /> 3 alertas esta semana</span>
          <p className="pz-role-sub">Ven todo el colegio por área, quién se está quedando y qué reforzar.</p>
        </Rise>
      </div>
    </div>
  );
}

// A sample question (written for this deck) that answers itself: choose B, check, celebrate.
const SAMPLE = {
  stem: "Una papelería vende cuadernos a $3.000 cada uno y regala 2 por cada 10 que se compran. ¿Cuánto paga quien se lleva 24 cuadernos?",
  options: [["A", "$72.000"], ["B", "$60.000"], ["C", "$66.000"], ["D", "$54.000"]],
  correct: "B",
};

function Practice() {
  const step = useSteps([1300, 2300]);
  const ref = useRef(null);
  useEffect(() => {
    if (step === 2) {
      play("correct");
      confetti(ref.current, { count: 34 });
    }
  }, [step]);
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="book">Práctica</Kicker>
        <Title>Preguntas <span className="accent-text">reales</span> del ICFES, como en el examen</Title>
        <Features items={[
          ["book", "Cuadernillos oficiales", "Con sus textos, gráficas y tablas"],
          ["clock", "Por área o completo", "En práctica o con tiempo"],
          ["check", "Corrección al instante", "Con sonido y celebración"],
        ]} />
        <Tip>Cada pregunta dice su fuente: ICFES, Saber 11. ¡Practicar es gratis!</Tip>
      </div>
      <Rise className="pz-device" d={0.2}>
        <div className="paper-card pz-q">
          <span className="card-label">Matemáticas · Pregunta de ejemplo</span>
          <p className="stem">{SAMPLE.stem}</p>
        </div>
        <ul className="options pz-options">
          {SAMPLE.options.map(([l, t], i) => {
            const state = step >= 2 && l === SAMPLE.correct ? "correct" : step >= 1 && l === SAMPLE.correct ? "selected" : "";
            return (
              <li key={l} className="pz-rise" style={{ animationDelay: `${0.3 + i * 0.06}s` }}>
                <div ref={l === SAMPLE.correct ? ref : null} className={`option ${state} ${state === "correct" ? "pz-bounce" : ""}`}>
                  <span className="letter-tile">{l}</span>
                  <span className="option-text">{t}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {step >= 2 && (
          <div className="feedback ok pz-drop">
            <span className="verdict-ico"><Icon name="check" size={22} /></span>
            <div><strong>¡Muy bien!</strong><span>Compra 20, le regalan 4: paga 20 × $3.000. <b className="xp-bump">+10 XP</b></span></div>
          </div>
        )}
      </Rise>
    </div>
  );
}

function Explain() {
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="bulb">Explicaciones con IA</Kicker>
        <Title>Cada error se vuelve una <span className="accent-text">lección</span></Title>
        <Features items={[
          ["bulb", "Pista antes de responder", "Si el docente la permite"],
          ["check", "Por qué la correcta es correcta", "Paso a paso"],
          ["x", "Por qué engaña cada trampa", "Una línea por opción"],
          ["chart", "Competencia y dificultad", "De cada pregunta"],
        ]} />
      </div>
      <div className="pz-stack">
        <Rise className="card pz-hint" d={0.2}>
          <span className="pz-ico small"><Icon name="bulb" size={24} /></span>
          <div><span className="label">Pista</span><p>Primero cuenta cuántos cuadernos paga de verdad.</p></div>
        </Rise>
        <Rise className="card ai-analysis pz-ai" d={0.35}>
          <span className="label">Análisis con IA</span>
          <div className="chips-row">
            <span className="badge">Resolución de problemas</span>
            <span className="badge">Proporciones</span>
            <span className="badge">Dificultad 2/5</span>
          </div>
          <p>De cada 12 cuadernos, paga 10. Con 24 cuadernos paga 20, así que el total es 20 × $3.000 = $60.000.</p>
          <ul className="ai-wrong">
            <li><strong>A.</strong> Cobra los 24 cuadernos y olvida el regalo.</li>
            <li><strong>C.</strong> Descuenta solo 2 cuadernos en lugar de 4.</li>
            <li><strong>D.</strong> Descuenta 6 cuadernos: aplica mal la proporción.</li>
          </ul>
        </Rise>
      </div>
    </div>
  );
}

function Motivation() {
  const days = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="flame">Motivación</Kicker>
        <Title>Ganas de volver, <span className="accent-text">sin rankings</span></Title>
        <Features items={[
          ["flame", "Racha de días", "Volver cada día se nota"],
          ["bolt", "XP y metas semanales", "Cada acierto suma"],
          ["users", "Cada uno contra sí mismo", "Sin tablas de posiciones: nadie queda de último"],
        ]} />
      </div>
      <div className="pz-stack">
        <Rise className="card streak-card pz-streak" d={0.2}>
          <div>
            <span className="label">Racha</span>
            <p className="display"><Icon name="flame" size={34} className="flame-ico" /> <CountUp value={12} delay={400} /> días</p>
            <div className="week-row">
              {days.map((d, i) => <span key={i} className={`day ${i < 5 ? "done" : i === 5 ? "today" : "future"}`} style={{ animationDelay: `${0.5 + i * 0.08}s` }}>{d}</span>)}
            </div>
          </div>
          <Mascot size={150} pose="celebrating" />
        </Rise>
        <Rise className="pz-row" d={0.35}>
          <div className="card pz-stat"><span className="label">XP esta semana</span><strong className="display accent-text"><CountUp value={340} delay={500} /></strong></div>
          <div className="card pz-stat"><span className="label">Preguntas</span><strong className="display"><CountUp value={86} delay={600} /></strong></div>
          <div className="card pz-stat"><span className="label">Meta semanal</span><div className="progress"><span className="pz-grow" style={{ width: "72%" }} /></div><span className="caption">72 %</span></div>
        </Rise>
      </div>
    </div>
  );
}

function Assign() {
  const step = useSteps([900, 1500, 2100]);
  const count = [0, 12, 20, 25][step];
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="pencil">Para docentes</Kicker>
        <Title>Una tarea lista en <span className="accent-text">tres clics</span></Title>
        <Features items={[
          ["map", "Filtra lo que necesitas", "Área, competencia y dificultad"],
          ["bulb", "Tú decides las reglas", "Pistas, corrección al instante o al final"],
          ["pencil", "Tus propias preguntas", "Mézclalas con las del ICFES"],
          ["clock", "Avance en vivo", "Fecha de entrega e intentos"],
        ]} />
      </div>
      <Rise className="card pz-builder" d={0.2}>
        <span className="label">Nueva asignación · 11-A</span>
        <div className="chips">
          {["Matemáticas", "Lectura crítica", "Ciencias naturales"].map((a, i) => (
            <span key={a} className={`chip ${i === 0 || (i === 2 && step >= 2) ? "on" : ""}`}><span className="dot" style={{ background: areaColor(a) }} />{a}</span>
          ))}
        </div>
        <div className="chips">
          {["Dificultad 1–2", "Dificultad 3", "Dificultad 4–5"].map((a, i) => (
            <span key={a} className={`chip ${i === 1 || (i === 2 && step >= 3) ? "on" : ""}`}>{a}</span>
          ))}
        </div>
        <div className="pz-toggles">
          <div className="pz-toggle"><span>Pista</span><span className={`pz-switch ${step >= 1 ? "on" : ""}`} /></div>
          <div className="pz-toggle"><span>Corrección</span><div className="segmented small"><span className="seg active">Inmediata</span><span className="seg">Al final</span></div></div>
        </div>
        <div className="pz-builder-foot">
          <span className="pz-count"><strong className="display">{count}</strong> preguntas elegidas</span>
          <span className="primary">Asignar <Icon name="arrow" size={20} /></span>
        </div>
      </Rise>
    </div>
  );
}

function Live() {
  const step = useSteps([700, 1300, 1900, 2600]);
  const players = ["Sofía", "Mateo", "Valentina", "Samuel", "Isabella", "Tomás", "Mariana", "Juan José", "Luciana", "Emilio", "Antonia", "Gabriel"];
  const dist = [["A", 3], ["B", 19], ["C", 4], ["D", 2]];
  const max = 19;
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="play">Juego en vivo</Kicker>
        <Title>La clase entera responde <span className="accent-text">desde el celular</span></Title>
        <Features items={[
          ["play", "Entran con un código", "El docente proyecta la pregunta"],
          ["chart", "Qué eligió el curso", "Al cerrar cada pregunta"],
          ["users", "Sin puntajes públicos", "Se celebra el acierto del grupo"],
        ]} />
      </div>
      <Rise className="card pz-live" d={0.2}>
        <span className="label">Entra a {APP_NAME}, toca “Juego en vivo” y escribe el código</span>
        <div className="pz-code">{"482 615".split("").map((c, i) => <span key={i} className={c === " " ? "gap" : ""}>{c}</span>)}</div>
        <div className="pz-players">
          {players.slice(0, Math.min(players.length, step * 4)).map((p) => <span key={p} className="pz-player">{p}</span>)}
        </div>
        {step >= 4 && (
          <div className="pz-dist">
            {dist.map(([l, n]) => (
              <div key={l} className={`pz-bar ${l === "B" ? "ok" : ""}`}>
                <strong>{n}</strong>
                <span className="pz-bar-track"><span className="pz-bar-fill" style={{ height: `${(n / max) * 100}%` }} /></span>
                <span className="letter-tile">{l}</span>
              </div>
            ))}
            <p className="pz-dist-note"><Icon name="check" size={22} /> La clase acertó el 68 %</p>
          </div>
        )}
      </Rise>
    </div>
  );
}

function PaperSlide() {
  const step = useSteps([600, 1200, 1800, 2400, 3000]);
  const steps = [
    { icon: "print", t: "Imprime", s: "Cuadernillo y hojas de respuesta con el código de cada estudiante" },
    { icon: "pencil", t: "Aplica", s: "El simulacro en el salón, como el día del examen" },
    { icon: "camera", t: "Fotografía", s: "Las hojas con el celular, varias a la vez" },
    { icon: "chart", t: "Listo", s: "Los resultados entran al panel junto a los de la app" },
  ];
  const bubbles = [1, 3, 0, 2, 1, 1, 3, 2, 0, 1];
  return (
    <div className="pz-pad">
      <Kicker icon="camera">Simulacros en papel</Kicker>
      <Title>¿Sin computadores para todos? El papel también cuenta</Title>
      <div className="pz-paper">
        <div className="pz-steps">
          {steps.map((s, i) => (
            <div key={s.t} className={`card pz-step ${step > i ? "on" : ""}`}>
              <span className="pz-step-n">{step > i ? <Icon name="check" size={22} /> : i + 1}</span>
              <div><strong>{s.t}</strong><span className="caption">{s.s}</span></div>
              <Icon name={s.icon} size={30} className="pz-step-ico" />
            </div>
          ))}
        </div>
        <Rise className="pz-sheet" d={0.2}>
          <i className="mk tl" /><i className="mk tr" /><i className="mk bl" /><i className="mk br" />
          <div className="pz-sheet-head"><strong>Hoja de respuestas</strong><span>Estudiante 0417 · 11-B</span></div>
          {bubbles.map((b, r) => (
            <div key={r} className="pz-sheet-row">
              <span className="n">{r + 1}</span>
              {["A", "B", "C", "D"].map((l, c) => (
                <span key={l} className={`bub ${step >= 2 && c === b ? "fill" : ""}`} style={{ transitionDelay: `${r * 0.06}s` }}>{l}</span>
              ))}
            </div>
          ))}
          {step >= 4 && <div className="pz-scan" />}
          {step >= 5 && <div className="pz-sheet-ok"><Icon name="check" size={22} /> 8 de 10 correctas</div>}
        </Rise>
      </div>
    </div>
  );
}

const AREAS = [["Lectura crítica", 64], ["Matemáticas", 51], ["Sociales y ciudadanas", 58], ["Ciencias naturales", 55], ["Inglés", 70]];

function Dashboard() {
  return (
    <div className="pz-pad">
      <Kicker icon="chart">Panel del colegio</Kicker>
      <Title>Cada curso, cada área, cada semana</Title>
      <div className="pz-dash">
        <div className="pz-kpis">
          <Rise className="card kpi" d={0.15}><span className="label">Estudiantes activos</span><strong className="display"><CountUp value={184} delay={300} /></strong><span className="caption">de 210 en grado 11</span></Rise>
          <Rise className="card kpi" d={0.2}><span className="label">Preguntas esta semana</span><strong className="display"><CountUp value={6420} format={(n) => Math.round(n).toLocaleString("es-CO")} delay={350} /></strong><span className="caption">+18 % que la anterior</span></Rise>
          <Rise className="card kpi" d={0.25}><span className="label">Banda estimada</span><strong className="display accent-text">280–310</strong><span className="caption">Estimación provisional sobre 500</span></Rise>
        </div>
        <Rise className="card pz-areas" d={0.3}>
          <span className="label">Respuestas correctas por área</span>
          {AREAS.map(([a, p], i) => (
            <div key={a} className="area-row">
              <div className="area-row-head"><span><span className="dot" style={{ background: areaColor(a) }} />{a}</span><span>{p} %</span></div>
              <div className="progress"><span className="pz-grow" style={{ width: `${p}%`, background: areaColor(a), animationDelay: `${0.5 + i * 0.1}s` }} /></div>
            </div>
          ))}
        </Rise>
        <Rise className="card pz-alerts" d={0.4}>
          <span className="label">Alertas de la semana</span>
          {[["Laura M.", "11-B", "No practica hace 9 días"], ["Andrés P.", "11-A", "Bajó en Matemáticas"], ["Camila R.", "11-C", "3 tareas sin entregar"]].map(([n, c, w], i) => (
            <div key={n} className="pz-alert pz-rise" style={{ animationDelay: `${0.6 + i * 0.12}s` }}>
              <span className="avatar">{n[0]}</span>
              <div><strong>{n} · {c}</strong><span className="caption">{w}</span></div>
              <Icon name="flag" size={20} className="flame-text" />
            </div>
          ))}
        </Rise>
      </div>
    </div>
  );
}

function Autopsy() {
  const opts = [["A", 14], ["B", 22], ["C", 51], ["D", 13]];
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="map">Autopsia y refuerzo</Kicker>
        <Title>Saber <span className="accent-text">por qué</span> fallan y darle a cada uno lo que necesita</Title>
        <Features items={[
          ["map", "Las más falladas", "Con la opción trampa que más eligieron"],
          ["bolt", "Refuerzo personal", "Un set distinto para cada estudiante"],
          ["chart", "Armado con sus errores", "Y sus dos competencias más débiles"],
        ]} />
      </div>
      <div className="pz-stack">
        <Rise className="card pz-autopsy" d={0.2}>
          <span className="label">Autopsia de la pregunta · 11-A</span>
          <p className="pz-q-mini">Interpretación de una gráfica de barras · Matemáticas</p>
          {opts.map(([l, p], i) => (
            <div key={l} className={`pz-opt-row ${l === "B" ? "ok" : l === "C" ? "trap" : ""}`}>
              <span className="letter-tile">{l}</span>
              <div className="progress"><span className="pz-grow" style={{ width: `${p}%`, animationDelay: `${0.4 + i * 0.1}s` }} /></div>
              <span className="pz-pct">{p} %</span>
            </div>
          ))}
          <p className="caption">La mitad del curso eligió C: leyó el eje como porcentaje y no como cantidad.</p>
        </Rise>
        <Rise className="card pz-reinforce" d={0.4}>
          <span className="pz-ico small"><Icon name="bolt" size={24} /></span>
          <div><strong>Refuerzo de Andrés</strong><span className="caption">12 preguntas · Interpretación de datos · entrega el viernes</span></div>
        </Rise>
      </div>
    </div>
  );
}

function Families() {
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="chat">Familias</Kicker>
        <Title>Las familias ven el avance, <span className="accent-text">sin crear cuentas</span></Title>
        <Features items={[
          ["chat", "Un clic por WhatsApp", "El docente comparte el informe"],
          ["chart", "Cómo va por área", "Y en qué es fuerte"],
          ["bulb", "Qué practicar esta semana", "Un consejo concreto"],
          ["shield", "El enlace vence", "Y el colegio puede retirarlo"],
        ]} />
      </div>
      <Rise className="pz-phone" d={0.2}>
        <div className="pz-phone-screen">
          <span className="caption">Colegio de ejemplo</span>
          <strong className="pz-phone-title">Informe de Valentina</strong>
          <div className="card pz-phone-card">
            <span className="label">Respuestas correctas por área</span>
            {AREAS.slice(0, 4).map(([a, p], i) => (
              <div key={a} className="area-row">
                <div className="area-row-head"><span>{a}</span><span>{p + 6} %</span></div>
                <div className="progress thin"><span className="pz-grow" style={{ width: `${p + 6}%`, background: areaColor(a), animationDelay: `${0.4 + i * 0.1}s` }} /></div>
              </div>
            ))}
          </div>
          <div className="card pz-phone-card">
            <span className="label">Qué practicar esta semana</span>
            <p className="caption">Lectura de tablas y gráficas en Ciencias naturales.</p>
          </div>
        </div>
        <span className="pz-wa pz-pop" style={{ animationDelay: "0.9s" }}><Icon name="chat" size={22} /> Enviar por WhatsApp</span>
      </Rise>
    </div>
  );
}

function Accounts() {
  const step = useSteps([1200, 1500, 1800, 2100, 2400]);
  const roster = ["Ana Gómez", "Bruno Díaz", "Carla Ruiz", "David Mora", "Elena Paz"];
  return (
    <div className="pz-split">
      <div className="pz-split-text">
        <Kicker icon="shield">Cuentas del colegio</Kicker>
        <Title>Fácil de empezar, <span className="accent-text">seguro</span> para los estudiantes</Title>
        <Features items={[
          ["school", "Ingreso con Google del colegio", "El correo institucional, sin contraseñas nuevas"],
          ["users", "Cursos en minutos", "Pega la lista o sube un CSV"],
          ["shield", "Datos protegidos", "Consentimiento de menores y acceso solo del colegio"],
          ["user", "Roles claros", "Cada quien ve solo lo suyo"],
        ]} />
      </div>
      <div className="pz-stack">
        <Rise className="card pz-login" d={0.2}>
          <Logo size={72} />
          <strong className="pz-login-title">Usa la cuenta de tu colegio</strong>
          <span className="caption">Con tu cuenta ves las tareas de tu curso y tu docente ve cómo vas.</span>
          <span className={`primary pz-google${step >= 1 ? " pressed" : ""}`}><span className="pz-g">G</span> Continuar con Google</span>
        </Rise>
        <Rise className="card pz-roster" d={0.35}>
          <div className="card-row"><span className="label">11-A · importado desde CSV</span><span className="badge ok">{Math.max(0, step - 1) * 8} estudiantes</span></div>
          <div className="pz-roster-list">
            {roster.slice(0, Math.max(0, step)).map((n) => (
              <span key={n} className="pz-person"><span className="avatar">{n[0]}</span>{n}</span>
            ))}
          </div>
        </Rise>
      </div>
    </div>
  );
}

function Model() {
  return (
    <div className="pz-pad">
      <Kicker icon="bolt">Modelo</Kicker>
      <Title>Las preguntas son <span className="accent-text">gratis</span>. El colegio paga por la plataforma</Title>
      <div className="pz-model">
        <Rise className="pz-free" d={0.15}>
          <span className="label">Siempre gratis</span>
          <div className="paper-card pz-q">
            <span className="card-label">Preguntas del ICFES</span>
            <p className="stem">Son un recurso público. Cualquier estudiante puede practicarlas en {APP_NAME} sin pagar.</p>
            <span className="source">Fuente: ICFES, Saber 11</span>
          </div>
        </Rise>
        <Rise className="card pz-paid" d={0.25}>
          <span className="label accent-text">Licencia del colegio</span>
          <strong className="pz-card-title">Todo el trabajo detrás</strong>
          <Features compact d={0.35} items={[
            ["chart", "Panel del colegio y de cada curso"],
            ["pencil", "Asignaciones, juego en vivo y papel"],
            ["bulb", "Explicaciones, pistas y refuerzo personal"],
            ["book", "Preguntas limpias y gráficas nítidas"],
            ["users", "Acompañamiento para arrancar"],
          ]} />
        </Rise>
      </div>
    </div>
  );
}

function Start() {
  const ref = useRef(null);
  useEffect(() => {
    const id = setTimeout(() => { confetti(ref.current, { count: 50, spread: 1.4 }); play("finish"); }, 700);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="pz-cover">
      <div className="pz-cover-text">
        <Kicker icon="arrow">Cómo empezamos</Kicker>
        <Rise as="h2" className="pz-hero small" d={0.05}>Un piloto con un curso, <span className="accent-text">esta misma semana</span></Rise>
        <Features d={0.15} items={[
          ["school", "Creamos las cuentas del colegio"],
          ["users", "Cargamos los cursos de grado 11"],
          ["print", "Primer simulacro en la app o en papel"],
          ["chart", "Revisamos juntos el primer informe"],
        ]} />
        <Rise d={0.5}><span className="primary pz-cta">Probemos {APP_NAME} en tu colegio <Icon name="arrow" size={22} /></span></Rise>
      </div>
      <div className="pz-cover-art pz-pop" ref={ref}>
        <div className="pz-halo" />
        <Logo size={420} className="pz-bob" />
      </div>
    </div>
  );
}

export const SLIDES = [
  { title: "Portada", C: Cover },
  { title: "El reto", C: Problem },
  { title: `Qué es ${APP_NAME}`, C: WhatIs },
  { title: "Práctica", C: Practice },
  { title: "Explicaciones con IA", C: Explain },
  { title: "Motivación", C: Motivation, sample: true },
  { title: "Asignaciones", C: Assign, sample: true },
  { title: "Juego en vivo", C: Live, sample: true },
  { title: "Papel", C: PaperSlide, sample: true },
  { title: "Panel del colegio", C: Dashboard, sample: true },
  { title: "Autopsia y refuerzo", C: Autopsy, sample: true },
  { title: "Familias", C: Families, sample: true },
  { title: "Cuentas", C: Accounts },
  { title: "Modelo", C: Model },
  { title: "Cómo empezamos", C: Start },
];

const slideFromHash = () => {
  const m = /^#presentacion\/(\d+)/.exec(window.location.hash);
  const n = m ? Number(m[1]) - 1 : 0;
  return Math.min(Math.max(n, 0), SLIDES.length - 1);
};

export default function Presentation({ onExit }) {
  const [i, setI] = useState(() => (typeof window === "undefined" ? 0 : slideFromHash()));
  const [dir, setDir] = useState(1);
  const [scale, setScale] = useState(1);
  const [idle, setIdle] = useState(false);
  const deck = useRef(null);

  const go = useCallback((n) => {
    setI((cur) => {
      const next = Math.min(Math.max(n(cur), 0), SLIDES.length - 1);
      if (next !== cur) setDir(next > cur ? 1 : -1);
      return next;
    });
  }, []);

  useEffect(() => {
    try { window.history.replaceState(null, "", `#presentacion/${i + 1}`); } catch { /* sandboxed preview */ }
  }, [i]);

  // The 1600×900 stage scales to fit any screen, from a laptop to a projector.
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else deck.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go((c) => c + 1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go((c) => c - 1); }
      else if (e.key === "Home") go(() => 0);
      else if (e.key === "End") go(() => SLIDES.length - 1);
      else if (e.key === "f" || e.key === "F") fullscreen();
      else if (e.key === "Escape" && !document.fullscreenElement) onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, fullscreen, onExit]);

  // The controls fade away while the presenter does not move the mouse.
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 2500);
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 2500); };
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", wake); window.removeEventListener("touchstart", wake); };
  }, []);

  // Swipe on phones and tablets.
  const touch = useRef(null);
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current === null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 50) go((c) => c + (dx < 0 ? 1 : -1));
  };

  const { C } = SLIDES[i];
  return (
    <div ref={deck} className={`pz-deck${idle ? " idle" : ""}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="pz-progress" aria-hidden="true"><span style={{ width: `${((i + 1) / SLIDES.length) * 100}%` }} /></div>
      <div className="pz-stage" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <section key={i} className={`pz-slide ${dir > 0 ? "fwd" : "back"}`} aria-roledescription="diapositiva" aria-label={`${i + 1} de ${SLIDES.length}: ${SLIDES[i].title}`}>
          <C />
        </section>
        <footer className="pz-foot">
          <span className="pz-foot-brand"><Logo size={36} /> {APP_NAME} · Saber 11</span>
          {SLIDES[i].sample && <SampleTag />}
          <span className="pz-foot-n">{i + 1} / {SLIDES.length}</span>
        </footer>
      </div>
      <div className="pz-controls">
        <button type="button" className="icon-btn" onClick={() => go((c) => c - 1)} disabled={i === 0} aria-label="Anterior"><Icon name="left" size={24} /></button>
        <div className="pz-dots">
          {SLIDES.map((s, n) => (
            <button key={s.title} type="button" className={`pz-dot${n === i ? " on" : ""}`} onClick={() => go(() => n)} aria-label={`Ir a ${s.title}`} />
          ))}
        </div>
        <button type="button" className="icon-btn" onClick={() => go((c) => c + 1)} disabled={i === SLIDES.length - 1} aria-label="Siguiente"><Icon name="right" size={24} /></button>
        <button type="button" className="icon-btn" onClick={fullscreen} aria-label="Pantalla completa (F)" title="Pantalla completa (F)"><Icon name="expand" size={22} /></button>
        {onExit && <button type="button" className="icon-btn" onClick={onExit} aria-label={`Salir a ${APP_NAME}`} title="Salir (Esc)"><Icon name="close" size={22} /></button>}
      </div>
      <p className="pz-rotate">Gira el teléfono para ver la presentación más grande.</p>
      <span className="sr-only" aria-live="polite">{`${MASCOT_NAME}: diapositiva ${i + 1} de ${SLIDES.length}`}</span>
    </div>
  );
}
