"""Optional page pre-processing before OCR."""
from __future__ import annotations

import io

import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageDraw
from pypdf import PdfReader, PdfWriter

BATCH = 6   # pages rendered at once, to keep memory bounded on large PDFs


def _blue_mask(im: Image.Image) -> Image.Image:
    h, sat, v = im.convert("HSV").split()
    hm = h.point(lambda x: 255 if 135 <= x <= 190 else 0)
    sm = sat.point(lambda x: 255 if x > 90 else 0)
    vm = v.point(lambda x: 255 if x > 60 else 0)
    return ImageChops.multiply(ImageChops.multiply(hm, sm), vm)


def find_dots(mask: Image.Image, dpi: int, scale: int = 4) -> list[tuple[int, int, int, int]]:
    """Boxes (full-resolution px) of compact, filled, roughly circular blue blobs: the answer dots.

    A dot can cover an option's letter. Whitening it would remove the only marker that tells the OCR (and the
    option splitter) that an option starts there, so dots are preserved; only other blue ink is removed.
    """
    small = mask.resize((max(1, mask.width // scale), max(1, mask.height // scale)), Image.BOX)
    w, h = small.size
    px = small.load()
    seen = bytearray(w * h)
    dots = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0] <= 64 or seen[y0 * w + x0]:
                continue
            stack, comp = [(x0, y0)], []
            seen[y0 * w + x0] = 1
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny] > 64:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            xs, ys = [c[0] for c in comp], [c[1] for c in comp]
            bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            size_in = max(bw, bh) * scale / dpi
            if 0.09 <= size_in <= 0.26 and abs(bw - bh) <= 0.3 * max(bw, bh) and len(comp) / (bw * bh) >= 0.6:
                dots.append((min(xs) * scale - 2, min(ys) * scale - 2, (max(xs) + 1) * scale + 2, (max(ys) + 1) * scale + 2))
    return dots


def whiten_blue(im: Image.Image, dpi: int = 200) -> Image.Image:
    """Whiten blue ink (typed notes, handwriting) but KEEP answer dots; black print and gray noise are untouched."""
    mask = _blue_mask(im)
    keep = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(keep)
    for box in find_dots(mask, dpi):
        d.rectangle(box, fill=255)
    im = im.copy()
    im.paste((255, 255, 255), mask=ImageChops.subtract(mask, keep))
    return im


def remove_blue_ink(pdf_bytes: bytes, dpi: int = 200) -> bytes:
    """Return an image-only PDF with the same page count and page sizes, blue ink removed."""
    src = pdfium.PdfDocument(pdf_bytes)
    out = PdfWriter()
    try:
        n = len(src)
        for start in range(0, n, BATCH):
            imgs = [whiten_blue(src[i].render(scale=dpi / 72).to_pil().convert("RGB"), dpi)
                    for i in range(start, min(n, start + BATCH))]
            buf = io.BytesIO()
            imgs[0].save(buf, "PDF", resolution=float(dpi), save_all=True, append_images=imgs[1:])
            for page in PdfReader(io.BytesIO(buf.getvalue())).pages:
                out.add_page(page)
    finally:
        src.close()
    final = io.BytesIO()
    out.write(final)
    return final.getvalue()
