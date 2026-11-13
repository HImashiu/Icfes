// A result card students can post on WhatsApp estados / Instagram stories: 1080×1920 PNG drawn on a canvas in the
// landing's look (dark notebook grid, lime sticker, area colors). Only the student's own result: no ranking.
import { areaColor } from "./brand.js";

const W = 1080;
const H = 1920;
const INK = "#0D110F";
const LIME = "#C8F04A";
const CREAM = "#F6F3EA";
const DISPLAY = '"Bricolage Grotesque", "Figtree", sans-serif';
const UI = '"Figtree", system-ui, sans-serif';
const READ = '"Newsreader", Georgia, serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A tilted sticker with a cream rim and a flat drop, like .stk on the landing.
function sticker(ctx, text, cx, cy, { font, bg, fg, tilt = -3, padX = 34, padY = 22 }) {
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  const h = parseInt(font.match(/(\d+)px/)[1], 10) + padY * 2;
  ctx.translate(cx, cy);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  roundRect(ctx, -w / 2 - 7, -h / 2 + 3, w + 14, h + 14, 26);
  ctx.fill();
  ctx.fillStyle = CREAM;
  roundRect(ctx, -w / 2 - 7, -h / 2 - 7, w + 14, h + 14, 26);
  ctx.fill();
  ctx.fillStyle = bg;
  roundRect(ctx, -w / 2, -h / 2, w, h, 20);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 4);
  ctx.restore();
}

/**
 * @param {{ big: string, unit?: string, kicker: string, line: string, areas: {name:string, pct:number|null}[], url: string }} card
 * @returns {Promise<Blob>}
 */
export async function drawResultCard(card, owlSrc = null) {
  try { await document.fonts?.ready; } catch { /* system fonts then */ }
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(242,245,239,0.06)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Brand.
  if (owlSrc) {
    const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = owlSrc; });
    if (img) ctx.drawImage(img, 80, 150, 96, 96);
  }
  ctx.fillStyle = "#F2F5EF";
  ctx.font = `800 64px ${DISPLAY}`;
  ctx.textBaseline = "middle";
  ctx.fillText("cóndor", owlSrc ? 196 : 80, 200);

  // Kicker and the big number.
  sticker(ctx, card.kicker.toUpperCase(), W / 2, 420, { font: `800 40px ${UI}`, bg: LIME, fg: INK, tilt: -3 });
  ctx.textAlign = "center";
  ctx.fillStyle = "#F2F5EF";
  ctx.font = `800 300px ${DISPLAY}`;
  ctx.fillText(card.big, W / 2, 700);
  if (card.unit) {
    ctx.font = `italic 600 76px ${READ}`;
    ctx.fillStyle = LIME;
    ctx.fillText(card.unit, W / 2, 880);
  }
  ctx.font = `600 40px ${UI}`;
  ctx.fillStyle = "#AEB8A8";
  ctx.fillText(card.line, W / 2, card.unit ? 970 : 900);

  // One bar per area, in the area's color.
  let y = 1080;
  ctx.textAlign = "left";
  for (const a of card.areas.slice(0, 5)) {
    ctx.fillStyle = "#F2F5EF";
    ctx.font = `800 40px ${UI}`;
    ctx.fillText(a.name, 110, y);
    ctx.textAlign = "right";
    ctx.fillText(a.pct == null ? "—" : `${Math.round(a.pct)} %`, W - 110, y);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(242,245,239,0.1)";
    roundRect(ctx, 110, y + 34, W - 220, 22, 11);
    ctx.fill();
    if (a.pct) {
      ctx.fillStyle = areaColor(a.name);
      roundRect(ctx, 110, y + 34, Math.max(22, ((W - 220) * a.pct) / 100), 22, 11);
      ctx.fill();
    }
    y += 130;
  }

  // Call to action: the lime button of the site.
  ctx.textAlign = "center";
  ctx.font = `800 46px ${UI}`;
  const bw = ctx.measureText(card.url).width + 120;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(ctx, (W - bw) / 2, 1736 + 8, bw, 104, 52);
  ctx.fill();
  ctx.fillStyle = LIME;
  roundRect(ctx, (W - bw) / 2, 1736, bw, 104, 52);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(card.url, W / 2, 1790);
  ctx.font = `600 30px ${UI}`;
  ctx.fillStyle = "#AEB8A8";
  ctx.fillText("Preguntas de cuadernillos publicados por el ICFES", W / 2, 1690);

  return new Promise((ok) => c.toBlob((b) => ok(b), "image/png"));
}

// Share the image where the phone allows it (WhatsApp, Instagram…); otherwise save it.
export async function shareResultCard(card, owlSrc) {
  const blob = await drawResultCard(card, owlSrc);
  if (!blob) return "error";
  const file = new File([blob], "mi-resultado-condor.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `Practica con preguntas reales del ICFES: ${card.link}` });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "saved";
}
