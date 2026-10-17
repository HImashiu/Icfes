// Paper answer sheets: the layout the sheet is printed with, and a reader that grades a phone photo of it.
// The reader works on a grayscale array (no canvas), so it is the same code in the browser and in tests.
//
// A sheet is A4 (210 x 297 mm) with a solid black square in each corner, a 14-cell strip that says which student the sheet
// belongs to, and a grid of A-D bubbles filled column by column, 30 rows per column.

export const PAGE = { w: 210, h: 297 };
export const FID_SIZE = 10;
// Centers of the corner squares: top-left, top-right, bottom-left, bottom-right.
export const FID_CENTERS = [[15, 15], [195, 15], [15, 282], [195, 282]];
export const LETTERS = ["A", "B", "C", "D"];
export const ROWS = 30;
export const MAX_QUESTIONS = 150;
const BUBBLE_R = 2.1;
const READ_R = 1.3;
const ID_CELLS = 14;

export function sheetLayout(n) {
  if (n < 1 || n > MAX_QUESTIONS) throw new Error(`Una hoja admite de 1 a ${MAX_QUESTIONS} preguntas.`);
  const cols = Math.ceil(n / ROWS);
  const bubbles = [];
  for (let q = 0; q < n; q += 1) {
    const col = Math.floor(q / ROWS);
    const row = q % ROWS;
    LETTERS.forEach((letter, li) => bubbles.push({ q, letter, x: 22 + col * 33 + 9 + li * 6.5, y: 78 + row * 6 }));
  }
  const labels = Array.from({ length: n }, (_, q) => ({ q, x: 22 + Math.floor(q / ROWS) * 33 + 3, y: 78 + (q % ROWS) * 6 }));
  const idCells = Array.from({ length: ID_CELLS }, (_, i) => ({ i, x: 58 + i * 8, y: 46 }));
  return { n, cols, bubbles, labels, idCells, bubbleR: BUBBLE_R, idSize: 5 };
}

// 14 cells: a sync cell that is always filled, the 12-bit student number, and an even-parity cell.
export function idBits(index) {
  if (!Number.isInteger(index) || index < 0 || index > 4095) throw new Error("Número de estudiante fuera de rango.");
  const bits = Array.from({ length: 12 }, (_, i) => (index >> (11 - i)) & 1);
  const parity = bits.reduce((a, b) => a ^ b, 0);
  return [1, ...bits, parity];
}
export function decodeIdBits(cells) {
  if (cells.length !== ID_CELLS || cells[0] !== 1) return null;
  const bits = cells.slice(1, 13);
  if (bits.reduce((a, b) => a ^ b, 0) !== cells[13]) return null;
  return bits.reduce((acc, b) => acc * 2 + b, 0);
}

// ---------------------------------------------------------------- geometry
// Solves for the 3x3 homography that sends src[i] to dst[i] (4 or more pairs), as a flat array of 9 numbers.
export function homography(src, dst) {
  const A = [];
  src.forEach(([x, y], i) => {
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  // Gaussian elimination on the 8 unknowns (h33 = 1); with more than 4 pairs, solve the normal equations.
  const n = 8;
  const M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (const r of A) for (let i = 0; i < n; i += 1) { for (let j = 0; j < n; j += 1) M[i][j] += r[i] * r[j]; M[i][n] -= r[i] * r[8] * -1; }
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("Las marcas de las esquinas no forman un cuadrilátero válido.");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return [...Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]), 1];
}
export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
export function invertH(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

// ---------------------------------------------------------------- image
// Dark = clearly darker than its neighbourhood, so a shadow across the page does not turn the paper black.
export function binarize(gray, w, h) {
  const win = Math.max(15, Math.round(w / 12)) | 1;
  const half = win >> 1;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x] < mean * 0.78 && gray[y * w + x] < 190 ? 1 : 0;
    }
  }
  return out;
}

