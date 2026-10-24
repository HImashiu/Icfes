// All reads and writes to the backend, in one place. `client` is a Supabase client (injected so tests can fake it).
// Row-level security decides what each role can see; nothing here trusts the browser to filter.
export function createApi(client) {
  const unwrap = ({ data, error }) => {
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
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
      return unwrap(await client.from("course_members").select("id, profile_id, email, full_name, role").eq("course_id", courseId).order("full_name"));
    },
    // Existing emails are left alone, so importing the same file twice is harmless.
    async addStudents(courseId, rows, role = "student") {
      const payload = rows.map((r) => ({ course_id: courseId, email: r.email, full_name: r.fullName, role }));
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
      return unwrap(await client.from("assignments").insert(a).select().single());
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
      return unwrap(await client.from("course_members").select("id, course_id, profile_id, email, full_name, role"));
    },
    async allAttempts() {
      return unwrap(await client.from("attempts").select("profile_id, member_id, client_id, assignment_id, submitted_at, mode, score, exam_slug").not("assignment_id", "is", null));
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
    async listStaff() {
      return unwrap(await client.from("profiles").select("id, email, full_name, role, created_at").in("role", ["teacher", "school_admin"]).order("full_name"));
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
