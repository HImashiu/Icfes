// Where the workspace keeps what teachers add: statuses, follow-up flags, groups, notes and saved views.
// With migration 0014 it lives in the database (shared by the school's teachers, filtered by row-level security);
// before that, in this browser only, so the features already work for a demo. `mode` says which one is in use.
import { emailKey } from "./workspace.js";

export const SUGGESTED_STATUSES = [
  { label: "Al día", color: "#5ED3B4" },
  { label: "En observación", color: "#FFB547" },
  { label: "Necesita apoyo", color: "#FF7F6E" },
  { label: "Con plan de refuerzo", color: "#8AB4FF" },
  { label: "Avanza muy bien", color: "#C8F04A" },
];
export const SWATCHES = ["#C8F04A", "#5ED3B4", "#8AB4FF", "#C79BFF", "#F59EC4", "#FFB547", "#FF7F6E", "#A7B1AA"];

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const empty = () => ({ statuses: [], flags: [], groups: [], groupMembers: [], notes: [], views: [] });

function localStore(key, storage) {
  const read = () => {
    try { return { ...empty(), ...JSON.parse(storage?.getItem(key) ?? "{}") }; } catch { return empty(); }
  };
  const write = (data) => {
    try { storage?.setItem(key, JSON.stringify(data)); } catch { /* storage blocked: keep working in memory */ }
  };
  return { read, write };
}

