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
  const labels = Array.from({ length: n }, (_, q) => ({ q, x: 22 + Math.floor(q / ROWS) * 33 + 5.5, y: 78 + (q % ROWS) * 6 }));
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
  // Try every set of four among the biggest solid squares and keep the one that looks most like the sheet's corners:
  // similar sizes, a near-parallelogram, and the sheet's 180 x 267 proportions.
  const top = squares.sort((a, b) => b.area - a.area).slice(0, 10);
  let best = null;
  const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  for (let i = 0; i < top.length; i += 1) for (let j = i + 1; j < top.length; j += 1) for (let k = j + 1; k < top.length; k += 1) for (let l = k + 1; l < top.length; l += 1) {
    const g = [top[i], top[j], top[k], top[l]];
    const areas = g.map((s) => s.area);
    const spread = Math.max(...areas) / Math.min(...areas);
    if (spread > 2.2) continue;
    const pick = (score) => g.reduce((bst, s) => (score(s) > score(bst) ? s : bst));
    const tl = pick((s) => -(s.cx + s.cy)), br = pick((s) => s.cx + s.cy), tr = pick((s) => s.cx - s.cy), bl = pick((s) => -(s.cx - s.cy));
    if (new Set([tl, tr, bl, br]).size < 4) continue;
    const ratio = dist(tl, tr) / dist(tl, bl);
    if (ratio < 0.4 || ratio > 1.0) continue;
    const diag = Math.hypot(tl.cx + br.cx - tr.cx - bl.cx, tl.cy + br.cy - tr.cy - bl.cy) / dist(tl, br);
    const cost = Math.abs(Math.log(ratio / (180 / 267))) + diag * 3 + Math.log(spread);
    // a bigger frame is the sheet, not a cluster of marks on it
    const size = dist(tl, br);
    const score = cost - Math.log(size / Math.hypot(w, h)) * 0.5;
    if (!best || score < best.score) best = { score, g: [tl, tr, bl, br] };
  }
  if (!best) return null;
  return best.g.map((s) => [s.cx, s.cy]);
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

// ---------------------------------------------------------------- rectified reading
// The photo is warped so the sheet is a flat 210 x 297 mm image (S pixels per mm); every later step works on that image.
export function rectify(gray, w, h, H, S) {
  const Wr = Math.round(PAGE.w * S), Hr = Math.round(PAGE.h * S);
  const out = new Uint8ClampedArray(Wr * Hr);
  for (let y = 0; y < Hr; y += 1) {
    for (let x = 0; x < Wr; x += 1) {
      const [px, py] = applyH(H, x / S, y / S);
      const x0 = Math.floor(px), y0 = Math.floor(py);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) { out[y * Wr + x] = 255; continue; }
      const fx = px - x0, fy = py - y0, i = y0 * w + x0;
      out[y * Wr + x] = gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy;
    }
  }
  return { img: out, w: Wr, h: Hr, S };
}

function dilate(bin, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      out[i] = bin[i] | bin[i - 1] | bin[i + 1] | bin[i - w] | bin[i + w] | bin[i - w - 1] | bin[i - w + 1] | bin[i + w - 1] | bin[i + w + 1];
    }
  }
  return out;
}

const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
// 1-D clusters of sorted values: a new cluster starts when the gap to the previous value exceeds tol.
function cluster1d(values, tol) {
  const v = values.slice().sort((a, b) => a - b);
  const groups = [];
  for (const x of v) {
    const g = groups[groups.length - 1];
    if (g && x - g[g.length - 1] <= tol) g.push(x); else groups.push([x]);
  }
  return groups;
}

// Dark share of a square-ish disc at (x, y) mm, radius r mm, on the rectified binary image.
function discDark(bin, W, Hh, S, x, y, r) {
  const cx = x * S, cy = y * S, rr = r * S;
  let dark = 0, total = 0;
  for (let yy = Math.max(0, Math.floor(cy - rr)); yy <= Math.min(Hh - 1, Math.ceil(cy + rr)); yy += 1) {
    for (let xx = Math.max(0, Math.floor(cx - rr)); xx <= Math.min(W - 1, Math.ceil(cx + rr)); xx += 1) {
      if ((xx - cx) ** 2 + (yy - cy) ** 2 <= rr * rr) { total += 1; dark += bin[yy * W + xx]; }
    }
  }
  return total ? dark / total : 0;
}
function ringDark(bin, W, Hh, S, x, y, r0, r1) {
  const cx = x * S, cy = y * S;
  let dark = 0, total = 0;
  for (let yy = Math.max(0, Math.floor(cy - r1 * S)); yy <= Math.min(Hh - 1, Math.ceil(cy + r1 * S)); yy += 1) {
    for (let xx = Math.max(0, Math.floor(cx - r1 * S)); xx <= Math.min(W - 1, Math.ceil(cx + r1 * S)); xx += 1) {
      const d = Math.hypot(xx - cx, yy - cy) / S;
      if (d >= r0 && d <= r1) { total += 1; dark += bin[yy * W + xx]; }
    }
  }
  return total ? dark / total : 0;
}

