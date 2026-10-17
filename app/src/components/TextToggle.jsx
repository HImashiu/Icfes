// On a phone, a long text and its question take turns on the screen: two tabs under the top bar switch between them,
// so each one gets the whole screen. `view` is "text" or "question"; `bodyRef` receives the node the question
// portals the text into (it stays mounted while hidden).
export default function TextToggle({ view, onView, number, bodyRef }) {
  const showText = view === "text";
  return (
    <>
      <div className="text-toggle" role="tablist" aria-label="Ver texto o pregunta">
        <button type="button" role="tab" aria-selected={showText} className={showText ? "seg active" : "seg"} onClick={() => onView("text")}>
          Texto
        </button>
        <button type="button" role="tab" aria-selected={!showText} className={showText ? "seg" : "seg active"} onClick={() => onView("question")}>
          Pregunta {number}
        </button>
      </div>
      <div className="toggle-text paper-card" hidden={!showText} role="tabpanel" aria-label="Texto de la pregunta">
        <div ref={bodyRef} />
        <button type="button" className="primary big to-question" onClick={() => onView("question")}>
          Ir a la pregunta {number}
        </button>
      </div>
    </>
  );
}