// Connected dark blobs: { area, x0, y0, x1, y1, cx, cy }.
export function blobs(bin, w, h, minArea = 30) {
  const seen = new Uint8Array(w * h);
  const out = [];
  const stack = [];
  for (let start = 0; start < w * h; start += 1) {
    if (!bin[start] || seen[start]) continue;
    let area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      area += 1; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && bin[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && bin[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    if (area >= minArea) out.push({ area, x0, y0, x1, y1, cx: sx / area, cy: sy / area });
  }
  return out;
}

// The four corner squares as image points [TL, TR, BL, BR], or null.
export function findFiducials(bin, w, h) {
  const squares = blobs(bin, w, h, Math.max(40, Math.round(w * h * 0.0002))).filter((b) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    return b.area / (bw * bh) > 0.6 && bw / bh > 0.5 && bw / bh < 2;
  });
  if (squares.length < 4) return null;
  const biggest = Math.max(...squares.map((s) => s.area));
  const group = squares.filter((s) => s.area >= biggest * 0.45 && s.area <= biggest * 1.6);
  if (group.length < 4) return null;
  const pick = (score) => group.reduce((best, s) => (score(s) > score(best) ? s : best));
  const tl = pick((s) => -(s.cx + s.cy)), br = pick((s) => s.cx + s.cy), tr = pick((s) => s.cx - s.cy), bl = pick((s) => -(s.cx - s.cy));
  if (new Set([tl, tr, bl, br]).size < 4) return null;
  const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const ratio = dist(tl, tr) / dist(tl, bl); // 180 / 267 on the sheet
  if (ratio < 0.4 || ratio > 1.0) return null;
  return [tl, tr, bl, br].map((s) => [s.cx, s.cy]);
}

// Share of dark pixels inside a circle (image pixels).
function darkness(bin, w, h, cx, cy, r) {
  let dark = 0, total = 0;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { total += 1; dark += bin[y * w + x]; }
    }
  }
  return total ? dark / total : 0;
}

export function rotate90(gray, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[x * h + (h - 1 - y)] = gray[y * w + x];
  return { gray: out, w: h, h: w };
}

// Reads one sheet. Returns { ok, error, studentIndex, answers: [letter|null], flags: [bool], marks: [[4 darkness values]] }.
export function readSheet(gray, w, h, n) {
  const layout = sheetLayout(n);
  const bin = binarize(gray, w, h);
  const corners = findFiducials(bin, w, h);
  if (!corners) return { ok: false, error: "No encontré las cuatro marcas negras de las esquinas. Fotografía la hoja completa, sin sombras fuertes." };
  const H = homography(FID_CENTERS, corners);
  // pixels per millimetre near the middle of the sheet
  const [ax, ay] = applyH(H, 100, 150), [bx, by] = applyH(H, 110, 150);
  const mm = Math.hypot(bx - ax, by - ay) / 10;
  const cell = (x, y, r) => { const [px, py] = applyH(H, x, y); return darkness(bin, w, h, px, py, r * mm); };

  const idCells = layout.idCells.map((c) => (cell(c.x, c.y, 1.6) > 0.5 ? 1 : 0));
  const studentIndex = decodeIdBits(idCells);

  const marks = Array.from({ length: n }, () => [0, 0, 0, 0]);
  for (const b of layout.bubbles) marks[b.q][LETTERS.indexOf(b.letter)] = cell(b.x, b.y, READ_R);
  const answers = [];
  const flags = [];
  for (const m of marks) {
    const order = [0, 1, 2, 3].sort((i, j) => m[j] - m[i]);
    const best = m[order[0]], second = m[order[1]];
    if (best < 0.35) { answers.push(null); flags.push(false); continue; }
    const multiple = second > best * 0.6;
    answers.push(multiple ? null : LETTERS[order[0]]);
    flags.push(multiple || best < 0.5 || best - second < 0.25);
  }
  return { ok: true, error: null, studentIndex, answers, flags, marks };
}

// Tries the photo as taken and turned by 90, 180 and 270 degrees; the right turn is the one whose student code checks out.
export function readSheetAnyRotation(gray, w, h, n) {
  let cur = { gray, w, h };
  let first = null;
  for (let turn = 0; turn < 4; turn += 1) {
    let r;
    try { r = readSheet(cur.gray, cur.w, cur.h, n); } catch (e) { r = { ok: false, error: e.message }; }
    if (!first) first = r;
    if (r.ok && r.studentIndex != null) return { ...r, turns: turn };
    cur = rotate90(cur.gray, cur.w, cur.h);
  }
  return first.ok ? { ...first, turns: 0 } : first;
}
