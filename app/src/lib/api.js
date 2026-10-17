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
    async addStudents(courseId, rows) {
      const payload = rows.map((r) => ({ course_id: courseId, email: r.email, full_name: r.fullName, role: "student" }));
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
          .select("id, course_id, kind, title, exam_slug, scope, question_keys, opens_at, due_at, time_limit_min, reveal_policy, status, created_at, courses(name)")
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
      return unwrap(await client.from("attempts").select("profile_id, submitted_at, mode, score").eq("assignment_id", assignmentId));
    },
  };
}
