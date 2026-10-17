import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Mascot from "../components/Mascot.jsx";
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

/* ---------- Slides ---------- */

function Cover() {
  return (
    <div className="pz-cover">
      <div className="pz-cover-text">
        <Rise className="pz-brand"><span className="pz-logo-dot" />{APP_NAME}</Rise>
        <Rise as="h1" className="pz-hero" d={0.08}>
          Preparación <span className="accent-text">Saber 11</span> para todo tu colegio
        </Rise>
        <Rise as="p" className="pz-lead" d={0.16}>
          Práctica con preguntas reales del ICFES, explicaciones con IA y un panel para docentes y coordinación.
        </Rise>
        <Rise className="pz-pills" d={0.24}>
          <span className="pill"><Icon name="book" size={18} className="accent-ico" /> Estudiantes</span>
          <span className="pill"><Icon name="pencil" size={18} className="accent-ico" /> Docentes</span>
          <span className="pill"><Icon name="school" size={18} className="accent-ico" /> Coordinación</span>
        </Rise>
      </div>
      <div className="pz-cover-art pz-pop">
        <div className="pz-halo" />
        <Mascot size={420} idle />
      </div>
    </div>
  );
}

function Problem() {
  const items = [
    { icon: "clock", title: "Poco tiempo para preparar", text: "Armar, imprimir y calificar un simulacro le quita días a cada docente." },
    { icon: "chart", title: "Resultados tarde", text: "El colegio se entera de cómo le fue a cada curso cuando ya no hay tiempo de reforzar." },
    { icon: "flame", title: "Motivación que se apaga", text: "Practicar solo con fotocopias es aburrido y nadie ve su avance." },
  ];
  return (
    <div className="pz-pad">
      <Kicker icon="flag">El reto</Kicker>
      <Title>El Saber 11 define becas y admisiones, pero prepararlo bien cuesta mucho</Title>
      <div className="pz-grid3">
        {items.map((it, i) => (
          <Rise key={it.title} className="card pz-card" d={0.15 + i * 0.08}>
            <span className="pz-ico"><Icon name={it.icon} size={34} /></span>
            <strong className="pz-card-title">{it.title}</strong>
            <p className="pz-card-text">{it.text}</p>
          </Rise>
        ))}
      </div>
    </div>
  );
}

