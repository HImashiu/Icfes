// Where the teacher's answers to progress alerts live ("Listo", "Posponer", already seen). With migration 0027 they
// are in the database (teacher_alert_states, one row per teacher and alert), so they follow the teacher to any device;
// before that, in this browser. Independent from the workspace store, so a missing 0027 never affects 0014.
const DAY = 864e5;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

export function createAlertStore({ api, userId, storage = globalThis.localStorage }) {
  const key = `condor:alerts:${userId ?? "anon"}`;
  let mode = typeof api?.wsList === "function" ? "db" : "local";
  let rows = new Map();
  const readLocal = () => { try { return new Map(Object.entries(JSON.parse(storage?.getItem(key) ?? "{}"))); } catch { return new Map(); } };
  const writeLocal = () => { try { storage?.setItem(key, JSON.stringify(Object.fromEntries(rows))); } catch { /* storage blocked */ } };
  const run = async (dbFn) => {
    if (mode !== "db") return;
    try { await dbFn(); } catch (e) {
      if (e.code !== "missing") throw e;
      mode = "local";
      const mine = readLocal();
      for (const [k, v] of rows) if (!mine.has(k)) mine.set(k, v);
      rows = mine;
    }
  };
  const store = {
    get mode() { return mode; },
    get states() { return rows; },
    async load() {
      if (mode === "db") {
        try {
          const list = await api.wsList("teacher_alert_states", { teacher_id: userId });
          rows = new Map(list.map((r) => [r.alert_id, { sig: r.sig, state: r.state, until: r.until }]));
          return rows;
        } catch (e) {
          if (e.code !== "missing") throw e;
          mode = "local";
        }
      }
      rows = readLocal();
      return rows;
    },
    // list: [{ id, sig }]. state: "done" | "snoozed" | "seen". days: for "snoozed".
    async set(list, state, { days = 7, now = Date.now() } = {}) {
      if (!list.length) return rows;
      const until = state === "snoozed" ? isoDay(now + days * DAY) : null;
      const next = list.map((a) => ({ teacher_id: userId, alert_id: a.id, sig: String(a.sig ?? ""), state, until }));
      for (const r of next) rows.set(r.alert_id, { sig: r.sig, state: r.state, until: r.until });
      rows = new Map(rows);
      await run(() => api.wsUpsert("teacher_alert_states", next, "teacher_id,alert_id"));
      if (mode === "local") writeLocal();
      return rows;
    },
    async clear(id) {
      rows.delete(id);
      rows = new Map(rows);
      await run(() => api.wsDelete("teacher_alert_states", { teacher_id: userId, alert_id: id }));
      if (mode === "local") writeLocal();
      return rows;
    },
  };
  return store;
}
