// A stand-in for the Supabase client that keeps every table in memory. createApi() runs on top of it unchanged,
// so the teacher screens read and write exactly as they do with a real backend, and nothing leaves the browser.
// Only the calls the app makes are supported; anything else answers with an error the screens already handle.
import { AREAS, AREA_SUBJECT, areaOf, groupOf } from "../lib/teaching.js";

const PK = { paper_seating: "assignment_id", grading_models: "id", school_settings: "school_id" };
const SCHOOL_TABLES = new Set(["school_groups", "subject_access", "school_settings", "staff_invites", "school_audit"]);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

class Query {
  constructor(db, table) {
    Object.assign(this, { db, table, op: "select", filters: [], orderBy: null, max: null, one: null, wantBack: false, payload: null, opts: {} });
  }
  select() { if (this.op !== "select") this.wantBack = true; return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; }
  upsert(p, opts = {}) { this.op = "upsert"; this.payload = p; this.opts = opts; return this; }
  update(p) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, list) { this.filters.push((r) => list.includes(r[c])); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  not(c, op, v) { if (op === "is") this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v)); return this; }
  order(c, { ascending = true } = {}) { this.orderBy = [c, ascending]; return this; }
  limit(n) { this.max = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }

  run() {
    const rows = this.db.tables[this.table];
    if (!rows) return { data: null, error: { message: `relation "${this.table}" does not exist`, code: "42P01" } };
    const match = (r) => this.filters.every((f) => f(r));
    let out;
    if (this.op === "select") out = rows.filter(match);
    else if (this.op === "delete") { this.db.tables[this.table] = rows.filter((r) => !match(r)); out = []; }
    else if (this.op === "update") { out = rows.filter(match); out.forEach((r) => Object.assign(r, clone(this.payload))); }
    else {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const conflict = (this.opts.onConflict ?? PK[this.table] ?? "id").split(",");
      out = list.map((p) => {
        const row = clone(p);
        const hit = this.op === "upsert" && rows.find((r) => conflict.every((c) => c in row && r[c] === row[c]));
        if (hit) {
          if (this.opts.ignoreDuplicates) return null;
          return Object.assign(hit, row);
        }
        if (row.id == null && !(this.table in PK && PK[this.table] !== "id")) row.id = `demo-${this.table}-${++this.db.seq}`;
        // Column defaults the database fills in (school_id = my_school(), actor = auth.uid(), access = 'edit').
        if (this.db.schoolId && row.school_id == null && SCHOOL_TABLES.has(this.table)) row.school_id = this.db.schoolId;
        if (this.table === "course_members" && row.role === "teacher" && !row.access) row.access = "edit";
        if (!row.created_at) row.created_at = new Date().toISOString();
        if (this.table === "assignments") row.courses = { name: this.db.tables.courses.find((c) => c.id === row.course_id)?.name ?? "" };
        rows.push(row);
        return row;
      }).filter(Boolean);
      if (out.length) this.db.afterInsert?.(this.table, out);
    }
    if (this.orderBy) {
      const [c, asc] = this.orderBy;
      out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
    }
    if (this.max != null) out = out.slice(0, this.max);
    out = clone(out);
    if ((this.op === "insert" || this.op === "update" || this.op === "upsert" || this.op === "delete") && !this.wantBack && !this.one) return { data: null, error: null };
    if (this.one === "single") return out.length ? { data: out[0], error: null } : { data: null, error: { message: "No encontrado", code: "PGRST116" } };
    if (this.one === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
}

const OFF = "Esta función no está disponible en la demostración.";

// `scope` stands in for row-level security on the student side: { table: (row) => visible }.
export function createDemoClient({ tables, profile, scope = {}, extraRpc = {} }) {
  const db = { tables, seq: 0, schoolId: profile.school_id ?? null };
  const lower = (x) => String(x ?? "").trim().toLowerCase();
  // Migration 0025 in memory: a curso's subject classes share its students.
  const cursoOf = (c) => groupOf(c);
  const subjectSiblings = (c) => tables.courses.filter((x) => x.id !== c.id && areaOf(x) && cursoOf(x).key === cursoOf(c).key && cursoOf(c).label);
  db.afterInsert = (table, rows) => {
    if (table !== "course_members") return;
    for (const r of rows.filter((x) => x.role === "student")) {
      const c = tables.courses.find((x) => x.id === r.course_id);
      if (!c) continue;
      for (const sib of subjectSiblings(c)) {
        if (tables.course_members.some((m) => m.course_id === sib.id && lower(m.email) === lower(r.email))) continue;
        tables.course_members.push({ ...r, id: `demo-course_members-${++db.seq}`, course_id: sib.id });
      }
    }
  };
  const completeCurso = ({ p_grade, p_label }) => {
    const grade = String(p_grade);
    const label = String(p_label).trim().toUpperCase();
    const key = `${grade}|${label}`;
    if (!label) return 0;
    const groups = (tables.school_groups ??= []);
    if (!groups.some((g) => String(g.grade) === grade && g.label === label)) groups.push({ id: `demo-school_groups-${++db.seq}`, school_id: db.schoolId, grade, label, created_at: new Date().toISOString() });
    let made = 0;
    for (const area of AREAS) {
      if (tables.courses.some((c) => cursoOf(c).key === key && areaOf(c) === area)) continue;
      const subject = AREA_SUBJECT[area];
      tables.courses.push({ id: `demo-courses-${++db.seq}`, school_id: db.schoolId, name: `${subject} ${grade} ${label}`, grade, year: new Date().getFullYear(), subject, group_label: label, created_by: profile.id, created_at: new Date().toISOString() });
      made += 1;
    }
    const inCurso = tables.courses.filter((c) => cursoOf(c).key === key);
    const ids = new Set(inCurso.map((c) => c.id));
    const students = new Map();
    for (const m of tables.course_members) if (ids.has(m.course_id) && m.role === "student" && !students.has(lower(m.email))) students.set(lower(m.email), m);
    for (const c of inCurso.filter((x) => areaOf(x))) {
      for (const [email, m] of students) {
        if (tables.course_members.some((x) => x.course_id === c.id && lower(x.email) === email)) continue;
        tables.course_members.push({ id: `demo-course_members-${++db.seq}`, course_id: c.id, profile_id: m.profile_id ?? null, email: m.email, full_name: m.full_name, role: "student" });
      }
    }
    return made;
  };
  const rpc = {
    school_teacher_code: () => "DEMO-0000",
    link_my_roster: () => null,
    set_profile_role: ({ p_profile, p_role }) => {
      const row = tables.profiles.find((r) => r.id === p_profile);
      if (row) row.role = p_role;
      return row ?? null;
    },
    paper_submit: ({ p_assignment, p_member, p_answers, p_score }) => {
      tables.attempts.push({ profile_id: null, member_id: p_member, client_id: `paper-${p_member}`, assignment_id: p_assignment, mode: "timed", submitted_at: new Date().toISOString(), score: p_score, answers: p_answers });
      return null;
    },
    create_family_report: () => "demostracion",
    // Colegio (migration 0020), same rules as the SQL functions.
    invite_staff: ({ p_rows }) => (p_rows ?? []).map((r) => {
      const email = lower(r.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === lower(profile.email)) return { email, status: "skipped" };
      const role = r.role === "school_admin" ? "school_admin" : "teacher";
      const person = tables.profiles.find((p) => lower(p.email) === email);
      const list = (tables.staff_invites ??= []);
      const hit = list.find((i) => i.email === email);
      if (hit) Object.assign(hit, { role, full_name: r.name || hit.full_name });
      else list.push({ id: `demo-staff_invites-${++db.seq}`, school_id: db.schoolId, email, full_name: r.name ?? "", role, created_at: new Date().toISOString(), accepted_at: person ? new Date().toISOString() : null });
      (tables.school_audit ??= []).push({ id: `demo-school_audit-${++db.seq}`, school_id: db.schoolId, actor: profile.id, action: "invite", detail: { email, role }, created_at: new Date().toISOString() });
      if (person) { person.role = role; return { email, status: "updated" }; }
      return { email, status: "invited" };
    }),
    update_school_name: ({ p_name }) => { const sc = tables.schools?.[0]; if (sc) sc.name = String(p_name).trim(); return sc?.name ?? null; },
    regenerate_teacher_code: () => `DEMO-${Math.floor(1000 + Math.random() * 9000)}`,
    revoke_family_report: () => null,
    complete_curso: completeCurso,
    ...extraRpc,
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: profile.id } } }),
      getSession: async () => ({ data: { session: { user: { id: profile.id } } } }),
    },
    from: (table) => {
      const q = new Query(db, table);
      if (scope[table]) q.filters.push(scope[table]);
      return q;
    },
    rpc: async (name, args) => {
      const fn = rpc[name];
      if (!fn) return { data: null, error: { message: OFF } };
      return { data: clone(fn(args ?? {})), error: null };
    },
  };
}
