// Per-viewer records kept in this browser only: error reports and finished attempts.
// There is no backend yet, so these are not shared and are lost if the browser data is cleared.
// Every read and write can fail (private mode, blocked storage); callers keep working without them.
import { demoEnabled } from "../demo/mode.js";

const REPORTS_KEY = "condor:reports";
const HISTORY_KEY = demoEnabled ? "condor:demo:history" : "condor:history";
// Demo mode: the invented student's practice, shown under whatever this browser adds during the demo.
let demoHistory = [];
export function setDemoHistory(list) { demoHistory = list ?? []; }

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function loadReports() {
  return read(REPORTS_KEY);
}

export function addReport({ slug, question, number, exam, note }) {
  return write(REPORTS_KEY, [...read(REPORTS_KEY), { slug, question, number, exam, note, at: new Date().toISOString() }]);
}

export function loadHistory() {
  const own = read(HISTORY_KEY);
  const ids = new Set(own.map((e) => e.id));
  return [...own, ...demoHistory.filter((e) => !ids.has(e.id))].sort((a, b) => b.at - a.at);
}

// One record per attempt: recording the same attempt again replaces it.
export function recordAttempt(entry) {
  const list = read(HISTORY_KEY).filter((e) => e.id !== entry.id);
  return write(HISTORY_KEY, [...list, entry]);
}

// Teacher demo: assignments made in this browser (sample data, no accounts yet).
const ASSIGN_KEY = "condor:teacher:assignments";

export function loadAssignments() {
  return read(ASSIGN_KEY);
}

export function addAssignment(entry) {
  const item = { ...entry, id: String(Date.now()), createdAt: new Date().toISOString() };
  return write(ASSIGN_KEY, [...read(ASSIGN_KEY), item]) ? item : null;
}
