import { useState } from "react";
import { loadHistory } from "../../lib/local.js";
import { answerSurvey, snoozeSurvey, submitTestimonial, surveyDone, surveySnoozed } from "../../lib/growth/app.js";
import "./growth.css";

// One short question at a time on Inicio, never on the first day (docs/growth/LEDGER.md):
//   F44 ¿Cómo nos conociste? (from the 2nd practice)   F43 NPS 0-10 (from the 3rd)
//   F31 a testimonial invitation after a 9 or 10        F45 Van Westendorp price questions (from the 6th, once)
const CANAL = [["amigo", "Un amigo"], ["profe", "Un profe o el colegio"], ["google", "Google"], ["tiktok", "TikTok"], ["instagram", "Instagram"], ["whatsapp", "WhatsApp"], ["youtube", "YouTube"], ["otro", "Otro"]];

function nextSurvey(sessions) {
  if (sessions >= 2 && !surveyDone("canal") && !surveySnoozed("canal")) return "canal";
  if (sessions >= 3 && !surveyDone("nps") && !surveySnoozed("nps")) return "nps";
  if (sessions >= 6 && !surveyDone("precio") && !surveySnoozed("precio")) return "precio";
  return null;
}

export default function GrowthSurvey({ profile }) {
  const [which, setWhich] = useState(() => nextSurvey(loadHistory().length));
  const [score, setScore] = useState(null);
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState({ muy_barato: "", barato: "", caro: "", muy_caro: "" });
  const [story, setStory] = useState("");
  const [done, setDone] = useState("");
  if (!which && !done) return null;
  const finish = (text, next = null) => { setDone(text); setWhich(next); };
  const later = () => { snoozeSurvey(which); setWhich(null); };

  if (done && !which) return <div className="card sp-card"><span className="caption" role="status">{done}</span></div>;

  return (
    <div className="card sp-card gr-survey">
      {which === "canal" && (
        <>
          <b>¿Cómo conociste Cóndor?</b>
          <div className="chips" style={{ marginTop: 8 }}>
            {CANAL.map(([v, l]) => <button key={v} type="button" className="chip" onClick={() => answerSurvey("canal", { c: v }).then(() => finish("¡Gracias!"), () => finish(""))}>{l}</button>)}
          </div>
        </>
      )}
      {which === "nps" && (
        <>
          <b>¿Qué tan probable es que le recomiendes Cóndor a un amigo?</b>
          <div className="gr-scale" role="radiogroup" aria-label="De 0 a 10">
            {Array.from({ length: 11 }, (_, i) => <button key={i} type="button" aria-pressed={score === i} onClick={() => setScore(i)}>{i}</button>)}
          </div>
          {score != null && (
            <>
              <label className="caption">{score >= 9 ? "¿Qué es lo que más te sirve?" : "¿Qué deberíamos mejorar?"}<textarea rows={2} maxLength={400} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <button type="button" className="primary" onClick={() => answerSurvey("nps", { score, reason: reason.trim().slice(0, 400) }).then(() => finish("¡Gracias por contarnos!", score >= 9 && profile ? "historia" : null), () => finish(""))}>Enviar</button>
            </>
          )}
        </>
      )}
      {which === "historia" && (
        <>
          <b>¿Nos dejas contar tu experiencia?</b>
          <span className="caption">Dos líneas sobre cómo te ayuda Cóndor. Saldría con tu primer nombre en la página, si la aprobamos.</span>
          <textarea rows={3} maxLength={400} value={story} onChange={(e) => setStory(e.target.value)} />
          <div className="gr-row">
            <button type="button" className="primary" disabled={story.trim().length < 10} onClick={() => submitTestimonial(String(profile?.full_name ?? "").split(" ")[0] || "Estudiante", "Estudiante de grado 11", story.trim()).then(() => finish("¡Gracias! La revisamos y te avisamos."), () => finish(""))}>Enviar (acepto que la publiquen)</button>
            <button type="button" className="link" onClick={() => finish("")}>Ahora no</button>
          </div>
        </>
      )}
      {which === "precio" && (
        <>
          <b>Una pregunta para planear Cóndor</b>
          <span className="caption">Si existiera un plan con extras (explicaciones paso a paso, simulacros ilimitados), ¿a qué precio al mes, en pesos, te parecería…</span>
          <div className="gr-grid2">
            {[["muy_barato", "tan barato que dudarías de él"], ["barato", "una ganga"], ["caro", "caro, pero lo pensarías"], ["muy_caro", "demasiado caro"]].map(([k, l]) => (
              <label key={k}><span className="caption">{l}</span><input type="number" inputMode="numeric" min={0} step={1000} value={price[k]} onChange={(e) => setPrice({ ...price, [k]: e.target.value })} /></label>
            ))}
          </div>
          <button type="button" className="primary" disabled={Object.values(price).some((v) => v === "")} onClick={() => answerSurvey("precio", Object.fromEntries(Object.entries(price).map(([k, v]) => [k, Number(v)]))).then(() => finish("¡Gracias!"), () => finish(""))}>Enviar</button>
        </>
      )}
      {which !== "historia" && <button type="button" className="link small" onClick={later}>Ahora no</button>}
    </div>
  );
}
