// A stand-in for the Supabase client that keeps every table in memory. createApi() runs on top of it unchanged,
// so the teacher screens read and write exactly as they do with a real backend, and nothing leaves the browser.
// Only the calls the app makes are supported; anything else answers with an error the screens already handle.
const PK = { paper_seating: "assignment_id", grading_models: "id" };
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
        if (!row.created_at) row.created_at = new Date().toISOString();
        if (this.table === "assignments") row.courses = { name: this.db.tables.courses.find((c) => c.id === row.course_id)?.name ?? "" };
        rows.push(row);
        return row;
      }).filter(Boolean);
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
  const db = { tables, seq: 0 };
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
    revoke_family_report: () => null,
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