export function createWorkspaceStore({ api, schoolId, userId, userName = "", storage = globalThis.localStorage, onChange = () => {} }) {
  const local = localStore(`condor:ws:${schoolId ?? "demo"}:${userId ?? "anon"}`, storage);
  let mode = typeof api?.wsList === "function" ? "db" : "local";
  let data = empty();

  const snapshot = () => ({
    mode,
    statuses: [...data.statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.label).localeCompare(String(b.label), "es")),
    flags: new Map(data.flags.map((f) => [f.email, f])),
    groups: [...data.groups].sort((a, b) => String(a.name).localeCompare(String(b.name), "es")),
    groupMembers: data.groupMembers,
    views: data.views,
  });
  const changed = () => {
    if (mode === "local") local.write(data);
    const s = snapshot();
    onChange(s);
    return s;
  };
  // Runs the database call; on "table missing" switches to this browser for good and runs the local version.
  const run = async (dbFn, localFn) => {
    if (mode === "db") {
      try { return await dbFn(); } catch (e) {
        if (e.code !== "missing") throw e;
        mode = "local";
        data = local.read();
      }
    }
    return localFn();
  };

  const store = {
    get state() { return snapshot(); },
    async load() {
      await run(async () => {
        const [statuses, flags, groups, groupMembers, views] = await Promise.all([
          api.wsList("student_statuses"), api.wsList("student_flags"), api.wsList("student_groups"), api.wsList("student_group_members"), api.wsList("saved_views"),
        ]);
        data = { ...empty(), statuses, flags, groups, groupMembers, views };
      }, () => { data = local.read(); });
      return changed();
    },

    // patch: any of status_id, follow_up, follow_up_due, follow_up_reason. Applied to every email.
    async setFlags(emails, patch) {
      const keys = [...new Set(emails.map(emailKey))].filter(Boolean);
      if (!keys.length) return snapshot();
      const merge = (rows) => {
        const byEmail = new Map(data.flags.map((f) => [f.email, f]));
        for (const r of rows) byEmail.set(r.email, { ...byEmail.get(r.email), ...r });
        data.flags = [...byEmail.values()];
      };
      await run(async () => merge(await api.wsUpsert("student_flags", keys.map((email) => ({ school_id: schoolId, email, ...patch })), "school_id,email")),
        () => merge(keys.map((email) => ({ school_id: schoolId, email, ...patch, updated_at: new Date().toISOString() }))));
      return changed();
    },

    async saveStatus({ id, label, color, position }) {
      const row = { label: label.trim().slice(0, 40), color, position: position ?? data.statuses.length };
      await run(async () => {
        const saved = id ? await api.wsUpdate("student_statuses", id, row) : await api.wsInsert("student_statuses", { ...row, school_id: schoolId });
        data.statuses = [...data.statuses.filter((s) => s.id !== saved.id), saved];
      }, () => {
        const saved = { ...data.statuses.find((s) => s.id === id), ...row, id: id ?? uid(), school_id: schoolId };
        data.statuses = [...data.statuses.filter((s) => s.id !== saved.id), saved];
      });
      return changed();
    },
    async deleteStatus(id) {
      await run(() => api.wsDelete("student_statuses", { id }), () => {});
      data.statuses = data.statuses.filter((s) => s.id !== id);
      data.flags = data.flags.map((f) => (f.status_id === id ? { ...f, status_id: null } : f));
      return changed();
    },
    async seedStatuses() {
      for (const [i, s] of SUGGESTED_STATUSES.entries()) {
        if (!data.statuses.some((x) => x.label === s.label)) await store.saveStatus({ ...s, position: i });
      }
      return snapshot();
    },

    async saveGroup({ id, name, color, course_id = null }) {
      const row = { name: name.trim().slice(0, 60), color, course_id: course_id || null };
      await run(async () => {
        const saved = id ? await api.wsUpdate("student_groups", id, row) : await api.wsInsert("student_groups", { ...row, school_id: schoolId, created_by: userId });
        data.groups = [...data.groups.filter((g) => g.id !== saved.id), saved];
      }, () => {
        const saved = { ...data.groups.find((g) => g.id === id), ...row, id: id ?? uid(), school_id: schoolId, created_by: userId, created_at: new Date().toISOString() };
        data.groups = [...data.groups.filter((g) => g.id !== saved.id), saved];
      });
      return changed();
    },
    async deleteGroup(id) {
      await run(() => api.wsDelete("student_groups", { id }), () => {});
      data.groups = data.groups.filter((g) => g.id !== id);
      data.groupMembers = data.groupMembers.filter((m) => m.group_id !== id);
      return changed();
    },
    async addToGroup(groupId, emails) {
      const keys = [...new Set(emails.map(emailKey))].filter((e) => e && !data.groupMembers.some((m) => m.group_id === groupId && m.email === e));
      if (!keys.length) return snapshot();
      const rows = keys.map((email) => ({ group_id: groupId, email }));
      await run(() => api.wsUpsert("student_group_members", rows, "group_id,email"), () => {});
      data.groupMembers = [...data.groupMembers, ...rows];
      return changed();
    },
    async removeFromGroup(groupId, emails) {
      const keys = emails.map(emailKey);
      await run(() => api.wsDelete("student_group_members", { group_id: groupId, email: keys }), () => {});
      data.groupMembers = data.groupMembers.filter((m) => !(m.group_id === groupId && keys.includes(m.email)));
      return changed();
    },

    // Notes are read per student when a profile opens.
    async notes(email) {
      const key = emailKey(email);
      const list = await run(() => api.wsList("student_notes", { school_id: schoolId, email: key }), () => data.notes.filter((n) => n.email === key));
      return [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    },
    async addNote(email, body) {
      const row = { school_id: schoolId, email: emailKey(email), body: body.trim().slice(0, 4000), author_id: userId, author_name: userName || null };
      return run(() => api.wsInsert("student_notes", row), () => {
        const saved = { ...row, id: uid(), created_at: new Date().toISOString() };
        data.notes = [...data.notes, saved];
        local.write(data);
        return saved;
      });
    },
    async deleteNote(id) {
      await run(() => api.wsDelete("student_notes", { id }), () => { data.notes = data.notes.filter((n) => n.id !== id); local.write(data); });
    },

    async saveView(name, filters) {
      const row = { name: name.trim().slice(0, 60), filters };
      await run(async () => {
        const saved = await api.wsInsert("saved_views", { ...row, profile_id: userId });
        data.views = [...data.views, saved];
      }, () => { data.views = [...data.views, { ...row, id: uid(), created_at: new Date().toISOString() }]; });
      return changed();
    },
    async deleteView(id) {
      await run(() => api.wsDelete("saved_views", { id }), () => {});
      data.views = data.views.filter((v) => v.id !== id);
      return changed();
    },
  };
  return store;
}
