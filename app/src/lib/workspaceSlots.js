// Plug-in points of the teacher workspace (Estudiantes), so other tools add to it instead of building their own
// dashboards. Each list is read on every render; push to it from the module that owns the feature, e.g.
//
//   import { profilePanels } from "../lib/workspaceSlots.js";
//   profilePanels.push({ id: "charts", title: "Gráficas", order: 50, Component: MyPanel });
//
// profilePanels: sections of a student's profile. Component gets { student, api, courses, assignments, guard }.
// rosterColumns: extra roster columns. { id, label, order, value(student) -> text }.
// bulkActions:   extra buttons for the selected students. { id, label, run({ students, api, store, setNotice }) }.
// scoreFormat:   how a share right (0-100) is shown across the workspace; a grading model can replace it.
export const profilePanels = [];
export const rosterColumns = [];
export const bulkActions = [];
export const scoring = { format: (pct) => (pct == null ? "—" : `${pct} %`), label: "Promedio" };

export const sorted = (list) => [...list].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