// Does the printed layout sit where it should? Share of expected rings that show ink around them.
function ringEvidence(bin, W, Hh, S, layout) {
  const e = layout.bubbles.map((b) => ringDark(bin, W, Hh, S, b.x, b.y, BUBBLE_R - 0.4, BUBBLE_R + 0.4));
  return median(e);
}

// Layout-free reading: finds the printed rings in the rectified image and builds the grid from them, so a sheet whose
// bubbles are not exactly where the layout says (printer scaling, a copy of a copy) still reads.
function detectGrid(bin, W, Hh, S, n) {
  const closed = dilate(bin, W, Hh);
  const all = blobs(closed, W, Hh, Math.round(8 * S * S / 4));
  const lo = 2.8 * S, hi = 7.5 * S;
  const cand = all.filter((b) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    return bw >= lo && bw <= hi && bh >= lo && bh <= hi && bw / bh > 0.7 && bw / bh < 1.4 && b.cy > 20 * S && b.cy < 276 * S;
  });
  if (cand.length < Math.min(n, 8) * 3) return null;
  const size = median(cand.map((b) => (b.x1 - b.x0 + b.y1 - b.y0 + 2) / 2));
  // rows
  const rowGroups = cluster1d(cand.map((b) => b.cy), size * 0.3);
  const rowOf = (b) => rowGroups.findIndex((g) => b.cy >= g[0] - 1e-6 && b.cy <= g[g.length - 1] + 1e-6);
  const byRow = rowGroups.map(() => []);
  for (const b of cand) byRow[rowOf(b)].push(b);
  // the student-code strip: one row of 12 to 16 evenly spaced squares, wider spaced than bubble columns
  let idRow = -1;
  byRow.forEach((r, i) => { if (r.length >= 12 && r.length <= 16 && (idRow < 0 || r.length > byRow[idRow].length)) idRow = i; });
  const idBlobs = idRow >= 0 ? byRow[idRow].slice().sort((a, b) => a.cx - b.cx) : null;
  const bubbleBlobs = cand.filter((b) => rowOf(b) !== idRow);
  if (bubbleBlobs.length < Math.min(n, 8) * 3) return null;
  // Columns first: the x positions shared by many blobs. Then rows from the blobs that sit on those columns.
  const colGroups = cluster1d(bubbleBlobs.map((b) => b.cx), size * 0.3);
  const maxCol = Math.max(...colGroups.map((g) => g.length));
  const cols = colGroups.filter((g) => g.length >= Math.max(4, maxCol * 0.4)).map((g) => median(g)).sort((a, c) => a - c);
  const onCols = bubbleBlobs.filter((b) => cols.some((c) => Math.abs(b.cx - c) <= size * 0.4));
  const rows = cluster1d(onCols.map((b) => b.cy), size * 0.3).filter((g) => g.length >= 2).map((g) => median(g));
  if (rows.length < 2) return null;
  // Bubble rows are evenly spaced; the longest evenly spaced chain wins, and a skipped row is filled in.
  const pitch = median(rows.slice(1).map((y, i) => y - rows[i]));
  let best = [], run = [rows[0]];
  for (let i = 1; i < rows.length; i += 1) {
    const d = rows[i] - rows[i - 1];
    const k = Math.round(d / pitch);
    if (k >= 1 && k <= 2 && Math.abs(d - k * pitch) <= pitch * 0.25) {
      if (k === 2) run.push(rows[i - 1] + d / 2);
      run.push(rows[i]);
    } else { if (run.length > best.length) best = run; run = [rows[i]]; }
  }
  if (run.length > best.length) best = run;
  const rowCenters = best;
  if (!rowCenters.length || cols.length < 4 || cols.length % 4 !== 0) return null;
  const blocksN = cols.length / 4;
  const R = rowCenters.length;
  if (blocksN * R < n || (blocksN - 1) * R >= n) return null;
  const marks = Array.from({ length: n }, () => [0, 0, 0, 0]);
  const rad = (size / 2 / S) * 0.62;
  for (let q = 0; q < n; q += 1) {
    const b = Math.floor(q / R), r = q % R;
    for (let li = 0; li < 4; li += 1) marks[q][li] = discDark(bin, W, Hh, S, cols[b * 4 + li] / S, rowCenters[r] / S, rad);
  }
  let idCells = null;
  if (idBlobs && idBlobs.length >= 12 && median(idBlobs.map((b) => b.cy)) < rowCenters[0]) {
    const xs = idBlobs.map((b) => b.cx), y = median(idBlobs.map((b) => b.cy));
    const pitch = median(xs.slice(1).map((x, i) => x - xs[i]).filter((d) => d > size * 1.2));
    if (pitch > 0) {
      idCells = Array.from({ length: ID_CELLS }, (_, i) => (discDark(bin, W, Hh, S, (xs[0] + i * pitch) / S, y / S, (size / 2 / S) * 0.5) > 0.5 ? 1 : 0));
    }
  }
  return { marks, idCells };
}

