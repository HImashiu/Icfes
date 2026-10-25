import { bodyBlocks } from "../lib/lesson.js";

// Dark or light text on the teacher's color, whichever reads better.
export function inkOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return "#fff";
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111611" : "#ffffff";
}
const today = () => new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

// The cover slide the teacher designs (lib/lesson.js introOf). Used full screen in the projection and small, as a
// live preview, in the lesson editor and on the lesson cards.
export default function LessonCover({ intro, count = 0, preview = false }) {
  const { layout, title, subtitle, by, goals, color, image } = intro;
  const goalList = bodyBlocks(goals).flatMap((b) => (b.type === "ul" ? b.items : [b.text]));
  const meta = [intro.date ? today() : "", intro.count && count ? `${count} ${count === 1 ? "pregunta" : "preguntas"}` : ""].filter(Boolean).join(" · ");
  const style = { "--cv": color, "--cv-ink": inkOn(color), ...(layout === "image" && image ? { "--cv-img": `url(${image})` } : {}) };
  return (
    <div className={`lc lc-${layout}${preview ? " lc-preview" : ""}${layout === "image" && !image ? " lc-noimg" : ""}`} style={style} aria-label={`Portada: ${title}`}>
      {layout === "split" ? (
        <>
          <div className="lc-panel">
            {by && <span className="lc-by">{by}</span>}
            <h1 className="lc-title">{title}</h1>
            {subtitle && <p className="lc-sub">{subtitle}</p>}
            {meta && <span className="lc-meta">{meta}</span>}
          </div>
          <div className="lc-goals">
            {goalList.length > 0 ? (
              <>
                <span className="lc-goals-head">Hoy vamos a</span>
                <ul>{goalList.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </>
            ) : <span className="lc-goals-head lc-faint">Escribe los objetivos de la clase</span>}
          </div>
        </>
      ) : (
        <div className="lc-body">
          {by && layout !== "minimal" && <span className="lc-by">{by}</span>}
          <h1 className="lc-title">{title}</h1>
          {subtitle && layout !== "minimal" && <p className="lc-sub">{subtitle}</p>}
          {goalList.length > 0 && layout !== "minimal" && <ul className="lc-inline-goals">{goalList.map((g, i) => <li key={i}>{g}</li>)}</ul>}
          {meta && layout !== "minimal" && <span className="lc-meta">{meta}</span>}
        </div>
      )}
    </div>
  );
}
