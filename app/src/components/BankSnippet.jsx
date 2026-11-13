import { useMemo } from "react";
import { renderRich } from "../lib/render.js";

// A short piece of a question for a list row, with its formulas and bold drawn (never raw "$\frac{3}{5}$").
// `text` comes from bank.js snippet(); the row's CSS clamps it to a few lines.
export default function BankSnippet({ text, className = "b-text" }) {
  const html = useMemo(() => renderRich(text || ""), [text]);
  if (!text) return null;
  return <span className={`bq-rich ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
