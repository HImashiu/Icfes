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
- Legend entries come from each series' `name`. A series with no name gets no entry, so nothing is invented. Set `"legend": ["text", ...]` (one per series, `""` hides one) to print exactly the entries the scan shows.
- A single series with no name draws no legend. `legend: false` on any chart hides the legend even with several series (use it when the scan prints none).

- A series can set `"pattern"` to a print grey: `lightgrey`, `grey` (mid) or `darkgrey`. The other patterns are `hatch`, `solid`, `white`, `dots`, `vhatch`, `hhatch`, `xhatch`, `sparse` and `dense`. Any other value fails validation.

### `line`, a line over categorical x

```json
{ "kind": "line", "categories": ["Ene", "Feb", "Mar"], "series": [ { "name": "Ventas", "values": [4, null, 7] } ] }
```

- `null` leaves a gap, and the line breaks there. Lines are solid unless a series sets `"style": "dashed"`.
- Set `"marker"` per series to `"circle"` (default), `"square"`, `"triangle"`, `"dot"` (filled circle),
  `"star"`, `"diamond"` or `"cross"`, so series stay apart in grey-scale print. `"none"` draws the line with no point markers, for prints that show a bare curve (line and curve only). On line charts the legend
  shows each series' marker in place of its colour swatch, so the marker is the key.

### `line` with numeric x

```json
{ "kind": "line", "x": { "label": "Tiempo (h)", "min": -1, "max": 10, "step": 1 }, "y": { "label": "%", "min": 0, "max": 100, "step": 10 },
  "series": [ { "name": "Aluminio", "points": [[0.5, 4], [1.5, 8], [9.5, 70]] } ] }
```

- Use `points` instead of `categories` when the x values are uneven numbers (for example time at
  half hours). Each point sits at its real x.

- A series can carry a printed `note` on one of its points, for example a label on a dashed reference line. `noteAt` is the point index (default: the middle point), and `noteSide` is `above` (default), `right` or `left` of it. A note is text on the plot and never a legend entry.

### `scatter`, points on numeric axes

```json
{ "kind": "scatter", "x": { "label": "Horas", "min": 0, "max": 10, "step": 2 }, "y": { "label": "Nota" },
  "series": [ { "points": [[1, 2], [4, 6.5]] } ] }
```

- Set `"marker"` on a series (any marker that `line` takes, such as `diamond` or `square`) to draw that shape for its points. Without one, series alternate a filled circle and square. Markers show in the legend.

### `curve`, a qualitative shape with no scale

```json
{ "kind": "curve", "x": { "label": "Eje horizontal" }, "y": { "label": "Eje vertical" },
  "series": [ { "name": "Línea 1", "label": "Línea 1", "labelAt": 1, "style": "dashed", "points": [[0, 0.7], [0.6, 0.7], [1, 0.35]] } ] }
```

- For graphs that show only the shape. The points are sketch positions, with no tick values drawn.
- Points are joined with a smooth curve. `label` is printed near point `labelAt` (default: middle).

- `"ticks": true` on an axis prints its tick values, from that axis' `min`, `max` and `step`, as the other charts do. Without it a curve stays shape-only.

- `"inverted": true` on a `line` or `curve` draws a dark panel with light strokes and text, for prints that are black with white lines. The grid turns dark grey. Only `line` and `curve` take it.

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
- `"percent": false` hides the percent, and `"values": false` hides the number, when the scan prints none. Ten slices keep distinct print fills (`hatch`, `solid`, `white`, `dots`, `vhatch`, `hhatch`, `xhatch`, `sparse`, `dense`, `grey`).
- Nested rings: give `rings` instead of `slices`, outer ring first, 1 to 3 rings. Each ring has its own
  `slices` (same fields) and an optional `name`, which prefixes its legend entries. Each ring has its own
  percentages. A ring of rings is drawn as a donut with a hole in the middle.

```json
{ "kind": "pie", "rings": [
  { "name": "Interno", "slices": [ { "label": "A", "value": 1 }, { "label": "B", "value": 3 } ] },
  { "name": "Externo", "slices": [ { "label": "C", "value": 2 }, { "label": "D", "value": 2 }, { "label": "E", "value": 4 } ] }
] }
```

