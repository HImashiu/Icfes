"""Image helpers: blue answer-mark removal, paper clean-up for figure crops, base64 for prompts."""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image


def blue_mask(a: np.ndarray) -> np.ndarray:
    """Pixels of the blue answer dots: clearly bluer than red and green."""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return (b - np.maximum(r, g) > 45) & (b > 110)


def remove_blue(img: Image.Image) -> Image.Image:
    """The scans carry the answer as a blue dot; a model solving the question must not see it."""
    a = np.array(img.convert("RGB"))
    m = blue_mask(a)
    if m.any():
        # grow the mask a little so the dot's anti-aliased rim goes too
        from PIL import ImageFilter
        mm = Image.fromarray((m * 255).astype("uint8")).filter(ImageFilter.MaxFilter(5))
        a[np.array(mm) > 0] = 255
    return Image.fromarray(a)


def paper_level(gray: np.ndarray) -> int:
    """Otsu threshold between ink and paper, kept in a safe band (the editor's slider runs 120-250)."""
    hist = np.bincount(gray.ravel(), minlength=256).astype(float)
    total = gray.size
    sum_all = (np.arange(256) * hist).sum()
    w0 = s0 = 0.0
    best, level = -1.0, 200
    for t in range(256):
        w0 += hist[t]
        if w0 == 0 or w0 == total:
            continue
        s0 += t * hist[t]
        m0, m1 = s0 / w0, (sum_all - s0) / (total - w0)
        var = w0 * (total - w0) * (m0 - m1) ** 2
        if var > best:
            best, level = var, t
    # paper sits well above the ink/paper split; keep light greys (shading in drawings) as ink
    return int(min(235, max(170, level + 40)))


def clean_figure(img: Image.Image, mode: str = "white", level: int | None = None) -> tuple[Image.Image, int]:
    """Same rule as the editor's ✨ Limpiar: every pixel lighter than the level is paper and turns white (or
    transparent); blue answer marks are removed first. Returns the image and the level used."""
    img = remove_blue(img).convert("RGBA")
    a = np.array(img)
    light = a[..., :3].min(axis=2)
    lv = level if level is not None else paper_level(light)
    paper = light >= lv
    if mode == "white":
        a[paper] = (255, 255, 255, 255)
    else:
        a[paper, 3] = 0
    return Image.fromarray(a), lv


def trim_box(img: Image.Image, pad: int = 6) -> tuple[int, int, int, int]:
    """The box of the ink, without the empty white margin."""
    a = np.array(img.convert("RGBA"))
    ink = (a[..., :3].min(axis=2) < 250) & (a[..., 3] > 0)
    ys, xs = np.nonzero(ink)
    if not len(xs):
        return 0, 0, img.width, img.height
    return (int(max(0, xs.min() - pad)), int(max(0, ys.min() - pad)),
            int(min(a.shape[1], xs.max() + pad + 1)), int(min(a.shape[0], ys.max() + pad + 1)))


def trim(img: Image.Image, pad: int = 6) -> Image.Image:
    """Cut away empty white margin around the ink."""
    return img.crop(trim_box(img, pad))


def jpeg_b64(img: Image.Image, max_side: int = 1600, quality: int = 85) -> tuple[str, tuple[int, int]]:
    img = img.convert("RGB")
    s = max_side / max(img.size)
    if s < 1:
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode(), img.size


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()