function classify(marks) {
  const answers = [], flags = [];
  for (const m of marks) {
    const order = [0, 1, 2, 3].sort((i, j) => m[j] - m[i]);
    const best = m[order[0]], second = m[order[1]];
    if (best < 0.35) { answers.push(null); flags.push(false); continue; }
    const multiple = second > best * 0.6;
    answers.push(multiple ? null : LETTERS[order[0]]);
    flags.push(multiple || best < 0.5 || best - second < 0.25);
  }
  return { answers, flags };
}

// Reads one sheet. Returns { ok, error, studentIndex, answers: [letter|null], flags: [bool], marks: [[4 darkness values]], mode }.
export function readSheet(gray, w, h, n) {
  const layout = sheetLayout(n);
  const bin0 = binarize(gray, w, h);
  const corners = findFiducials(bin0, w, h);
  if (!corners) return { ok: false, error: "No encontré las cuatro marcas negras de las esquinas. Fotografía la hoja completa, sin sombras fuertes." };
  const H = homography(FID_CENTERS, corners);
  // pixels per millimetre near the middle of the sheet
  const [ax, ay] = applyH(H, 100, 150), [bx, by] = applyH(H, 110, 150);
  const mm = Math.hypot(bx - ax, by - ay) / 10;
  const S = Math.max(4, Math.min(7, mm * 1.2));
  const rect = rectify(gray, w, h, H, S);
  const bin = binarize(rect.img, rect.w, rect.h);

  let marks = null, idCells, mode = "layout";
  if (ringEvidence(bin, rect.w, rect.h, S, layout) < 0.22) {
    const g = detectGrid(bin, rect.w, rect.h, S, n);
    if (g) { marks = g.marks; idCells = g.idCells; mode = "detected"; }
  }
  if (!marks) {
    // too blurred to see the rings: trust the printed layout
    idCells = layout.idCells.map((c) => (discDark(bin, rect.w, rect.h, S, c.x, c.y, 1.6) > 0.5 ? 1 : 0));
    marks = Array.from({ length: n }, () => [0, 0, 0, 0]);
    for (const b of layout.bubbles) marks[b.q][LETTERS.indexOf(b.letter)] = discDark(bin, rect.w, rect.h, S, b.x, b.y, READ_R);
  }
  const studentIndex = idCells ? decodeIdBits(idCells) : null;
  const { answers, flags } = classify(marks);
  return { ok: true, error: null, studentIndex, answers, flags, marks, mode };
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
    // no corner marks upright or on their side means no sheet in the picture: turning it further will not help
    if (turn === 1 && !first.ok && !r.ok) return first;
    cur = rotate90(cur.gray, cur.w, cur.h);
  }
  return first.ok ? { ...first, turns: 0 } : first;
}

// Cheap check for a live camera: where the four corner marks are in this frame (image points), or null.
export function findSheetCorners(gray, w, h) {
  const bin = binarize(gray, w, h);
  return findFiducials(bin, w, h);
}

// The frame as a grayscale array scaled so its longest side is at most maxSide.
export function frameToGray(source, canvas, maxSide = 1280) {
  const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < gray.length; i += 1) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  return { gray, w, h };
}
