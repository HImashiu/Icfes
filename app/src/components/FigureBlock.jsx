import { useMemo } from "react";
import { drawFigure } from "../lib/figures.js";

// Draws a native figure from its spec. Image figures show their crop by src. When there is no valid spec,
// shows the original crop (if it was copied into the app) or a labelled placeholder with the figure's alt text.
export default function FigureBlock({ figure, alt }) {
  const drawn = useMemo(() => {
    if (!figure.spec) return null;
    try {
      return drawFigure(figure.spec);
    } catch {
      return null;
    }
  }, [figure]);

  if (drawn) {
    return <div className="figure native" data-kind={figure.kind} dangerouslySetInnerHTML={{ __html: drawn }} />;
  }
  if (figure.src) {
    // Crops for image figures are published under exams/figures/ (see sync-exams.mjs).
    return (
      <figure className="figure crop">
        <img src={`exams/figures/${figure.src}`} alt={alt || "Figura"} loading="lazy" />
      </figure>
    );
  }
  if (figure.fallbackCrop) {
    return (
      <figure className="figure crop">
        <img src={`exams/${figure.fallbackCrop}`} alt={alt || "Figura"} loading="lazy" />
      </figure>
    );
  }
  return <span className="figure-slot">{alt || "Figura"}</span>;
}
