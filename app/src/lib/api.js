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
      return unwrap(await client.from("courses").select("id, name, grade, year, created_at").order("created_at", { ascending: false }));
    },
    async createCourse({ schoolId, userId, name, grade }) {
      return unwrap(await client.from("courses").insert({ school_id: schoolId, created_by: userId, name, grade: grade || null }).select().single());
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
      return unwrap(
        await client
          .from("assignments")
          .select("id, course_id, kind, title, exam_slug, scope, question_keys, opens_at, due_at, time_limit_min, reveal_policy, max_attempts, status, created_at, courses(name)")
          .order("created_at", { ascending: false }),
      );
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
      unwrap(await client.from("attempts").upsert({ ...row, profile_id: profileId }, { onConflict: "profile_id,client_id" }));
    },
    async myAttempts() {
      return unwrap(await client.from("attempts").select("assignment_id, submitted_at, mode, score, client_id").not("assignment_id", "is", null));
    },
    async assignmentAttempts(assignmentId) {
      return unwrap(await client.from("attempts").select("profile_id, client_id, assignment_id, submitted_at, mode, score, answers, duration_sec").eq("assignment_id", assignmentId));
    },

    // Every delivered attempt on one booklet that this teacher may read, with answers (for "weak spots" and item analysis).
    async examAttempts(slug) {
      return unwrap(await client.from("attempts").select("profile_id, client_id, assignment_id, submitted_at, mode, score, answers").eq("exam_slug", slug).not("submitted_at", "is", null));
    },

    // School-wide reads for the coordinator (row-level security gives a teacher only their own courses).
    async allMembers() {
      return unwrap(await client.from("course_members").select("id, course_id, profile_id, email, full_name, role"));
    },
    async allAttempts() {
      return unwrap(await client.from("attempts").select("profile_id, client_id, assignment_id, submitted_at, mode, score, exam_slug").not("assignment_id", "is", null));
    },
    async listStaff() {
      return unwrap(await client.from("profiles").select("id, email, full_name, role, created_at").in("role", ["teacher", "school_admin"]).order("full_name"));
    },
    async setRole(profileId, role) {
      return unwrap(await client.rpc("set_profile_role", { p_profile: profileId, p_role: role }));
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