function WhatIs() {
  const cols = [
    { icon: "book", who: "Estudiantes", lines: ["Practican desde el celular o el computador", "Explicación de cada respuesta", "Racha y XP para volver cada día"] },
    { icon: "pencil", who: "Docentes", lines: ["Asignan tareas y simulacros en minutos", "Juego en vivo en clase", "Simulacros en papel calificados con fotos"] },
    { icon: "school", who: "Coordinación", lines: ["Panel de todo el colegio por área", "Alertas de quién se está quedando", "Informes para las familias"] },
  ];
  return (
    <div className="pz-pad">
      <Kicker icon="bolt">Qué es {APP_NAME}</Kicker>
      <Title>Una sola plataforma para quien practica, quien enseña y quien dirige</Title>
      <div className="pz-grid3">
        {cols.map((c, i) => (
          <Rise key={c.who} className="card pz-card" d={0.15 + i * 0.1}>
            <span className="pz-ico"><Icon name={c.icon} size={34} /></span>
            <strong className="pz-card-title">{c.who}</strong>
            <ul className="pz-checks">
              {c.lines.map((l) => <li key={l}><Icon name="check" size={20} />{l}</li>)}
            </ul>
          </Rise>
        ))}
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
        <Title>Preguntas reales del ICFES, como en el examen</Title>
        <Rise as="ul" className="pz-checks big" d={0.15}>
          <li><Icon name="check" size={24} />Cuadernillos oficiales publicados, con sus textos, gráficas y tablas</li>
          <li><Icon name="check" size={24} />Por área o examen completo, en práctica o con tiempo</li>
          <li><Icon name="check" size={24} />Corrección al instante, con sonido y celebración</li>
          <li><Icon name="check" size={24} />Cada pregunta dice su fuente: ICFES, Saber 11. Practicar es gratis</li>
        </Rise>
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
        <Title>Cada error se vuelve una lección</Title>
        <Rise as="ul" className="pz-checks big" d={0.15}>
          <li><Icon name="check" size={24} />Una pista antes de responder, si el docente la permite</li>
          <li><Icon name="check" size={24} />Por qué la correcta es correcta</li>
          <li><Icon name="check" size={24} />Por qué cada opción equivocada engaña</li>
          <li><Icon name="check" size={24} />Competencia, tema y dificultad de cada pregunta</li>
        </Rise>
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
        <Title>Ganas de volver, sin rankings entre compañeros</Title>
        <Rise as="p" className="pz-lead" d={0.15}>
          Cada estudiante compite consigo mismo: racha de días, XP y metas semanales. No hay tablas de posiciones que
          dejen a nadie de último.
        </Rise>
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
        <Title>Una tarea lista en tres clics</Title>
        <Rise as="ul" className="pz-checks big" d={0.15}>
          <li><Icon name="check" size={24} />Filtra por área, competencia y dificultad</li>
          <li><Icon name="check" size={24} />Decide si hay pistas y si se corrige al instante o al final</li>
          <li><Icon name="check" size={24} />Escribe tus propias preguntas y mézclalas con las del ICFES</li>
          <li><Icon name="check" size={24} />Fecha de entrega, intentos y avance en vivo</li>
        </Rise>
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
        <Title>La clase entera responde desde el celular</Title>
        <Rise as="p" className="pz-lead" d={0.15}>
          El docente proyecta la pregunta, los estudiantes entran con un código y al cerrar cada pregunta se ve qué
          eligió el curso. Sin puntajes públicos: lo que se celebra es el acierto del grupo.
        </Rise>
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
        <Title>Saber por qué fallan, y darle a cada uno lo que necesita</Title>
        <Rise as="ul" className="pz-checks big" d={0.15}>
          <li><Icon name="check" size={24} />Las preguntas más falladas, con la opción trampa que más eligieron</li>
          <li><Icon name="check" size={24} />Refuerzo personal: un set distinto para cada estudiante</li>
          <li><Icon name="check" size={24} />Armado con sus errores y sus dos competencias más débiles</li>
        </Rise>
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
        <Title>Las familias ven el avance, sin crear cuentas</Title>
        <Rise as="p" className="pz-lead" d={0.15}>
          Un clic y el docente comparte por WhatsApp un informe claro: cómo va por área, en qué es fuerte y qué practicar
          esta semana. El enlace vence y el colegio puede retirarlo.
        </Rise>
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
  const items = [
    { icon: "school", t: "Ingreso con Google del colegio", s: "Cada estudiante entra con su correo institucional. Sin contraseñas nuevas." },
    { icon: "users", t: "Cursos en minutos", s: "Pega la lista o sube un CSV con nombre, apellidos y correo." },
    { icon: "shield", t: "Datos protegidos", s: "Consentimiento de datos de menores y acceso solo para el colegio." },
    { icon: "user", t: "Roles claros", s: "Estudiante, docente y coordinación ven solo lo que les corresponde." },
  ];
  return (
    <div className="pz-pad">
      <Kicker icon="shield">Cuentas del colegio</Kicker>
      <Title>Fácil de empezar, seguro para los estudiantes</Title>
      <div className="pz-grid2">
        {items.map((it, i) => (
          <Rise key={it.t} className="card pz-card row" d={0.15 + i * 0.08}>
            <span className="pz-ico"><Icon name={it.icon} size={34} /></span>
            <div><strong className="pz-card-title">{it.t}</strong><p className="pz-card-text">{it.s}</p></div>
          </Rise>
        ))}
      </div>
    </div>
  );
}

function Model() {
  const paid = ["Panel del colegio y de cada curso", "Asignaciones, juego en vivo y simulacros en papel", "Explicaciones, pistas y refuerzo personal", "Preguntas limpias, gráficas nítidas y claves de respuesta", "Acompañamiento para arrancar"];
  return (
    <div className="pz-pad">
      <Kicker icon="bolt">Modelo</Kicker>
      <Title>Las preguntas son gratis. El colegio paga por la plataforma</Title>
      <div className="pz-model">
        <Rise className="card pz-free" d={0.15}>
          <span className="label">Siempre gratis</span>
          <strong className="pz-card-title">Preguntas del ICFES</strong>
          <p className="pz-card-text">Son un recurso público. En {APP_NAME} cada una lleva su fuente: “ICFES, Saber 11”.</p>
        </Rise>
        <Rise className="card pz-paid" d={0.25}>
          <span className="label accent-text">Licencia del colegio</span>
          <strong className="pz-card-title">Todo el trabajo detrás</strong>
          <ul className="pz-checks">
            {paid.map((p) => <li key={p}><Icon name="check" size={20} />{p}</li>)}
          </ul>
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
  const steps = ["Creamos las cuentas del colegio", "Cargamos los cursos de grado 11", "Primer simulacro en la app o en papel", "Revisamos juntos el primer informe"];
  return (
    <div className="pz-cover">
      <div className="pz-cover-text">
        <Kicker icon="arrow">Cómo empezamos</Kicker>
        <Rise as="h2" className="pz-hero small" d={0.05}>Un piloto con un curso, <span className="accent-text">esta misma semana</span></Rise>
        <ol className="pz-start">
          {steps.map((s, i) => (
            <Rise as="li" key={s} d={0.15 + i * 0.08}><span className="pz-step-n">{i + 1}</span>{s}</Rise>
          ))}
        </ol>
        <Rise d={0.5}><span className="primary pz-cta">Probemos {APP_NAME} en tu colegio <Icon name="arrow" size={22} /></span></Rise>
      </div>
      <div className="pz-cover-art pz-pop" ref={ref}>
        <div className="pz-halo" />
        <Mascot size={400} pose="celebrating" />
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
          <span className="pz-foot-brand"><Mascot size={36} /> {APP_NAME} · Saber 11</span>
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
