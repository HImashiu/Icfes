// Expanded structural formulas as ICFES prints them: a chain of atoms in a row, with what hangs from each atom drawn
// above and below it (every H shown). Written inside math as \mol{...} and turned into a KaTeX array here.
//
//   \mol{H-C(H,H)-C(=O)-OH}              a molecule: atoms joined by - (single), = (double) or # (triple);
//                                         C(top,bottom) hangs atoms above and below, "=O" is a double bond
//   \mol{A "Éster" ->[H^+] B + C "Alcohol"}  a reaction: "label" goes under the molecule before it,
//                                         ->[x] is an arrow with x under it, ->{x} with x over it, <=> equilibrium
//
// Nothing here runs outside \mol{...}, so ordinary math is untouched.

// Bonds in a chain are short text dashes, as in the booklet (math minus signs are long and widely spaced).
const BOND = { "-": "\\text{-}", "=": "\\text{=}", "#": "\\equiv" };
// In a drawn molecule the bond sits in the gap between two atom columns (KaTeX keeps that gap at 1em).
const GAP_BOND = { "-": "\\mathrlap{\\hspace{0.33em}\\text{-}}", "=": "\\mathrlap{\\hspace{0.24em}\\text{=}}", "#": "\\mathrlap{\\hspace{0.11em}\\equiv}" };
const VBOND = { "-": "\\vert", "=": "\\Vert", "#": "\\vert\\!\\vert\\!\\vert" };

// "CH3" -> \mathrm{CH_{3}}; charges written ^+ or ^{2-} stay as superscripts.
function atomTex(label) {
  if (!label) return "";
  const safe = label.replace(/[{}\\$%&#]/g, "");
  return `\\mathrm{${safe.replace(/(\d+)/g, "_{$1}").replace(/_\{(\d+)\}(?=\^)/g, "_{$1}")}}`;
}

// One hanging atom: "H", "=O", "#N".
function hang(spec) {
  const s = (spec || "").trim();
  if (!s) return null;
  const bond = /^[=#]/.test(s) ? s[0] : "-";
  return { bond, atom: s.replace(/^[=#]/, "") };
}

export function parseChain(text) {
  const atoms = [];
  const bonds = [];
  const re = /([A-Za-z0-9^+]+)(?:\(([^()]*)\))?([-=#]?)/y;
  let at = 0;
  while (at < text.length) {
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m || m[0] === "") throw new Error(`no entiendo "${text.slice(at)}"`);
    const [top, bottom] = (m[2] ?? "").split(",");
    atoms.push({ label: m[1], top: hang(top), bottom: hang(bottom) });
    if (m[3]) bonds.push(m[3]);
    at = re.lastIndex;
  }
  if (bonds.length >= atoms.length) throw new Error("la cadena termina en un enlace");
  return { atoms, bonds };
}

export function chainTex(text) {
  const { atoms, bonds } = parseChain(text);
  const hangs = atoms.some((a) => a.top || a.bottom);
  if (!hangs) return atoms.map((a, k) => atomTex(a.label) + (k < bonds.length ? `\\mkern2mu${BOND[bonds[k]]}\\mkern2mu` : "")).join("");
  // One column per atom; what hangs from an atom is centered over and under it.
  const row = (fill) => atoms.map(fill).join(" & ");
  const rows = [
    row((a) => (a.top ? atomTex(a.top.atom) : "")),
    row((a) => (a.top ? VBOND[a.top.bond] : "")),
    row((a, k) => atomTex(a.label) + (k < bonds.length ? GAP_BOND[bonds[k]] : "")),
    row((a) => (a.bottom ? VBOND[a.bottom.bond] : "")),
    row((a) => (a.bottom ? atomTex(a.bottom.atom) : "")),
  ];
  // Rows sit close together, as in the booklet; the chain row stays on the text line's axis.
  return `{\\def\\arraystretch{0.62}\\begin{array}{${"c".repeat(atoms.length)}}${rows.join(" \\\\ ")}\\end{array}}`;
}

const textArg = (s) => s.replace(/[{}\\$%&#_^~]/g, "");
const mathArg = (s) => `\\mathrm{${s.replace(/[{}\\$%&#~]/g, "")}}`;

// The whole \mol{...} body: molecules, labels, arrows and plus signs, left to right, one TeX piece each.
export function molPieces(body) {
  const out = [];
  let i = 0;
  const s = body.trim();
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === '"') {
      const end = s.indexOf('"', i + 1);
      const label = s.slice(i + 1, end < 0 ? s.length : end);
      i = end < 0 ? s.length : end + 1;
      const prev = out.pop() ?? "";
      out.push(`\\underset{\\textbf{${textArg(label)}}}{${prev}}`);
      continue;
    }
    const arrow = /^(->|<=>|<-)/.exec(s.slice(i));
    if (arrow) {
      i += arrow[0].length;
      let below = "", above = "";
      for (;;) {
        const m = /^(\[[^\]]*\]|\{[^}]*\})/.exec(s.slice(i));
        if (!m) break;
        if (m[0][0] === "[") below = m[0].slice(1, -1); else above = m[0].slice(1, -1);
        i += m[0].length;
      }
      const cmd = arrow[0] === "<=>" ? "\\xrightleftharpoons" : arrow[0] === "<-" ? "\\xleftarrow" : "\\xrightarrow";
      out.push(`\\;${cmd}[${below ? mathArg(below) : ""}]{\\hspace{2.2em}${above ? mathArg(above) : ""}\\hspace{2.2em}}\\;`);
      continue;
    }
    if (s[i] === "+" && (i + 1 >= s.length || /\s/.test(s[i + 1]))) { out.push("\\;+\\;"); i++; continue; }
    let j = i;
    while (j < s.length && !/\s/.test(s[j])) j++;
    out.push(chainTex(s.slice(i, j)));
    i = j;
  }
  return out;
}

export const molTex = (body) => molPieces(body).join(" ");

// A $...$ span that is only a reaction (\mol{...} with several pieces) is drawn piece by piece, so a long
// reaction wraps between molecules on a narrow screen instead of shrinking. Returns null otherwise.
export function molParts(tex) {
  const m = /^\\mol\{([\s\S]*)\}$/.exec(tex.trim());
  if (!m || m[1].includes("\\mol{")) return null;
  try {
    const pieces = molPieces(m[1]);
    return pieces.length > 1 ? pieces : null;
  } catch { return null; }
}

// \mol{...} anywhere in a TeX string (braces inside are matched).
export function expandMol(tex) {
  let out = "";
  let i = 0;
  for (;;) {
    const at = tex.indexOf("\\mol{", i);
    if (at < 0) return out + tex.slice(i);
    let depth = 1, j = at + 5;
    while (j < tex.length && depth) { if (tex[j] === "{") depth++; else if (tex[j] === "}") depth--; j++; }
    let body;
    try { body = molTex(tex.slice(at + 5, j - 1)); } catch (e) { body = `\\text{\\color{red}fórmula: ${textArg(e.message)}}`; }
    out += tex.slice(i, at) + body;
    i = j;
  }
}
