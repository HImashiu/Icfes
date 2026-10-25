import { describe, expect, it } from "vitest";
import { activeAnnouncements, groupSent, whenText } from "../src/lib/announcements.js";
import { createApi } from "../src/lib/api.js";
import { createDemoClient } from "../src/demo/client.js";

describe("anuncios per subject class", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  const rows = [
    { id: "1", course_id: "m", title: "Viejo", body: "", created_at: "2026-10-20T12:00:00Z" },
    { id: "2", course_id: "m", title: "Fijado", body: "", pinned: true, created_at: "2026-10-18T12:00:00Z" },
    { id: "3", course_id: "i", title: "Nuevo", body: "", created_at: "2026-10-25T11:30:00Z" },
    { id: "4", course_id: "m", title: "Vencido", body: "", created_at: "2026-10-24T12:00:00Z", expires_at: "2026-10-24T23:00:00Z" },
  ];
  it("keeps the ones in force, pinned first, then newest, and narrows to a subject", () => {
    expect(activeAnnouncements(rows, { now }).map((r) => r.title)).toEqual(["Fijado", "Nuevo", "Viejo"]);
    expect(activeAnnouncements(rows, { now, courseIds: ["m"] }).map((r) => r.title)).toEqual(["Fijado", "Viejo"]);
    expect(whenText("2026-10-25T11:30:00Z", now)).toBe("hace 30 min");
  });
  it("shows a notice sent to several classes once", () => {
    const sent = groupSent([{ id: "a", course_id: "m", title: "T", body: "", created_at: "2026-10-25T11:00:00Z" }, { id: "b", course_id: "i", title: "T", body: "", created_at: "2026-10-25T11:00:01Z" }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].courseIds).toEqual(["m", "i"]);
  });
  it("posts to each chosen class and a student sees only their classes", async () => {
    const tables = { courses: [{ id: "m", name: "Matemáticas 11 A" }, { id: "x", name: "Inglés 11 B" }], course_members: [{ course_id: "m", profile_id: "ana", role: "student" }], class_announcements: [] };
    const teacher = createApi(createDemoClient({ tables, profile: { id: "profe", school_id: "s" } }));
    await teacher.postAnnouncement({ courseIds: ["m", "x"], title: "Simulacro el viernes", body: "Traigan lápiz" });
    expect(tables.class_announcements).toHaveLength(2);
    const mine = new Set(["m"]);
    const student = createApi(createDemoClient({ tables, profile: { id: "ana", school_id: "s" }, scope: { class_announcements: (r) => mine.has(r.course_id) } }));
    expect((await student.listAnnouncements()).map((r) => r.course_id)).toEqual(["m"]);
  });
  it("answers null before migration 0026 so screens can say so", async () => {
    const api = createApi(createDemoClient({ tables: { courses: [], course_members: [] }, profile: { id: "p" } }));
    expect(await api.listAnnouncements()).toBeNull();
    await expect(api.postAnnouncement({ courseIds: ["m"], title: "x" })).rejects.toThrow(/0026/);
  });
});
