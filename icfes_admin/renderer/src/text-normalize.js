// Text fixes for exam fields. Pure string functions, shared by the sync step (which writes the
// cleaned exam files) and the renderer (which applies the same rules as a safety net).
// Math is never touched here: $...$ spans are skipped, and isMathSpan decides what KaTeX renders.

const MATH_SPAN = /(\$[^$\n]+?\$)/;

// Applies fn to the text outside $...$ spans, so TeX is never changed by these fixes.
export function outsideMath(text, fn) {
  return text
    .split(MATH_SPAN)
    .map((part, i) => (i % 2 ? part : fn(part)))
    .join("");
}

// A $...$ span is math when it has TeX syntax, or when it is not money: money starts with a digit
// and carries no words. Words, such as "$200.000 para cancelarlo", stay literal dollar text.
export function isMathSpan(inner) {
  if (/[\\^_{}]/.test(inner)) return true;
  if (/^\s*\d/.test(inner)) return false;
  if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}/.test(inner)) return false;
  return true;
}

// Splits a pipe-table row into trimmed cells.
const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
const isRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes("-");

// Markdown pipe tables become <table> markup, with blank lines around them so the paragraphs
// on either side still split. Counts the tables it converts.
export function pipeTablesToHtml(text, counts = {}) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (isRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = cells(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && isRow(lines[i])) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      counts.tables = (counts.tables ?? 0) + 1;
      const thead = `<thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push("", `<table class="exam-table">${thead}${tbody}</table>`, "");
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }
  return out.join("\n");
}

// Cleans one text field. Counts each kind of fix in `counts` when given.
// number: the question number, used to drop a leaked "53 " or "53: " at the start of a stem.
export function normalizeField(text, { number = null, leadingNumber = false, counts = {} } = {}) {
  if (!text) return text ?? "";
  const bump = (key, n = 1) => {
    if (n) counts[key] = (counts[key] ?? 0) + n;
  };
  let out = outsideMath(text, (part) => {
    let n = 0;
    const unescaped = part.replace(/\\([.\-()[\]#*_])/g, (_, c) => {
      n += 1;
      return c;
    });
    bump("escapes_removed", n);
    return unescaped;
  });
  // Markdown heading marks (#, ####) are not part of the question text.
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, (m) => {
    bump("headings_removed");
    return "";
  });
  // Blue answer-dot leftovers (☒, ☐) are key marks, never text.
  out = out.replace(/[☒☐][ \t]*/g, () => {
    bump("key_marks_removed");
    return "";
  });
  // A leading bullet dot at the start of a line, left by a blue answer mark.
  out = out.replace(/^[ \t]*[·•][ \t]*/gm, () => {
    bump("leading_dots_removed");
    return "";
  });
  if (leadingNumber && number != null) {
    const lead = new RegExp(`^\\s*${number}\\s*[:.]?\\s+(?=\\D)`);
    if (lead.test(out)) {
      out = out.replace(lead, "");
      bump("number_leaks_removed");
    }
  }
  out = pipeTablesToHtml(out, counts);
  // Single-asterisk italics (*moral*) become <em>; **bold** is left for the renderer.
  out = outsideMath(out, (part) =>
    part.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, (_, pre, body) => {
      bump("italics_converted");
      return `${pre}<em>${body}</em>`;
    }),
  );
  return out.trim();
}
