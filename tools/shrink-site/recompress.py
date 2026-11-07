# Third shrink step (after svgmin.py and svgutf8.py): every embedded raster (PNG/WebP/JPEG data URI, also inside
# SVGs) becomes grayscale WebP q72, at most 1200 px wide. The booklets are black-and-white scans, so grayscale
# loses nothing visible; native charts are vectors and are untouched. Only replaces an image when it gets smaller.
# Usage: python3 -I recompress.py <app build folder that holds exams/> [max width, default 1200] [WebP quality, default 72]
import re, base64, io, glob, sys
from PIL import Image
MAXW = int(sys.argv[2]) if len(sys.argv) > 2 else 1200
Q = int(sys.argv[3]) if len(sys.argv) > 3 else 72
RX = re.compile(r"data:image/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)")
def shrink(m):
    raw = base64.b64decode(m.group(2))
    try:
        im = Image.open(io.BytesIO(raw)); im.load()
    except Exception:
        return m.group(0)
    alpha = im.mode in ("RGBA", "LA", "P") and ("A" in im.getbands() or "transparency" in im.info)
    im = im.convert("LA" if alpha else "L")
    if im.width > MAXW:
        im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
    if alpha:
        im = im.convert("RGBA")
    o = io.BytesIO(); im.save(o, "WEBP", quality=Q, method=6); w = o.getvalue()
    if len(w) >= len(raw):
        return m.group(0)
    return "data:image/webp;base64," + base64.b64encode(w).decode()
for f in sorted(glob.glob(sys.argv[1] + "/exams/*.json")):
    s = open(f, encoding="utf-8").read()
    t = RX.sub(shrink, s)
    if t != s:
        open(f, "w", encoding="utf-8").write(t); print(f.split("/")[-1], len(s) // 1000, "->", len(t) // 1000)
