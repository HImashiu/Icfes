import { useMemo } from "react";
import { drawFigure } from "../lib/figures.js";
import Zoomable from "./Zoomable.jsx";

// Draws a native figure from its spec. Figures without a valid spec are never shown as scan crops:
// they show a labelled "pending" placeholder until they are drawn (figures rule: no crops in the app).
// `inOption` keeps a tap on the figure selecting its answer option; the figure then opens only from "Ampliar".
export default function FigureBlock({ figure, alt, inOption = false }) {
  const drawn = useMemo(() => {
    if (!figure.spec) return null;
    try {
      return drawFigure(figure.spec);
    } catch {
      return null;
    }
  }, [figure]);

  if (drawn) {
    return (
      <Zoomable html={drawn} alt={alt} hintOnly={inOption}>
        <div className="figure native" data-kind={figure.kind} dangerouslySetInnerHTML={{ __html: drawn }} />
      </Zoomable>
    );
  }
  return <span className="figure-slot">Figura pendiente de dibujar{alt ? `: ${alt}` : ""}</span>;
}
