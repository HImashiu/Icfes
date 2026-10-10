import { useMemo } from "react";
import { drawFigure } from "../lib/figures.js";

// Draws a native figure from its spec. Figures without a valid spec are never shown as scan crops:
// they show a labelled "pending" placeholder until they are drawn (figures rule: no crops in the app).
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
  return <span className="figure-slot">Figura pendiente de dibujar{alt ? `: ${alt}` : ""}</span>;
}
