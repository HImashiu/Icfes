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
accents. Numbers print with a decimal comma.

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

- `null` leaves a gap, and the line breaks there. The second series is drawn dashed.

### `scatter`, points on numeric axes

```json
{ "kind": "scatter", "x": { "label": "Horas", "min": 0, "max": 10, "step": 2 }, "y": { "label": "Nota" },
  "series": [ { "points": [[1, 2], [4, 6.5]] } ] }
```

### `pie`, a circle split into slices

```json
{ "kind": "pie", "slices": [ { "label": "Mujeres", "value": 1 }, { "label": "Hombres", "value": 3 } ] }
```

- Values are relative; the renderer shows each value and its percent of the total.

### `table`, rendered as an HTML table

```json
{ "kind": "table", "title": "Resultados", "headers": ["Año", "Total"], "rows": [["2019", "12"], ["2020", "30"]] }
```

- Cells are strings, so they keep the exam's formatting (for example "1.200" or "12,5 %").

## Axes

`x` and `y` objects accept `label`, `min`, `max` and `step`. If `min`, `max` or `step` is missing,
the renderer picks a nice range from the data. Bar and line `y` axes start at zero unless `min` says
otherwise. Negative bar values are rejected.

## Not supported yet

Horizontal bars, stacked bars, histograms, number lines, Venn and tree diagrams, geometry figures,
and function graphs. Each of these stays an image until a kind is added here with a fixture.

## Validation

`validate(spec)` returns a list of error strings. `render(spec)` throws on invalid input, so
the caller should fall back to the crop and mark the question for review.
