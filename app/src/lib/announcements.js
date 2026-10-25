// Anuncios per subject class (migration 0026). Pure helpers shared by the teacher card and the student screens.

// The ones still in force: not expired, pinned first, then newest. `courseIds` narrows them to some classes.
export function activeAnnouncements(rows, { courseIds = null, now = Date.now() } = {}) {
  const ids = courseIds ? new Set(courseIds) : null;
  return (rows ?? [])
    .filter((r) => (!ids || ids.has(r.course_id)) && (!r.expires_at || Date.parse(r.expires_at) > now))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.created_at).localeCompare(String(a.created_at)));
}

// One notice sent to several classes is one row per class: show it once, with every class it went to.
export function groupSent(rows) {
  const out = [];
  for (const r of rows) {
    const same = out.find((o) => o.title === r.title && o.body === r.body && Math.abs(Date.parse(o.created_at) - Date.parse(r.created_at)) < 60000);
    if (same) { same.ids.push(r.id); same.courseIds.push(r.course_id); } else out.push({ ...r, ids: [r.id], courseIds: [r.course_id] });
  }
  return out;
}

// "hace 5 min", "ayer", "12 oct".
export function whenText(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.round((now - t) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  if (h < 48) return "ayer";
  return new Date(t).toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(" de ", " ");
}
