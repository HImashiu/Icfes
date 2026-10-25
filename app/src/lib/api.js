// All reads and writes to the backend, in one place. `client` is a Supabase client (injected so tests can fake it).
// Row-level security decides what each role can see; nothing here trusts the browser to filter.
// A table that is not there yet (its migration has not run): Postgres 42P01 or PostgREST's schema cache miss.
export const isMissingTable = (error) => error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache/i.test(error?.message ?? "");

const MISSING_0020 = "Falta ejecutar la migración 0020 (cursos, permisos e invitaciones) en Supabase.";

export function createApi(client) {
  const unwrap = ({ data, error }) => {
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  };

  const unwrapWs = (res) => {
    if (res.error && isMissingTable(res.error)) throw Object.assign(new Error(res.error.message), { code: "missing" });
    return unwrap(res);
  };

  return {
    async getProfile() {
      const { data: auth } = await client.auth.getUser();
      if (!auth?.user) return null;
      return unwrap(await client.from("profiles").select("*").eq("id", auth.user.id).maybeSingle());
    },
    async claimProfile({ teacherCode, fullName }) {
      return unwrap(await client.rpc("claim_profile", { p_teacher_code: teacherCode || null, p_full_name: fullName || null }));
    },
    async teacherCode() {
      return unwrap(await client.rpc("school_teacher_code"));
    },

    async listCourses() {
      const query = (c) => client.from("courses").select(c).order("created_at", { ascending: false });
      const first = await query("id, name, grade, year, created_at, subject, group_label");
      return unwrap(first.error && /subject|group_label/.test(first.error.message ?? "") ? await query("id, name, grade, year, created_at") : first);
    },
    async createCourse({ schoolId, userId, name, grade, subject, groupLabel }) {
      const row = { school_id: schoolId, created_by: userId, name, grade: grade || null };
      // subject and group_label arrive with migration 0012; until it runs the course is saved by name only.
      const first = await client.from("courses").insert({ ...row, subject: subject || null, group_label: groupLabel || null }).select().single();
      if (first.error && /subject|group_label/.test(first.error.message ?? "")) return unwrap(await client.from("courses").insert(row).select().single());
      return unwrap(first);
    },
    async deleteCourse(id) {
      unwrap(await client.from("courses").delete().eq("id", id));
    },
    async listMembers(courseId) {
      const query = (c) => client.from("course_members").select(c).eq("course_id", courseId).order("full_name");
      const first = await query("id, profile_id, email, full_name, role, access");
      return unwrap(first.error && /access/.test(first.error.message ?? "") ? await query("id, profile_id, email, full_name, role") : first);
    },
    // Existing emails are left alone, so importing the same file twice is harmless.
    // access ("edit" or "view", migration 0020) only for teachers; without it every teacher edits.
    async addStudents(courseId, rows, role = "student", access = null) {
      const payload = rows.map((r) => ({ course_id: courseId, email: r.email, full_name: r.fullName, role, ...(access && role === "teacher" ? { access } : {}) }));
      unwrap(await client.from("course_members").upsert(payload, { onConflict: "course_id,email", ignoreDuplicates: true }));
      return payload.length;
    },
    async removeMember(id) {
      unwrap(await client.from("course_members").delete().eq("id", id));
    },

    async listAssignments() {
      const cols = "id, course_id, kind, title, exam_slug, scope, question_keys, opens_at, due_at, time_limit_min, reveal_policy, max_attempts, assignee_id, status, created_at, courses(name)";
      const query = (c) => client.from("assignments").select(c).order("created_at", { ascending: false });
      // allow_hints and instant_feedback arrive with migrations 0007 and 0008; until they run, every assignment
      // offers hints and immediate feedback.
      // allow_definitions, definitions and proctor arrive with migrations 0011 and 0012.
      // delivery (online or paper) arrives with migration 0023; until it runs, every assignment is online.
      const withDelivery = await query(`${cols}, allow_hints, instant_feedback, allow_definitions, definitions, proctor, delivery`);
      if (!withDelivery.error) return unwrap(withDelivery);
      const full = await query(`${cols}, allow_hints, instant_feedback, allow_definitions, definitions, proctor`);
      if (!full.error) return unwrap(full);
      if (!/allow_definitions|definitions|proctor/.test(full.error.message ?? "")) unwrap(full);
      const first = await query(`${cols}, allow_hints, instant_feedback`);
      if (first.error && /allow_hints|instant_feedback/.test(first.error.message ?? "")) {
        const hintsOnly = await query(`${cols}, allow_hints`);
        return unwrap(hintsOnly.error ? await query(cols) : hintsOnly);
      }
      return unwrap(first);
    },
    // Links this account to roster rows with the same email; quietly does nothing until migration 0010 has run.
    async linkRoster() {
      try { await client.rpc("link_my_roster"); } catch { /* not installed yet */ }
    },
    async createAssignment(a) {
      const r = await client.from("assignments").insert(a).select().single();
      // Without migration 0023 a paper activity is saved as an ordinary one; its page still offers printing.
      if (r.error && "delivery" in a && /delivery/.test(r.error.message ?? "")) {
        const { delivery, ...rest } = a;
        return unwrap(await client.from("assignments").insert(rest).select().single());
      }
      return unwrap(r);
    },
    // Online or paper (migration 0023). Before it runs the change fails with a message that says so.
    async setAssignmentDelivery(id, delivery) {
      const r = await client.from("assignments").update({ delivery }).eq("id", id);
      if (r.error && /delivery/.test(r.error.message ?? "")) throw new Error("Para guardar si una actividad es en papel hace falta correr la migración 0023 en Supabase.");
      unwrap(r);
    },
    async setAssignmentStatus(id, status) {
      unwrap(await client.from("assignments").update({ status }).eq("id", id));
    },
    async deleteAssignment(id) {
      unwrap(await client.from("assignments").delete().eq("id", id));
    },

    async uploadAttempt(row, profileId) {
      const put = (r) => client.from("attempts").upsert({ ...r, profile_id: profileId }, { onConflict: "profile_id,client_id" });
      const first = await put(row);
      // `activity` arrives with migration 0009; until it runs, the attempt is saved without it.
      if (first.error && /activity|proctor/.test(first.error.message ?? "")) {
        const { activity, proctor, ...rest } = row;
        unwrap(await put(rest));
        return;
      }
      unwrap(first);
    },
    // A student's highlights and notes on one booklet (migration 0011). Without the table, both calls fail quietly.
    async myAnnotations(slug) {
      const row = unwrap(await client.from("annotations").select("items").eq("exam_slug", slug).maybeSingle());
      return row?.items ?? [];
    },
    async saveAnnotations(slug, items) {
      const { data: auth } = await client.auth.getUser();
      if (!auth?.user) return;
      unwrap(await client.from("annotations").upsert({ profile_id: auth.user.id, exam_slug: slug, items, updated_at: new Date().toISOString() }, { onConflict: "profile_id,exam_slug" }));
    },
    async myAttempts() {
      return unwrap(await client.from("attempts").select("assignment_id, submitted_at, mode, score, client_id").not("assignment_id", "is", null));
    },
    async assignmentAttempts(assignmentId) {
      const cols = "profile_id, member_id, client_id, assignment_id, submitted_at, mode, score, answers, duration_sec";
      const query = (c) => client.from("attempts").select(c).eq("assignment_id", assignmentId);
      const full = await query(`${cols}, started_at, times, activity, proctor`);
      if (!full.error) return full.data;
      const first = await query(`${cols}, started_at, times, activity`);
      if (first.error && /activity/.test(first.error.message ?? "")) return unwrap(await query(`${cols}, started_at, times`));
      return unwrap(first);
    },

    // Every delivered attempt on one booklet that this teacher may read, with answers (for "weak spots" and item analysis).
    async examAttempts(slug) {
      return unwrap(await client.from("attempts").select("profile_id, member_id, client_id, assignment_id, submitted_at, mode, score, answers").eq("exam_slug", slug).not("submitted_at", "is", null));
    },

    // School-wide reads for the coordinator (row-level security gives a teacher only their own courses).
    async allMembers() {
      const query = (c) => client.from("course_members").select(c);
      const first = await query("id, course_id, profile_id, email, full_name, role, access");
      return unwrap(first.error && /access/.test(first.error.message ?? "") ? await query("id, course_id, profile_id, email, full_name, role") : first);
    },
    async allAttempts() {
      return unwrap(await client.from("attempts").select("profile_id, member_id, client_id, assignment_id, submitted_at, mode, score, exam_slug, scope").not("assignment_id", "is", null));
    },
    // Everything the activity report needs per attempt: result, time and (with migration 0012) monitoring totals.
    async reportAttempts() {
      const cols = "profile_id, member_id, assignment_id, submitted_at, mode, score, duration_sec";
      const query = (c) => client.from("attempts").select(c).not("assignment_id", "is", null).not("submitted_at", "is", null);
      // answers and activity let the grading model apply partial credit and curves; older databases lack some columns.
      for (const extra of [", answers, activity, proctor", ", answers, activity", ", answers", ""]) {
        const r = await query(`${cols}${extra}`);
        if (!r.error) return r.data;
        if (!extra) unwrap(r);
      }
      return [];
    },
    // Grading models (migration 0016). Until it runs, nobody has one and everything is graded as a percent.
    async gradingModels() {
      const r = await client.from("grading_models").select("id, scope, scope_id, model");
      return r.error ? [] : r.data;
    },
    async saveGradingModel({ schoolId, userId, scope, scopeId, model }) {
      const r = await client.from("grading_models").upsert({ school_id: schoolId, scope, scope_id: scopeId, model, updated_by: userId }, { onConflict: "scope,scope_id" });
      if (r.error && /grading_models/.test(r.error.message ?? "")) throw new Error("Falta ejecutar la migración 0016 (modelos de calificación) en Supabase.");
      unwrap(r);
    },
    async clearGradingModel(scope, scopeId) {
      unwrap(await client.from("grading_models").delete().eq("scope", scope).eq("scope_id", scopeId));
    },
    // Chart builder: every delivered attempt with answers and time per question (times and activity need migrations 0009+).
    async chartAttempts() {
      const cols = "profile_id, member_id, assignment_id, submitted_at, mode, answers";
      const query = (c) => client.from("attempts").select(c).not("assignment_id", "is", null).not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(6000);
      const full = await query(`${cols}, times, activity`);
      if (!full.error) return full.data;
      const times = await query(`${cols}, times`);
      return unwrap(times.error ? await query(cols) : times);
    },
    async savedCharts() {
      const r = await client.from("saved_charts").select("id, name, spec, created_at").order("created_at", { ascending: false });
      return r.error ? null : r.data; // null: migration 0015 has not run, the screen keeps charts in this browser
    },
    async saveChart({ schoolId, name, spec }) {
      return unwrap(await client.from("saved_charts").insert({ school_id: schoolId, name, spec }).select("id, name, spec, created_at").single());
    },
    async deleteChart(id) {
      unwrap(await client.from("saved_charts").delete().eq("id", id));
    },
    async listStaff() {
      return unwrap(await client.from("profiles").select("id, email, full_name, role, created_at").in("role", ["teacher", "school_admin"]).order("full_name"));
    },
    // A student's classes with their teachers' names (migration 0018). null until it runs: the app falls back to course names.
    async studentClasses() {
      const r = await client.rpc("student_classes");
      return r.error ? null : r.data;
    },
    // Group directors (migration 0018): one teacher per group who reads every subject of it. [] until it runs.
    async groupDirectors() {
      const r = await client.from("group_directors").select("id, grade, group_label, profile_id");
      return r.error ? [] : r.data;
    },
    async setGroupDirector({ schoolId, grade, groupLabel, profileId }) {
      if (!profileId) {
        unwrap(await client.from("group_directors").delete().eq("school_id", schoolId).eq("grade", grade).eq("group_label", groupLabel));
        return;
      }
      const r = await client.from("group_directors").upsert({ school_id: schoolId, grade, group_label: groupLabel, profile_id: profileId }, { onConflict: "school_id,grade,group_label" });
      if (r.error && /group_directors/.test(r.error.message ?? "")) throw new Error("Falta ejecutar la migración 0018 (directores de grupo) en Supabase.");
      unwrap(r);
    },
    async setRole(profileId, role) {
      return unwrap(await client.rpc("set_profile_role", { p_profile: profileId, p_role: role }));
    },

    // Per-student work, paper results and family reports.
    async studentAttempts(profileId) {
      return unwrap(await client.from("attempts").select("profile_id, submitted_at, mode, score").eq("profile_id", profileId).not("submitted_at", "is", null));
    },
    async paperSubmit(assignmentId, memberId, answers, score) {
      unwrap(await client.rpc("paper_submit", { p_assignment: assignmentId, p_member: memberId, p_answers: answers, p_score: score }));
    },
    // The seating plan of a paper assignment (migration 0013). The sheets are printed and scanned with it, so it is kept with the assignment.
    async getSeating(assignmentId) {
      const { data, error } = await client.from("paper_seating").select("plan").eq("assignment_id", assignmentId).maybeSingle();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data?.plan ?? null;
    },
    async saveSeating(assignmentId, plan) {
      unwrap(await client.from("paper_seating").upsert({ assignment_id: assignmentId, plan, updated_at: new Date().toISOString() }));
    },
    // Saved classrooms, shared by the school's teachers (migration 0019). null when the table is not there yet.
    async seatingRooms() {
      const r = await client.from("seating_rooms").select("name, layout").order("name");
      if (r.error && /seating_rooms|schema cache|does not exist/i.test(r.error.message ?? "")) return null;
      return unwrap(r).map((row) => ({ ...row.layout, name: row.name }));
    },
    async saveSeatingRoom({ name, rows, cols, blocked }) {
      unwrap(await client.from("seating_rooms").upsert({ name, layout: { rows, cols, blocked }, updated_at: new Date().toISOString() }, { onConflict: "school_id,name" }));
    },
    async deleteSeatingRoom(name) {
      unwrap(await client.from("seating_rooms").delete().eq("name", name));
    },
    async createFamilyReport(profileId, payload) {
      return unwrap(await client.rpc("create_family_report", { p_profile: profileId, p_payload: payload }));
    },
    async revokeFamilyReport(token) {
      unwrap(await client.rpc("revoke_family_report", { p_token: token }));
    },
    async familyReport(token) {
      return unwrap(await client.rpc("family_report", { p_token: token }));
    },

    // Teacher-written questions. Row-level security returns the ones this person may read.
    async teacherQuestions() {
      return unwrap(await client.from("teacher_questions").select("*").order("created_at", { ascending: false }));
    },
    async teacherQuestionsByIds(ids) {
      if (!ids?.length) return [];
      return unwrap(await client.from("teacher_questions").select("*").in("id", ids));
    },
    async saveTeacherQuestion(row, id = null) {
      const q = client.from("teacher_questions");
      return unwrap(id ? await q.update(row).eq("id", id).select().single() : await q.insert(row).select().single());
    },
    async deleteTeacherQuestion(id) {
      unwrap(await client.from("teacher_questions").delete().eq("id", id));
    },

    // School versions of bank questions (migration 0012). A missing table means "no versions yet".
    async questionOverrides(slug) {
      const r = await client.from("question_overrides").select("id, qkey, question_json, answer, explanation, updated_at").eq("exam_slug", slug);
      return r.error ? [] : r.data;
    },
    async allOverrides() {
      const r = await client.from("question_overrides").select("id, exam_slug, qkey, updated_at");
      return r.error ? [] : r.data;
    },
    async saveOverride(row) {
      return unwrap(await client.from("question_overrides").upsert(row, { onConflict: "school_id,exam_slug,qkey" }).select("id").single());
    },
    async deleteOverride(id) {
      unwrap(await client.from("question_overrides").delete().eq("id", id));
    },

    // Lessons and saved activity formats (migration 0017). A missing table reads as `null`, so the screen can say so.
    async lessons() {
      const r = await client.from("lessons").select("id, owner_id, title, exam_slug, items, settings, visibility, updated_at").order("updated_at", { ascending: false });
      if (r.error && /lessons|schema cache|does not exist/i.test(r.error.message ?? "")) return null;
      return unwrap(r);
    },
    async saveLesson(row, id = null) {
      const q = client.from("lessons");
      return unwrap(id ? await q.update(row).eq("id", id).select().single() : await q.insert(row).select().single());
    },
    async deleteLesson(id) {
      unwrap(await client.from("lessons").delete().eq("id", id));
    },
    async activityFormats() {
      const r = await client.from("activity_formats").select("id, owner_id, name, config, visibility").order("created_at", { ascending: false });
      return r.error ? [] : r.data;
    },
    async saveActivityFormat(row) {
      return unwrap(await client.from("activity_formats").insert(row).select().single());
    },
    async deleteActivityFormat(id) {
      unwrap(await client.from("activity_formats").delete().eq("id", id));
    },

    // Exam monitoring (migration 0012). Failures are silent: monitoring never blocks a student.
    async proctorSend(rows) {
      const r = await client.from("proctor_events").insert(rows);
      return !r.error;
    },
    async proctorEvents(assignmentId, sinceIso = null) {
      let q = client.from("proctor_events").select("id, profile_id, client_id, kind, at, question_key, secs").eq("assignment_id", assignmentId).order("at");
      if (sinceIso) q = q.gte("at", sinceIso);
      const r = await q;
      return r.error ? [] : r.data;
    },

    // Live answering. The database clock decides when a question opens and closes.
    async liveNow() {
      return unwrap(await client.rpc("live_now"));
    },
    async liveCreate({ title, exam, keys, seconds, course }) {
      return unwrap(await client.rpc("live_create", { p_title: title, p_exam: exam, p_keys: keys, p_seconds: seconds, p_course: course || null }));
    },
    async liveJoin(code, nickname) {
      return unwrap(await client.rpc("live_join", { p_code: code, p_nickname: nickname }));
    },
    async liveNext(id, index) {
      return unwrap(await client.rpc("live_next", { p_session: id, p_index: index }));
    },
    async liveReveal(id, correct, points) {
      return unwrap(await client.rpc("live_reveal", { p_session: id, p_correct: correct, p_points: points }));
    },
    async liveEnd(id) {
      return unwrap(await client.rpc("live_end", { p_session: id }));
    },
    async liveSession(id) {
      return unwrap(await client.from("live_sessions").select("*").eq("id", id).maybeSingle());
    },
    async livePlayers(id) {
      return unwrap(await client.from("live_players").select("player_id, nickname, profile_id, score, streak").eq("session_id", id));
    },
    async liveAnswers(id, index) {
      return unwrap(await client.from("live_answers").select("player_id, question_index, option, answered_at, points").eq("session_id", id).eq("question_index", index));
    },
    async liveMyAnswers(id) {
      const { data: auth } = await client.auth.getUser();
      return unwrap(await client.from("live_answers").select("question_index, option, points").eq("session_id", id).eq("player_id", auth.user.id));
    },
    async liveAnswer(id, index, option) {
      const { data: auth } = await client.auth.getUser();
      unwrap(await client.from("live_answers").insert({ session_id: id, player_id: auth.user.id, question_index: index, option }));
    },
    async myLiveSessions() {
      return unwrap(await client.from("live_sessions").select("*").neq("state", "ended").order("created_at", { ascending: false }).limit(10));
    },
    async myPlayerId() {
      const { data: auth } = await client.auth.getUser();
      return auth?.user?.id ?? null;
    },

    // Teacher workspace (migration 0014): statuses, follow-up flags, groups, notes and saved views. Until the
    // migration runs these throw an error with code "missing" and the workspace keeps its data in this browser.
    async wsList(table, filter = null) {
      let q = client.from(table).select("*");
      if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
      return unwrapWs(await q);
    },
    async wsUpsert(table, rows, onConflict) {
      return unwrapWs(await client.from(table).upsert(rows, onConflict ? { onConflict } : undefined).select());
    },
    async wsInsert(table, row) {
      return unwrapWs(await client.from(table).insert(row).select().single());
    },
    async wsUpdate(table, id, patch) {
      return unwrapWs(await client.from(table).update(patch).eq("id", id).select().single());
    },
    async wsDelete(table, match) {
      let q = client.from(table).delete();
      for (const [k, v] of Object.entries(match)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
      unwrapWs(await q);
    },

    // ---- Colegio: cursos, permisos, invitaciones, ajustes y registro (migration 0020). Reads answer null when the
    // migration has not run, so the screens can say so; writes explain which migration is missing.
    async schoolGroups() {
      const r = await client.from("school_groups").select("id, grade, label, created_at");
      return r.error ? null : r.data;
    },
    async createGroups(rows) {
      const r = await client.from("school_groups").upsert(rows.map((g) => ({ grade: g.grade, label: g.label })), { onConflict: "school_id,grade,label", ignoreDuplicates: true }).select("id, grade, label, created_at");
      if (r.error && isMissingTable(r.error)) throw new Error(MISSING_0020);
      return unwrap(r) ?? [];
    },
    async deleteGroup(id) {
      unwrap(await client.from("school_groups").delete().eq("id", id));
    },
    async setMemberAccess(memberId, access) {
      const r = await client.from("course_members").update({ access }).eq("id", memberId);
      if (r.error && /access/.test(r.error.message ?? "")) throw new Error(MISSING_0020);
      unwrap(r);
    },
    async subjectAccess() {
      const r = await client.from("subject_access").select("id, profile_id, area, grade, access, created_at");
      return r.error ? null : r.data;
    },
    async saveSubjectAccess({ profileId, area, grade, access }) {
      const r = await client.from("subject_access").insert({ profile_id: profileId, area, grade: grade || null, access }).select("id, profile_id, area, grade, access, created_at").single();
      if (r.error && isMissingTable(r.error)) throw new Error(MISSING_0020);
      return unwrap(r);
    },
    async updateSubjectAccess(id, access) {
      unwrap(await client.from("subject_access").update({ access }).eq("id", id));
    },
    async deleteSubjectAccess(id) {
      unwrap(await client.from("subject_access").delete().eq("id", id));
    },
    async schoolInfo() {
      const r = await client.from("schools").select("id, name, domains");
      return r.error ? null : r.data?.[0] ?? null;
    },
    async schoolSettings() {
      const r = await client.from("school_settings").select("settings, updated_at");
      if (r.error) return null;
      return r.data?.[0]?.settings ?? {};
    },
    async saveSchoolSettings(schoolId, settings) {
      const r = await client.from("school_settings").upsert({ school_id: schoolId, settings, updated_at: new Date().toISOString() }, { onConflict: "school_id" });
      if (r.error && isMissingTable(r.error)) throw new Error(MISSING_0020);
      unwrap(r);
    },
    async updateSchoolName(name) {
      const r = await client.rpc("update_school_name", { p_name: name });
      if (r.error && /update_school_name|function/.test(r.error.message ?? "")) throw new Error(MISSING_0020);
      return unwrap(r);
    },
    async regenerateTeacherCode() {
      const r = await client.rpc("regenerate_teacher_code");
      if (r.error && /regenerate_teacher_code|function/.test(r.error.message ?? "")) throw new Error(MISSING_0020);
      return unwrap(r);
    },
    async updateMyName(profileId, fullName) {
      unwrap(await client.from("profiles").update({ full_name: fullName }).eq("id", profileId));
    },
    async staffInvites() {
      const r = await client.from("staff_invites").select("id, email, full_name, role, created_at, accepted_at").order("created_at", { ascending: false });
      return r.error ? null : r.data;
    },
    // rows: [{ email, name, role }]. Answers [{ email, status: "invited" | "updated" | "skipped" }].
    async inviteStaff(rows) {
      const r = await client.rpc("invite_staff", { p_rows: rows });
      if (r.error && /invite_staff|function/.test(r.error.message ?? "")) throw new Error(MISSING_0020);
      return unwrap(r) ?? [];
    },
    async deleteInvite(id) {
      unwrap(await client.from("staff_invites").delete().eq("id", id));
    },
    async auditLog(limit = 300) {
      const r = await client.from("school_audit").select("id, actor, action, detail, created_at").order("created_at", { ascending: false }).limit(limit);
      return r.error ? null : r.data;
    },
    // Best effort: a missing table or policy never blocks the action being logged.
    async logAction(schoolId, actor, action, detail = {}) {
      try { await client.from("school_audit").insert({ school_id: schoolId, actor, action, detail }); } catch { /* not installed */ }
    },
    // Who made what, for Colegio › Registro and the teacher stats: every activity, class and own question with its author.
    async authorship() {
      const soft = async (q) => { const r = await q; return r.error ? [] : r.data; };
      const [assignments, courses, questions, lessons] = await Promise.all([
        soft(client.from("assignments").select("id, course_id, created_by, created_at, kind, title, status").order("created_at", { ascending: false })),
        soft(client.from("courses").select("id, name, created_by, created_at")),
        soft(client.from("teacher_questions").select("id, owner_id, created_at, area")),
        soft(client.from("lessons").select("id, owner_id, created_at, title")),
      ]);
      return { assignments, courses, questions, lessons };
    },

    async myConsents() {
      return unwrap(await client.from("consents").select("kind, version, granted_at"));
    },
    async acceptConsent(profileId, kind, version) {
      unwrap(await client.from("consents").upsert({ profile_id: profileId, kind, version }, { onConflict: "profile_id,kind,version", ignoreDuplicates: true }));
    },
    async schoolConsents() {
      return unwrap(await client.from("school_consents").select("kind, version, granted_at"));
    },
    async recordSchoolConsent(schoolId, userId, kind, version) {
      unwrap(await client.from("school_consents").upsert({ school_id: schoolId, granted_by: userId, kind, version }, { onConflict: "school_id,kind,version", ignoreDuplicates: true }));
    },
  };
}
