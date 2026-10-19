// Exam monitoring. The student's app records when the tab or window is left, when the pointer leaves the exam
// window and long idle stretches; the teacher sees it live and in the report. Pure helpers plus one hook.
import { useEffect, useRef } from "react";

export const IDLE_MS = 60000;
export const KIND_LABEL = {
  leave: "Salió de la pestaña", return: "Volvió a la pestaña",
  pointer_out: "El cursor salió del examen", pointer_in: "El cursor volvió",
  idle: "Sin actividad",
};

// Totals for the attempt row and the report: leaves, seconds away, pointer exits, idle seconds.
export function summarizeProctor(log) {
  const events = log ?? [];
  const sum = (kind) => events.filter((e) => e.kind === kind);
  return {
    leaves: sum("leave").length,
    awaySec: Math.round(sum("return").reduce((n, e) => n + (e.secs ?? 0), 0)),
    pointerOuts: sum("pointer_out").length,
    idleSec: Math.round(sum("idle").reduce((n, e) => n + (e.secs ?? 0), 0)),
  };
}

// Group the events of an assignment per student, newest last. `rows` come from proctor_events.
export function eventsByStudent(rows) {
  const out = new Map();
  for (const r of rows ?? []) {
    const list = out.get(r.profile_id) ?? [];
    list.push(r);
    out.set(r.profile_id, list);
  }
  return out;
}

// Students who are away right now: their last tab event is a "leave" and it is recent.
export function awayNow(rows, now = Date.now(), maxAgeMs = 15 * 60000) {
  const away = [];
  for (const [id, list] of eventsByStudent(rows)) {
    const tab = list.filter((e) => e.kind === "leave" || e.kind === "return");
    const last = tab[tab.length - 1];
    if (last?.kind === "leave" && now - new Date(last.at).getTime() < maxAgeMs) away.push({ id, since: last.at });
  }
  return away;
}

// Records events while `enabled`. `onEvent({kind, at, secs, question_key})` is called for each one.
export function useProctor(enabled, onEvent, currentKey) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const keyRef = useRef(currentKey);
  keyRef.current = currentKey;
  useEffect(() => {
    if (!enabled) return undefined;
    let leftAt = null;
    let idleFrom = Date.now();
    let outAt = null;
    const emit = (kind, secs) => cb.current({ kind, at: new Date().toISOString(), secs: secs == null ? null : Math.round(secs), question_key: keyRef.current ?? null });
    const closeIdle = (now) => {
      if (now - idleFrom >= IDLE_MS) emit("idle", (now - idleFrom) / 1000);
      idleFrom = now;
    };
    const away = () => { if (leftAt == null) { leftAt = Date.now(); emit("leave"); } };
    const back = () => { if (leftAt != null) { const now = Date.now(); emit("return", (now - leftAt) / 1000); leftAt = null; idleFrom = now; } };
    const onVis = () => (document.visibilityState === "hidden" ? away() : back());
    const onBlur = () => away();
    const onFocus = () => back();
    const onActive = () => { if (leftAt == null) closeIdle(Date.now()); };
    const onOut = (e) => { if (!e.relatedTarget && outAt == null && leftAt == null) { outAt = Date.now(); emit("pointer_out"); } };
    const onIn = () => { if (outAt != null) { emit("pointer_in", (Date.now() - outAt) / 1000); outAt = null; } onActive(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousemove", onIn);
    document.addEventListener("keydown", onActive);
    document.addEventListener("pointerdown", onActive);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mousemove", onIn);
      document.removeEventListener("keydown", onActive);
      document.removeEventListener("pointerdown", onActive);
      closeIdle(Date.now());
    };
  }, [enabled]);
}