### `table`, rendered as an HTML table

```json
{ "kind": "table", "title": "Resultados", "headers": ["Año", "Total"], "rows": [["2019", "12"], ["2020", "30"]] }
```

- Cells are strings (or span objects, below), so they keep the exam's formatting (for example "1.200" or "12,5 %").
- Empty cells stay empty. Copy the scan as printed; do not fill gaps.
- `TABLE_CSS` is exported, so a page can style the table the same way in a browser.
- Table rendering is checked in Chromium (screenshot), not only by reading the HTML.

- Wide tables fit their width: the font steps down from 14 px to `minSize` (default 10 px) until the table fits `maxWidth` (default 640 px), and long cell text wraps. Set `maxWidth` or `minSize` to change either.

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
- `polygons` take `"fill"`: `none` (default), `solid`, `white`, `hatch` or `dots`.
- An arc runs counter-clockwise, as the angles increase, from `from` to `to`. An arc from 0 to 180 is the upper half.
- The drawing is scaled to fit the frame. No axes are drawn.

### `table` with spans

Cells in `rows` (and `headers`, if given) are strings, or objects `{ "text", "colspan", "rowspan", "header" }`.
Each row must cover the table width exactly. `headers`, if given, is the first row. Without `headers`,
the first row sets the width.

### `bar` horizontal

Set `"orientation": "horizontal"` on a `bar` figure. Categories run down the left, and `y` is the value
axis across the bottom. Grouping and patterns work as in the vertical version. Bars take no `null`.

### `line` with `area`

Set `"area": true` on a `line` series to fill the space under it with the series pattern. Each run of
non-null values is closed on the zero baseline. A single point after a gap draws nothing.

### `combo`, bars and lines on one category axis

For charts where bars and a line share the same categories, such as spending bars with an income line.
Each series has a `type`: `bar` (grouped among the bars) or `line` (passes through the category centres,
`null` leaves a gap). A series with `axis: 2` is read against `y2`, which needs its own label.

```json
{ "kind": "combo", "title": "Gasto e ingreso",
  "x": { "label": "Mes" }, "y": { "label": "Gasto (miles)" },
  "y2": { "label": "Ingreso (miles)", "min": 0, "max": 100, "step": 20 },
  "categories": ["Ene", "Feb", "Mar"],
  "series": [
    { "name": "Gasto", "type": "bar", "values": [40, 55, 30] },
    { "name": "Ingreso", "type": "line", "values": [60, 70, null], "axis": 2, "marker": "square" }
  ] }
```

Bars keep the grey-scale patterns of the `bar` kind. Lines use the `marker` and `style` options of `line`.

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
- Boxed text: give a `text` shape `maxWidth` to wrap its words onto several lines, and `maxHeight` to shrink
  the font (one point at a time, from `size` down to `minSize`, default 7) until the block fits. The block is
  centred on `y`. Text that still does not fit is flagged by `F.textOverflows(spec)` and by the audit; it is never
  cut off silently. Use boxed text for comic bubbles, infographic labels and anything inside a shape.
- The audit also flags option figures in one question that are the same or at least 95% alike, comparing
  the specs token by token in order (title ignored), and diagram text boxes that overlap by more than 20%.
- `options_verified: true` on option figures means a batch thread checked them against a 300 dpi scan and they
  really do differ as printed. When both figures of a pair carry it, the audit lists the pair under
  "Verified similar options" and does not flag it.
- `text_only: true` on a figure entry marks a sign, ad or poster that is really text in a frame. The audit
  skips the photo stand-in flag for it and lists it under "Text-only figures" for a spot check, so the label
  is not used to hide real drawings.
- `audit.js <specs-dir> [out.md]` reports per exam: figure counts by kind, pending items, validation and render
  failures, boxed text that does not fit, unboxed text that runs outside its view, and diagrams with one or two
  boxes and no line work (possible photo stand-ins).

## Axes
### `map`, bundled outlines of Colombia, South America, the world and Europe in periods

