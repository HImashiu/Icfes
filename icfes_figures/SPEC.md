# Figure specs (`icfes-figure/1`)

ICFES graphics repeat a small set of layouts. A figure is stored as a **spec**: a small JSON object
that the app draws with `render.js`. The original crop is kept as an audit fallback and is never
rendered in place of the spec when the spec is valid.

Nothing here contains exam content. Specs for real questions are written into the exam's golden
JSON, which lives under `/mnt/project-files/icfes/`, not in this repo.

## Where a figure goes

A question or an option may carry a `figures` list. Options matter because some answer choices are
themselves charts (for example, four bar charts labelled A to D).

```json
{
  "number": 12,
  "stem_md": "¿Cuál de las gráficas representa ...?",
  "figures": [
    { "kind": "bar", "spec": { ... }, "fallback_crop": "crops/S11-O_2da/q012.png", "fidelity": "verified" }
  ],
  "options": [
    { "letter": "A", "text_md": "", "figures": [ { "kind": "bar", "spec": { ... } } ] }
  ]
}
```

- `kind` must equal `spec.kind`.
- `fallback_crop` is optional, path relative to the exam's `/mnt/project-files/icfes/` folder.
- `fidelity`: `verified` (checked side by side against the crop), `draft` (written from the crop, not
  yet compared) or `image_only` (the figure stays an image because no kind fits).
- A figure whose kind is `image` has no spec and renders as its crop. That is the default for maps,
  photos, cartoons, geometry figures and function graphs (see `figures/catalog.md`).

## Kinds

Every spec has `kind` and may have `title`. Labels are plain strings and may contain Spanish
accents. Numbers print with Spanish separators: "." groups thousands and "," is the decimal mark.

### `bar`, vertical bars

```json
{ "kind": "bar", "title": "Matrícula", "categories": ["2019", "2020", "2021"],
  "series": [ { "name": "Oficial", "values": [12, 30, 21] }, { "name": "Privado", "values": [8, 9, 10] } ],
  "y": { "label": "Estudiantes", "min": 0, "max": 40, "step": 10 } }
```

- `categories`: one label per bar group. `series[i].values`: one non-negative number per category.
- A single series with no name draws no legend.

### `line`, a line over categorical x

```json
{ "kind": "line", "categories": ["Ene", "Feb", "Mar"], "series": [ { "name": "Ventas", "values": [4, null, 7] } ] }
```

- `null` leaves a gap, and the line breaks there. Lines are solid unless a series sets `"style": "dashed"`.
- Set `"marker"` per series to `"circle"` (default), `"square"` or `"triangle"`, so series stay
  apart in grey-scale print.

### `line` with numeric x

```json
{ "kind": "line", "x": { "label": "Tiempo (h)", "min": -1, "max": 10, "step": 1 }, "y": { "label": "%", "min": 0, "max": 100, "step": 10 },
  "series": [ { "name": "Aluminio", "points": [[0.5, 4], [1.5, 8], [9.5, 70]] } ] }
```

- Use `points` instead of `categories` when the x values are uneven numbers (for example time at
  half hours). Each point sits at its real x.

### `scatter`, points on numeric axes

```json
{ "kind": "scatter", "x": { "label": "Horas", "min": 0, "max": 10, "step": 2 }, "y": { "label": "Nota" },
  "series": [ { "points": [[1, 2], [4, 6.5]] } ] }
```

### `curve`, a qualitative shape with no scale

```json
{ "kind": "curve", "x": { "label": "Eje horizontal" }, "y": { "label": "Eje vertical" },
  "series": [ { "name": "Línea 1", "label": "Línea 1", "labelAt": 1, "style": "dashed", "points": [[0, 0.7], [0.6, 0.7], [1, 0.35]] } ] }
```

- For graphs that show only the shape. The points are sketch positions, with no tick values drawn.
- Points are joined with a smooth curve. `label` is printed near point `labelAt` (default: middle).

### `bar` with a second y axis

```json
{ "kind": "bar", "x": { "label": "Mes" }, "y": { "label": "Título eje y1", "min": 0, "max": 250, "step": 50 },
  "y2": { "label": "Título eje y2", "min": 0, "max": 14, "step": 2 },
  "categories": ["Ene", "Feb"],
  "series": [ { "name": "Serie 1", "values": [160, 190] }, { "name": "Serie 2", "values": [9.6, 11.4], "axis": 2 } ] }
```

- Series with `"axis": 2` are scaled by `y2`. Series with no `axis` use `y`.
- Both axis titles are required. Use the exam's printed title; do not paraphrase it.

### `pie`, a circle split into slices

```json
{ "kind": "pie", "slices": [ { "label": "Mujeres", "value": 1 }, { "label": "Hombres", "value": 3 } ] }
```

- Values are relative; the renderer shows each value and its percent of the total.

### `table`, rendered as an HTML table

```json
{ "kind": "table", "title": "Resultados", "headers": ["Año", "Total"], "rows": [["2019", "12"], ["2020", "30"]] }
```

