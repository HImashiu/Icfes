// The panel a long text is drawn in on a phone: it stays under the top bar and scrolls by itself.
// `state` is "open", "tall" or "min"; `bodyRef` receives the node the question portals the text into.
export default function TextDock({ state, onState, bodyRef }) {
  return (
    <div className={`text-dock ${state}`} role="region" aria-label="Texto de la pregunta">
      <div className="dock-body" ref={bodyRef} />
      <div className="dock-bar">
        <strong>{state === "min" ? "Texto oculto" : "Texto"}</strong>
        <span className="dock-actions">
          {state !== "min" && (
            <button type="button" className="link" onClick={() => onState(state === "tall" ? "open" : "tall")}>
              {state === "tall" ? "Reducir" : "Ampliar"}
            </button>
          )}
          <button type="button" className="link" onClick={() => onState(state === "min" ? "open" : "min")} aria-expanded={state !== "min"}>
            {state === "min" ? "Ver texto" : "Ocultar"}
          </button>
        </span>
      </div>
    </div>
  );
}
