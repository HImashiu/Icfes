import Mascot from "./Mascot.jsx";

// Every «Cargando…» in the landing's language: the owl, the label in the display type and a moving bar.
// page: a whole screen (sign-in, opening a cuadernillo). Otherwise a slim row inside a section.
export default function Loading({ label = "Cargando", page = false, note }) {
  const text = String(label).replace(/…$/, "");
  if (page) {
    return (
      <div className="frame cx-load-page" role="status" aria-live="polite">
        <Mascot pose="normal" size={104} idle />
        <strong className="cx-mega cx-load-title">{text}</strong>
        <span className="cx-load-bar" aria-hidden="true"><i /></span>
        {note && <span className="caption">{note}</span>}
      </div>
    );
  }
  return (
    <div className="cx-load" role="status" aria-live="polite">
      <Mascot pose="normal" size={34} idle />
      <span className="cx-load-text"><b>{text}</b><span className="cx-load-bar" aria-hidden="true"><i /></span></span>
    </div>
  );
}
