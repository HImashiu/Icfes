import { useMemo } from "react";
import { renderRich } from "../lib/render.js";

// Renders exam HTML (with math and figure slots) as text, never as raw markup.
export default function RichText({ html, className }) {
  const safe = useMemo(() => renderRich(html), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
