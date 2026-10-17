import { describe, expect, it } from "vitest";
import { applyH, decodeIdBits, FID_CENTERS, FID_SIZE, homography, idBits, invertH, readSheet, readSheetAnyRotation, rotate90, sheetLayout } from "../src/lib/omr.js";

// Renders a sheet into a grayscale image through a known homography (sheet mm -> pixels), with uneven light and noise.
function render({ n, answers, student, H, w, h, shade = true, seed = 7 }) {
  const layout = sheetLayout(n);
  const inv = invertH(H);
  const bits = idBits(student);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const img = new Uint8ClampedArray(w * h);
  const filled = layout.bubbles.filter((b) => answers[b.q] === b.letter);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [u, v] = applyH(inv, x, y);
      let ink = false;
      for (const [cx, cy] of FID_CENTERS) if (Math.abs(u - cx) <= FID_SIZE / 2 && Math.abs(v - cy) <= FID_SIZE / 2) ink = true;
      if (!ink) for (const c of layout.idCells) if (bits[c.i] && Math.abs(u - c.x) <= 2.5 && Math.abs(v - c.y) <= 2.5) ink = true;
      if (!ink && v > 74 && v < 264) for (const b of layout.bubbles) {
        if (Math.abs(v - b.y) > 3) continue;
        const d = Math.hypot(u - b.x, v - b.y);
        if (d > 3) continue;
        if (Math.abs(d - layout.bubbleR) < 0.15) ink = true;
        if (d < 1.95 && filled.includes(b)) ink = true;
      }
      const light = shade ? 215 - 45 * (x / w) : 215;
      img[y * w + x] = Math.max(0, Math.min(255, (ink ? 55 : light) + (rnd() - 0.5) * 18));
    }
  }
  return img;
}

// a mild perspective: the sheet fills most of a 1000 x 1400 photo, slightly turned and tilted
const W = 1000, H_ = 1420;
const TRUE = homography(FID_CENTERS, [[70, 60], [930, 95], [45, 1330], [915, 1362]]);

describe("answer sheet layout", () => {
  it("places up to 150 bubbles grids inside the corner marks and encodes student numbers with a check", () => {
    const l = sheetLayout(120);
    expect(l.cols).toBe(4);
    expect(Math.max(...l.bubbles.map((b) => b.x))).toBeLessThan(190);
    expect(Math.max(...l.bubbles.map((b) => b.y))).toBeLessThan(270);
    expect(sheetLayout(150).bubbles.length).toBe(600);
    expect(() => sheetLayout(151)).toThrow();
    expect(decodeIdBits(idBits(37))).toBe(37);
    const bad = idBits(37);
    bad[5] ^= 1;
    expect(decodeIdBits(bad)).toBeNull();
  });
  it("solves a homography and inverts it", () => {
    const [x, y] = applyH(invertH(TRUE), ...applyH(TRUE, 100, 150));
    expect(x).toBeCloseTo(100, 4);
    expect(y).toBeCloseTo(150, 4);
  });
});

describe("reading a photographed sheet", () => {
  const n = 60;
  const answers = Array.from({ length: n }, (_, q) => (q % 7 === 3 ? null : "ABCD"[(q * 3 + 1) % 4]));
  const img = render({ n, answers, student: 41, H: TRUE, w: W, h: H_ });

  it("finds the student and every marked answer, and leaves blanks blank", () => {
    const r = readSheet(img, W, H_, n);
    expect(r.ok).toBe(true);
    expect(r.studentIndex).toBe(41);
    expect(r.answers).toEqual(answers);
    expect(r.flags.some(Boolean)).toBe(false);
  });
  it("flags a double mark instead of guessing", () => {
    const twice = answers.slice();
    const img2 = render({ n, answers: twice, student: 41, H: TRUE, w: W, h: H_ });
    // darken a second bubble of question 0 by hand through the true transform
    const layout = sheetLayout(n);
    const extra = layout.bubbles.find((b) => b.q === 0 && b.letter !== twice[0]);
    const [cx, cy] = applyH(TRUE, extra.x, extra.y);
    for (let y = Math.floor(cy) - 12; y <= cy + 12; y += 1) for (let x = Math.floor(cx) - 12; x <= cx + 12; x += 1) if ((x - cx) ** 2 + (y - cy) ** 2 < 100) img2[y * W + x] = 60;
    const r = readSheet(img2, W, H_, n);
    expect(r.answers[0]).toBeNull();
    expect(r.flags[0]).toBe(true);
  });
  it("reads a sheet photographed sideways", () => {
    let t = { gray: img, w: W, h: H_ };
    t = rotate90(t.gray, t.w, t.h);
    const r = readSheetAnyRotation(t.gray, t.w, t.h, n);
    expect(r.studentIndex).toBe(41);
    expect(r.answers).toEqual(answers);
    expect(r.turns).toBeGreaterThan(0);
  });
  it("explains when the corner marks are not in the photo", () => {
    const blank = new Uint8ClampedArray(W * H_).fill(210);
    const r = readSheet(blank, W, H_, n);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/esquinas/);
  });
});