- Cells are strings (or span objects, below), so they keep the exam's formatting (for example "1.200" or "12,5 %").
- Empty cells stay empty. Copy the scan as printed; do not fill gaps.
- `TABLE_CSS` is exported, so a page can style the table the same way in a browser.
- Table rendering is checked in Chromium (screenshot), not only by reading the HTML.

### `geometry`, points, segments and arcs in a coordinate frame

```json
{ "kind": "geometry", "points": { "A": [0, 0], "B": [4, 0], "C": [1, 3] },
  "segments": [ { "a": "A", "b": "B", "ticks": 1 }, { "a": "B", "b": "C", "ticks": 1 }, { "a": "C", "b": "A", "dashed": true } ],
  "angles": [ { "vertex": "A", "a": "B", "b": "C", "label": "45°" } ] }
```

- `points` maps a name to `[x, y]` (y up). Names are drawn as labels. A name that starts with `_` is a
  hidden point: it takes part in the layout but draws no dot or label.
- `segments`: endpoints are point names or `[x, y]`. `ticks` (0 to 3) marks equal sides. `dashed`, `label`.
- `polygons` (`vertices`), `circles` (`center`, `r`), `ellipses` (`center`, `rx`, `ry`), `arcs`
  (`center`, `r`, `from`, `to` in degrees), `angles` (`vertex`, `a`, `b`, `label`, `r`) and `labels`
  (`at`, `text`, `anchor`). Dashed outlines take `dashed: true`.
- The drawing is scaled to fit the frame. No axes are drawn.

### `table` with spans

Cells in `rows` (and `headers`, if given) are strings, or objects `{ "text", "colspan", "rowspan", "header" }`.
Each row must cover the table width exactly. `headers`, if given, is the first row. Without `headers`,
the first row sets the width.

### `diagram`, a free vector scene

For anything no chart kind covers: experiment set-ups, apparatus, maps, routes, cells, simple sketches.
Coordinates are SVG units with y growing downward. The view fits the shapes unless `view` is given.

```json
{ "kind": "diagram", "title": "Montaje", "view": [0, 0, 200, 120],
  "shapes": [
    { "type": "rect", "x": 10, "y": 80, "w": 180, "h": 30, "fill": "hatch" },
    { "type": "circle", "cx": 60, "cy": 60, "r": 14, "fill": "white" },
    { "type": "line", "x1": 60, "y1": 74, "x2": 60, "y2": 40, "arrow": "end", "dash": true },
    { "type": "polyline", "points": [[100, 40], [150, 40], [150, 80]] },
    { "type": "polygon", "points": [[20, 20], [40, 20], [30, 5]], "fill": "dots" },
    { "type": "path", "d": "M 20 100 Q 60 120 100 100", "extent": [[20, 100], [100, 110]] },
    { "type": "text", "x": 60, "y": 30, "text": "agua", "size": 12, "anchor": "middle" }
  ] }
```

- Shape types: `rect` (x, y, w, h, optional rx), `circle` (cx, cy, r), `ellipse` (cx, cy, rx, ry),
  `line` (x1, y1, x2, y2), `polyline` and `polygon` (points, at least 2 and 3), `path` (d, plus `extent`
  to fit the view), `text` (x, y, text, optional size, anchor, weight, rotate).
- Style on any shape: `stroke` is black; `width` (default 1.6); `dash: true` for dashed lines;
  `fill` one of `none` (default), `solid`, `white`, `hatch`, `dots`.
- `arrow` on `line` or `polyline`: `end`, `start` or `both`.
- Text is escaped; write the characters as they appear.

## Axes

Set `domain: [lo, hi]` on an axis to widen the drawn scale past the printed range (for example to
hold a point at -0.5) without drawing ticks outside `min`..`max`. Category labels rotate when they
would collide, and the plot leaves room for them below the axis.

Every chart axis needs a `label` (axis title). `validate` reports a missing title as an error.
`x` and `y` objects accept `label`, `min`, `max` and `step`. If `min`, `max` or `step` is missing,
the renderer picks a nice range from the data. Bar and line `y` axes start at zero unless `min` says
otherwise. Negative bar values are rejected.

## Option-level figures

Many ICFES questions have a chart in each answer option. Those figures sit in the same spec file
as the stem figures, with the question number and option letter in `location`:

```json
{ "id": "k1-q2-opt-A",
  "location": { "page": 2, "question": 2, "stem_or_option": "option", "option": "A" },
  "kind": "bar", "spec": { "kind": "bar", "...": "..." }, "fidelity": "draft" }
```

- `stem_or_option` is `"stem"` for a figure in the question text and `"option"` for an answer choice.
- Option figures are keyed by `question` plus `option`, so a question can have one figure per letter.

## Not supported yet

Horizontal bars, stacked bars, histograms, number lines, Venn and tree diagrams, and function graphs.
Geometry figures use `geometry`; anything else drawn with lines and shapes uses `diagram`.
The `kind: "image"` crop is no longer used for new figures. Each new kind needs a fixture test.

## Validation

`validate(spec)` returns a list of error strings. `render(spec)` throws on invalid input, so
the caller should fall back to the crop and mark the question for review.