`region` names a bundled outline: `colombia-departamentos` (33 departments), `colombia-pais`, `sudamerica`
or `mundo` (all countries, with a `continent` field, so Europe is `mundo` with `select` on its names).
Optional: `select` (areas to fit the frame to), `fills` (area name to a fill name or a hex grey like
`#bbbbbb`), `points` (`lon`, `lat`, `label`, `marker`), `labels` (`lon`, `lat`, `text`), `legend`
(`label`, `fill`). Coordinates are longitude and latitude; the projection is equirectangular with a
cosine correction, fitted to `select` or to the whole region.

Source and licence: Natural Earth (naturalearthdata.com), public domain. Taken from
github.com/nvkelso/natural-earth-vector: `ne_10m_admin_1_states_provinces` for the departments and
`ne_110m_admin_0_countries` for the countries. Simplified with Douglas-Peucker (0.02 degrees for the
departments, 0.25 for the countries). The build script is `maps/build_maps.py`; the outputs are in `maps/`.

#### Period borders: `region` `europa`

`europa` holds Europe, the former USSR and Turkey (Natural Earth 110m countries), with Germany split into its 16
Länder (Natural Earth 10m admin-1). It also holds named unions that are dissolved into one shape each, so a
period border fills as one region. Each union has `merged: true` and a `members` list. The unions are in
`maps/europa-merges.json` and are built by `maps/build_europa.py` (needs shapely; the outputs are `maps/europa.json`).

- `URSS` (15 republics), `Yugoslavia`, `Checoslovaquia`, `Alemania Oriental` (the eastern Länder and Berlin),
  `Alemania Occidental`, `Austria-Hungría (aprox.)`.
- Add a union by adding a line to `europa-merges.json` and rebuilding. Members must be names from the
  Natural Earth data, as the build script reports them.
- Unions are built ahead of time, not at render time: neighbouring Natural Earth polygons do not share exactly the
  same edges, so joining them in the renderer would leave seams.
- `bounds`: `[minLon, minLat, maxLon, maxLat]` sets the view instead of the fit to the whole region. The shapes are
  clipped to the plot, so a view that runs past the frame does not cover the title or legend.
- `legend` entries wrap onto further rows when they reach the right edge.

Cold War Europe, as an example:

```json
{ "kind": "map", "region": "europa", "title": "Europa en la guerra fría (1955-1989)",
  "bounds": [-12, 35, 42, 62],
  "fills": { "URSS": "#666666", "Yugoslavia": "#222222", "Checoslovaquia": "#bbbbbb",
             "Alemania Oriental": "#999999", "Alemania Occidental": "#dddddd" },
  "legend": [ { "fill": "#666666", "label": "URSS" }, { "fill": "#222222", "label": "Yugoslavia" },
              { "fill": "#bbbbbb", "label": "Checoslovaquia" }, { "fill": "#999999", "label": "Alemania Oriental" },
              { "fill": "#dddddd", "label": "Alemania Occidental" } ] }
```

### Line styles

`style` on a `line`, `curve` or numeric `line` series: `solid` (default), `dashed` or `dotted`.
Use dotted and dashed together when two series need telling apart in grey-scale.

### Axis options

- `scale`: `linear` (default) or `log`. A log axis needs positive `min`, `max` and data. Each decade gets one tick
  (1, 10, 100, ...), so bounds snap to powers of ten. Works on the y axis of `line` with numeric x, and `scatter`.
- `format`: `plain` keeps integers ungrouped (1995, not 1.995). `grouped` forces Spanish thousands dots.
  Without `format`, an axis whose label contains "año" or "year" is plain; all other axes are grouped.


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

Stacked bars, histograms, log scales, number lines, Venn and tree diagrams, and function graphs.
Geometry figures use `geometry`; anything else drawn with lines and shapes uses `diagram`.
The `kind: "image"` crop is no longer used for new figures. Each new kind needs a fixture test.

## Validation

`validate(spec)` returns a list of error strings. `render(spec)` throws on invalid input, so
the caller should fall back to the crop and mark the question for review.
