"""Small geometry helpers. All coordinates are inches in the page's own (tilted) frame unless noted."""
from __future__ import annotations

import math
from typing import Iterable

Box = tuple[float, float, float, float]  # x0, y0, x1, y1


def poly_points(poly: list[float]) -> list[tuple[float, float]]:
    return list(zip(poly[0::2], poly[1::2]))


def deskew_point(x: float, y: float, phi_deg: float, cx: float, cy: float) -> tuple[float, float]:
    """Rotate (x, y) about (cx, cy) the same way PIL's Image.rotate(phi_deg) rotates pixels
    (counter-clockwise on screen; y grows downward)."""
    t = math.radians(phi_deg)
    dx, dy = x - cx, y - cy
    return cx + dx * math.cos(t) + dy * math.sin(t), cy - dx * math.sin(t) + dy * math.cos(t)


def poly_box(poly: list[float], phi: float = 0.0, cx: float = 0.0, cy: float = 0.0) -> Box:
    pts = [deskew_point(x, y, phi, cx, cy) for x, y in poly_points(poly)] if phi else poly_points(poly)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def union(boxes: Iterable[Box]) -> Box | None:
    boxes = list(boxes)
    if not boxes:
        return None
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def area(b: Box) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def intersect(a: Box, b: Box) -> Box | None:
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def overlap_fraction(inner: Box, outer: Box) -> float:
    """Fraction of `inner`'s area that lies inside `outer`."""
    i = intersect(inner, outer)
    return area(i) / area(inner) if i and area(inner) > 0 else 0.0


def contains(outer: Box, inner: Box, tol: float = 0.0) -> bool:
    return (inner[0] >= outer[0] - tol and inner[1] >= outer[1] - tol
            and inner[2] <= outer[2] + tol and inner[3] <= outer[3] + tol)


def pad(b: Box, m: float, limit: Box | None = None) -> Box:
    r = (b[0] - m, b[1] - m, b[2] + m, b[3] + m)
    return (max(r[0], limit[0]), max(r[1], limit[1]), min(r[2], limit[2]), min(r[3], limit[3])) if limit else r


def column_of(b: Box, page_w: float, span_frac: float = 0.62) -> str:
    if (b[2] - b[0]) > span_frac * page_w:
        return "span"
    return "left" if (b[0] + b[2]) / 2 < page_w / 2 else "right"
