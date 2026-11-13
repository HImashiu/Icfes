// Behaviour of the growth tool pages (scripts/build-seo-growth.mjs). Each section has data-tool="<name>"; this file
// finds them and wires them up. Bundled with esbuild into site-dist/tools.js (with the qrcode package).
// Server calls go through window.condorGrowth (site/growth.js), which loads right after site.js; if it never loads
// (blocked, not configured), the tools still work and only the saving steps fail politely.
import QRCode from "qrcode";
import {
  AREA_SLUG, TEST_IDS, TEST_NAMES, countdown, diagnosticResult, icsCalendar, inversePlan, isoDay, parseDay,
  planWeeks, practiceReminders, scoreBucket, searchPages,
} from "../src/lib/growth/tools-core.js";

const D = document;
const $ = (sel, root = D) => root.querySelector(sel);
const $$ = (sel, root = D) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const show = (el, on = true) => el && el.classList.toggle("g-hidden", !on);
const params = new URLSearchParams(location.search);
const ORIGIN = location.origin;
const SITE = `${ORIGIN}/`;

// window.condorGrowth arrives a moment after this file runs; wait for it (at most 6 s).
const stub = {
  ev() {}, rpc: () => Promise.reject(new Error("offline")), vid: null, flush() {},
  store: {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
    json: (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
  },
};
const growth = new Promise((resolve) => {
  const t0 = Date.now();
  (function wait() {
    if (window.condorGrowth) return resolve(window.condorGrowth);
    if (Date.now() - t0 > 6000) return resolve(stub);
    setTimeout(wait, 60);
  })();
});
const ev = (name, props) => growth.then((g) => g.ev(name, props));
const rpc = (name, body) => growth.then((g) => g.rpc(name, body));
const vid = () => growth.then((g) => g.vid);
const store = () => growth.then((g) => g.store);

const dataOf = (root) => { try { return JSON.parse($("#g-data", root)?.textContent || "{}"); } catch { return {}; } };
const wa = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const download = (name, text, type = "text/calendar") => {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(D.createElement("a"), { href: url, download: name });
  D.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const msg = (el, text, ok) => { if (!el) return; el.textContent = text; el.className = `g-msg${ok === true ? " ok" : ok === false ? " bad" : ""}`; };
const bars = (list) => list.map((b) => `<li><span>${esc(b.label)}</span><span class="g-bar"><i style="width:${Math.max(2, Math.min(100, b.pct))}%"></i></span><b>${esc(b.value)}</b></li>`).join("");
const ref = () => store().then((s) => s.json("condor:ref"));
const withRef = async (url) => {
  const r = await ref();
  if (!r?.code) return url;
  return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(r.code)}`;
};

// Lead form (F28): email + consent, stored with what the visitor was doing.
function leadForm(form, kind, payload) {
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const out = $("#g-lead-msg", form);
    msg(out, "Guardando…");
    try {
      const r = await rpc("save_lead", { p_email: f.get("email"), p_kind: kind, p_role: "estudiante", p_payload: payload() ?? {}, p_consent: !!f.get("consent"), p_visitor: await vid() });
      if (r === "ok") { msg(out, "Listo. Te escribimos pronto.", true); ev("lead:ok", { k: kind }); form.querySelector("button").disabled = true; }
      else msg(out, r === "email" ? "Revisa el correo." : r === "too_many" ? "Ya recibimos varios envíos. Intenta más tarde." : "Marca la casilla para aceptar.", false);
    } catch { msg(out, "No pudimos guardarlo ahora. Intenta de nuevo en un momento.", false); }
  });
}

// ---------------------------------------------------------------------------------------------- quiz helpers
// Questions answered inside a quiz section: site.js marks each .q with data-done="ok|bad" when a choice is made.
function quizState(root) {
  const qs = $$(".q[data-key]", root);
  const per = {};
  const answers = {};
  for (const q of qs) {
    const t = q.getAttribute("data-test");
    if (!t) continue;
    per[t] = per[t] ?? [0, 0];
    per[t][1] += 1;
    const done = q.getAttribute("data-done");
    if (done === "ok") per[t][0] += 1;
    const pick = $(".opt.incorrect", q)?.getAttribute("data-l") ?? (done === "ok" ? q.getAttribute("data-key") : null);
    if (done) answers[q.id] = pick;
  }
  return { qs, per, answers, done: qs.filter((q) => q.hasAttribute("data-done")).length };
}
const onAnswer = (root, fn) => root.addEventListener("click", (e) => { if (e.target.closest?.(".opt")) setTimeout(fn, 0); });

// ---------------------------------------------------------------------------------------------- F16, F17 diagnóstico
async function diagnostico(root) {
  const data = dataOf(root);
  const classCode = (params.get("c") || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  let started = false;
  let classInfo = null;
  if (classCode) {
    rpc("class_diagnostic_info", { p_code: classCode }).then((info) => {
      if (!info) return;
      classInfo = info;
      show($("#g-class-card"), true);
      $("#g-class-head").innerHTML = `<b>Diagnóstico de ${esc(info.teacher)}</b>${info.course ? ` · ${esc(info.course)}` : ""}${info.school ? ` · ${esc(info.school)}` : ""}. Escribe tu nombre: tu resultado le llega a tu docente.`;
      const intro = $("#g-diag-intro");
      if (intro) intro.insertAdjacentHTML("beforeend", ` <b>Lo pidió ${esc(info.teacher)} para su curso.</b>`);
      store().then((s) => { const n = s.get("condor:diag-name"); if (n) $("#g-class-name").value = n; });
    }).catch(() => {});
  }
  const total = $$(".q[data-key]", root).length;
  const progress = () => {
    const st = quizState(root);
    $("#g-prog").style.width = `${Math.round((st.done / total) * 100)}%`;
    $("#g-prog-t").textContent = `${st.done} de ${total}`;
    $("#g-left").textContent = st.done < total ? `Te faltan ${total - st.done}. Las que dejes en blanco cuentan como no acertadas.` : "";
    if (!started && st.done) { started = true; ev("diag:first", { c: classCode ? 1 : 0 }); }
  };
  onAnswer(root, progress);
  progress();

  $("#g-finish").addEventListener("click", async () => {
    const st = quizState(root);
    if (classCode && classInfo && !$("#g-class-name").value.trim()) {
      $("#g-class-name").focus();
      $("#g-left").textContent = "Escribe tu nombre para que tu docente vea tu resultado.";
      return;
    }
    // Unanswered questions count as wrong: every test keeps its full count.
    const res = diagnosticResult(st.per, data.tables);
    const box = $("#g-result");
    show(box, true);
    $("#g-global").textContent = res.global ?? "–";
    $("#g-range").textContent = res.low != null ? `de 500 · entre ${res.low} y ${res.high}` : "de 500";
    $("#g-bars").innerHTML = bars(res.areas.map((a) => ({ label: a.name, pct: a.scale, value: `${a.right}/${a.total} · ${a.scale}` })));
    const weak = res.weakest;
    $("#g-summary").innerHTML = `Acertaste <b>${res.right} de ${res.total}</b>. ${weak ? `Tu prueba más floja hoy es <b>${esc(weak.name)}</b>: empieza por ahí.` : ""} Con 4 preguntas por prueba el rango es amplio; un simulacro completo lo afina.`;
    if (weak) $("#g-next").href = `${SITE}app/?empezar=1&area=${AREA_SLUG[weak.id]}&fuente=diagnostico`;
    const bucket = scoreBucket(res.global);
    const shareUrl = await withRef(`${SITE}diagnostico-icfes/?p=${bucket}&fuente=wa-diag`);
    $("#g-share").href = wa(`Hice el diagnóstico ICFES con preguntas reales y me salió un estimado de ${res.global}/500. ¿Cuánto sacas tú? ${shareUrl}`);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    ev("diag:done", { g: res.global, w: weak?.id ?? null, n: st.done, c: classCode ? 1 : 0 });
    store().then((s) => s.set("condor:diag", JSON.stringify({ at: Date.now(), g: res.global, w: weak?.id ?? null, areas: res.areas.map((a) => [a.id, a.scale]) })));
    if (classCode && classInfo) {
      const name = $("#g-class-name").value.trim().slice(0, 60);
      store().then((s) => s.set("condor:diag-name", name));
      try {
        const r = await rpc("submit_class_diagnostic", {
          p_code: classCode, p_visitor: await vid(), p_name: name, p_answers: st.answers, p_correct: res.right, p_total: res.total,
          p_per_area: res.areas.map((a) => ({ id: a.id, right: a.right, total: a.total, scale: a.scale })), p_est: res.global,
        });
        if (r === "ok") show($("#g-class-ok"), true);
      } catch { /* the student still sees their result */ }
    }
    leadPayload = { g: res.global, w: weak?.id ?? null };
  });
  let leadPayload = null;
  leadForm($("#g-lead", root), "diagnostico", () => leadPayload);
}

async function curso(root) {
  const data = dataOf(root);
  const secret = (params.get("r") || "").toLowerCase();
  if (/^[0-9a-f-]{36}$/.test(secret)) return cursoReport(root, secret, data);
  const form = $("#g-make", root);
  // A teacher who already made one sees their links again.
  const saved = (await store()).json("condor:curso");
  if (saved?.code) links(saved);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    msg($("#g-make-msg"), "Creando…");
    try {
      const r = await rpc("create_class_diagnostic", { p_teacher: f.get("teacher"), p_school: f.get("school"), p_course: f.get("course"), p_email: f.get("email"), p_visitor: await vid() });
      if (r?.code) {
        (await store()).set("condor:curso", JSON.stringify(r));
        links(r);
        msg($("#g-make-msg"), "");
        ev("curso:create", {});
      } else msg($("#g-make-msg"), r?.error === "too_many" ? "Ya creaste varios hoy. Intenta más tarde." : "Revisa tu nombre.", false);
    } catch { msg($("#g-make-msg"), "No pudimos crearlo ahora. Intenta de nuevo en un momento.", false); }
  });
  function links(r) {
    const student = `${SITE}diagnostico-icfes/?c=${r.code}`;
    const report = `${SITE}diagnostico-icfes/curso/?r=${r.secret}`;
    show($("#g-links"), true);
    $("#g-student-link").textContent = student;
    $("#g-wa").href = wa(`Hagan este diagnóstico ICFES de 20 preguntas reales (unos 25 minutos). Escriban su nombre al final para que me llegue su resultado: ${student}`);
    $("#g-copy").onclick = () => navigator.clipboard?.writeText(student).then(() => { $("#g-copy").textContent = "Copiado"; });
    const a = $("#g-report-link");
    a.href = report;
    a.textContent = report;
  }
}

async function cursoReport(root, secret, data) {
  show($("#g-make", root), false);
  show($("#g-report", root), true);
  let rep;
  try { rep = await rpc("class_diagnostic_report", { p_secret: secret }); } catch { rep = null; }
  if (!rep) { $("#g-rep-sub").textContent = "No encontramos este diagnóstico. Revisa el enlace."; return; }
  ev("curso:report", { n: rep.responses.length });
  $("#g-rep-title").textContent = `Resultados de ${rep.course ? `${rep.course} · ` : ""}${rep.teacher}`;
  const student = `${SITE}diagnostico-icfes/?c=${rep.code}`;
  $("#g-rep-sub").innerHTML = `${rep.school ? `${esc(rep.school)} · ` : ""}Enlace para estudiantes: <a href="${esc(student)}">${esc(student)}</a>`;
  const rs = rep.responses;
  $("#g-rep-n").textContent = rs.length;
  if (!rs.length) { $("#g-rep-bars").innerHTML = "<li>Aún no ha respondido nadie. Comparte el enlace con tu curso.</li>"; return; }
  // Average per test, as the share of right answers and the estimated score from the same tables.
  const sum = Object.fromEntries(TEST_IDS.map((id) => [id, [0, 0]]));
  for (const r of rs) for (const a of r.per_area ?? []) if (sum[a.id]) { sum[a.id][0] += a.right; sum[a.id][1] += a.total; }
  const avg = TEST_IDS.filter((id) => sum[id][1]).map((id) => ({ id, pct: Math.round((sum[id][0] / sum[id][1]) * 100) }));
  $("#g-rep-bars").innerHTML = bars(avg.map((a) => ({ label: TEST_NAMES[a.id], pct: a.pct, value: `${a.pct} %` })));
  const weakest = [...avg].sort((a, b) => a.pct - b.pct)[0];
  if (weakest) $("#g-rep-bars").insertAdjacentHTML("afterend", `<p class="prose">La prueba que más le cuesta al curso: <b>${esc(TEST_NAMES[weakest.id])}</b>.</p>`);
  $("#g-rep-rows").innerHTML = rs.map((r) => {
    const w = [...(r.per_area ?? [])].sort((a, b) => a.right / a.total - b.right / b.total)[0];
    return `<tr><td>${esc(r.name || "Sin nombre")}</td><td>${r.correct}/${r.total}</td><td>${r.est ?? "–"}</td><td>${w ? esc(TEST_NAMES[w.id] ?? "") : "–"}</td></tr>`;
  }).join("");
  // Per question: share of the class that got it right (answers map qid → letter; the key is on the diagnostic page).
  try {
    const html = await (await fetch(`${SITE}diagnostico-icfes/`)).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const qs = $$(".q[data-key]", doc).map((q) => ({ id: q.id, key: q.getAttribute("data-key"), label: $(".paper-label", q)?.textContent ?? q.id, test: q.getAttribute("data-test") }));
    const rows = qs.map((q) => {
      const tried = rs.filter((r) => r.answers && q.id in r.answers);
      const ok = tried.filter((r) => r.answers[q.id] === q.key).length;
      return { ...q, n: tried.length, pct: tried.length ? Math.round((ok / tried.length) * 100) : 0 };
    }).filter((q) => q.n).sort((a, b) => a.pct - b.pct);
    $("#g-rep-q").innerHTML = bars(rows.map((q) => ({ label: `${TEST_NAMES[q.test] ?? ""} · ${q.label}`, pct: q.pct, value: `${q.pct} %` })));
  } catch { /* per-question view is optional */ }
  void data;
}

// ---------------------------------------------------------------------------------------------- F18 inverse calculator
function inversa(root) {
  const data = dataOf(root);
  const range = $("#g-inv-g", root);
  let logged = false;
  const draw = () => {
    const g = Number(range.value);
    $("#g-inv-v").textContent = g;
    const plan = inversePlan(data.tables, { global: g });
    $("#g-inv-bars").innerHTML = bars(plan.map((p) => ({ label: p.name, pct: p.pct ?? 100, value: p.right == null ? "No alcanza" : `${p.right} de ${p.total}` })));
  };
  range.addEventListener("input", draw);
  range.addEventListener("change", () => { if (!logged) { logged = true; ev("tool:inversa", { g: Number(range.value) }); } });
  const goal = Number(params.get("meta"));
  if (goal >= 150 && goal <= 480) range.value = goal;
  draw();
}

// ---------------------------------------------------------------------------------------------- F19 study plan
function plan(root) {
  const form = $("#g-plan", root);
  let last = null;
  // A diagnostic done before pre-selects the weakest test.
  store().then((s) => {
    const d = s.json("condor:diag");
    if (d?.w) $$('input[name="weak"]', form).forEach((c) => { c.checked = c.value === d.w || (c.checked && c.value !== "ma"); });
    const goal = s.json("condor:goal");
    if (goal?.examDate && /^\d{4}-\d{2}-\d{2}$/.test(goal.examDate)) form.exam.value = goal.examDate;
  });
  const read = () => {
    const f = new FormData(form);
    return { start: isoDay(Date.now()), exam: f.get("exam"), days: Number(f.get("days")), minutes: Number(f.get("minutes")), time: f.get("time") || "18:30", weak: f.getAll("weak") };
  };
  const draw = () => {
    const o = read();
    if (!o.exam || parseDay(o.exam) <= new Date()) { $("#g-plan-out").innerHTML = '<p class="g-msg bad">Escoge una fecha de examen futura.</p>'; return null; }
    const p = planWeeks(o);
    last = { o, p };
    const label = { bases: "Bases", ritmo: "Ritmo de examen", final: "Recta final" };
    $("#g-plan-out").innerHTML = `<div class="g-card"><h2>Tu plan: ${p.totalWeeks} semana${p.totalWeeks === 1 ? "" : "s"}</h2>${p.truncated ? '<p class="caption">Mostramos las primeras 52 semanas.</p>' : ""}<ol class="g-week">${p.weeks.map((w) => `<li><b>Semana ${w.week} · ${esc(parseDay(w.from).toLocaleDateString("es-CO", { day: "numeric", month: "short" }))}</b> <span class="g-pill">${label[w.phase]}</span> <span class="g-pill">${esc(w.focusName)}</span><ul>${w.tasks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></li>`).join("")}</ol><div class="g-row g-noprint"><a class="btn btn-go" href="${SITE}app/?empezar=1&area=${AREA_SLUG[p.weeks[0].focus]}&fuente=plan">Empezar la semana 1 <span class="go" aria-hidden="true"></span></a></div></div>`;
    show($("#g-lead", root), true);
    return last;
  };
  $("#g-plan-go").addEventListener("click", () => { if (draw()) ev("tool:plan", { w: last.p.totalWeeks, d: last.o.days }); });
  $("#g-plan-ics").addEventListener("click", () => {
    const r = draw();
    if (!r) return;
    const { o, p } = r;
    const dayIdx = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 6], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] }[o.days] ?? [1, 3, 5];
    const rem = practiceReminders({ days: dayIdx, time: o.time, minutes: o.minutes, until: o.exam, url: `${SITE}app/?empezar=1&fuente=calendario` });
    const weeks = p.weeks.map((w) => ({ uid: `plan-w${w.week}-${o.exam}`, date: w.from, title: `Semana ${w.week}: ${w.focusName}`, description: w.tasks.join("\n"), url: `${SITE}plan-de-estudio-icfes/` }));
    const exam = { uid: `examen-${o.exam}`, date: o.exam, title: "Examen Saber 11", description: "Lleva tu documento y la citación. ¡Éxitos!", url: `${SITE}cuanto-falta-para-el-icfes/` };
    download("plan-icfes.ics", icsCalendar("Mi plan ICFES · Cóndor", [...rem, ...weeks, exam]));
    ev("ics:plan", { w: p.totalWeeks });
  });
  leadForm($("#g-lead", root), "plan", () => last && { exam: last.o.exam, days: last.o.days, minutes: last.o.minutes, weak: last.o.weak });
  draw();
}

// ---------------------------------------------------------------------------------------------- F20 countdown, F30 event
function ticker(targetMs, note, doneText) {
  const tick = () => {
    const c = countdown(targetMs);
    $("#g-d").textContent = c.days;
    $("#g-h").textContent = c.hours;
    $("#g-m").textContent = c.minutes;
    $("#g-s").textContent = c.seconds;
    if (c.done && note) note.textContent = doneText;
    return c;
  };
  tick();
  return setInterval(tick, 1000);
}
// "2027-03-14" + "07:00" in Colombia (UTC−5, no daylight saving) → ms epoch.
const bogota = (iso, hhmm = "07:00") => Date.parse(`${iso}T${hhmm}:00-05:00`);

function cuenta(root) {
  const data = dataOf(root);
  const goal = stub.store.json("condor:goal");
  const mine = goal?.examDate && /^\d{4}-\d{2}-\d{2}$/.test(goal.examDate) ? goal.examDate : null;
  const btns = $$("[data-cal]", root);
  if (mine) show(btns.find((b) => b.dataset.cal === "mine"), true);
  let timer = null;
  const pick = (cal) => {
    const iso = cal === "mine" ? mine : data[cal];
    btns.forEach((b) => { const on = b.dataset.cal === cal; b.setAttribute("aria-pressed", String(on)); b.className = `btn btn-sm ${on ? "btn-primary" : "btn-ghost"}${b.dataset.cal === "mine" && !mine ? " g-hidden" : ""}`; });
    clearInterval(timer);
    const note = $("#g-count-note");
    const days = countdown(bogota(iso, data.start)).days;
    note.textContent = days > 90 ? `Te quedan unas ${Math.floor(days / 7)} semanas: tiempo de sobra para un plan con bases.` : days > 30 ? "Menos de tres meses: practica con tiempo y haz un simulacro cada dos semanas." : days > 0 ? "El último mes: simulacros completos y repaso de errores." : "";
    timer = ticker(bogota(iso, data.start), note, "¡Es hoy! Éxitos.");
    const d = iso.replace(/-/g, "");
    const next = isoDay(parseDay(iso).getTime() + 864e5).replace(/-/g, "");
    $("#g-gcal").href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Examen Saber 11")}&dates=${d}/${next}&details=${encodeURIComponent(`Cuenta regresiva y plan: ${SITE}cuanto-falta-para-el-icfes/`)}`;
  };
  btns.forEach((b) => b.addEventListener("click", () => { pick(b.dataset.cal); ev("tool:cuenta", { c: b.dataset.cal }); }));
  pick(mine ? "mine" : "B");
}

function nacional(root) {
  const n = dataOf(root);
  const start = bogota(n.date, n.s1);
  const end = bogota(n.date, "23:59");
  const note = $("#g-nac-count");
  const live = () => {
    const now = Date.now();
    show($("#g-nac-live"), now >= start - 15 * 6e4 && now <= end);
  };
  ticker(start, note, "¡Ya empezó! Entra a la sesión 1.");
  live();
  setInterval(live, 30000);
  rpc("event_count", { p_key: n.key }).then((c) => { if (c) note.textContent = `${c} estudiantes ya se inscribieron.`; }).catch(() => {});
  const form = $("#g-nac", root);
  store().then((s) => { if (s.get(`condor:ev:${n.key}`)) msg($("#g-nac-msg"), "Ya estás inscrito. Te esperamos.", true); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      const r = await rpc("signup_event", { p_key: n.key, p_visitor: await vid(), p_email: f.get("email") || null, p_grade: f.get("grade") });
      if (r?.ok) {
        (await store()).set(`condor:ev:${n.key}`, "1");
        msg($("#g-nac-msg"), "¡Listo, quedaste inscrito! Agrega la fecha a tu calendario para que no se te pase.", true);
        ev("nacional:signup", { g: f.get("grade") });
      } else msg($("#g-nac-msg"), "No pudimos inscribirte ahora. Intenta más tarde.", false);
    } catch { msg($("#g-nac-msg"), "No pudimos inscribirte ahora. Intenta de nuevo en un momento.", false); }
  });
}

// ---------------------------------------------------------------------------------------------- F12 challenge
function reto(root) {
  const pack = root.dataset.pack;
  const total = $$(".q[data-key]", root).length;
  const from = params.get("de")?.slice(0, 20);
  const theirs = Number(params.get("s"));
  if (from) {
    const intro = $("#g-reto-intro");
    if (intro) intro.innerHTML = `<b>${esc(from)} te retó</b>${Number.isFinite(theirs) && theirs >= 0 && theirs <= total ? ` y acertó ${theirs} de ${total}` : ""}. ¿Puedes igualarlo?`;
  }
  let finished = false;
  onAnswer(root, async () => {
    const st = quizState(root);
    if (finished || st.done < total) return;
    finished = true;
    const ok = Object.values(st.per).reduce((n, p) => n + p[0], 0);
    show($("#g-reto-end"), true);
    $("#g-reto-score").textContent = `${ok}/${total}`;
    $("#g-reto-sub").textContent = from && Number.isFinite(theirs) ? (ok > theirs ? `Le ganaste a ${from}.` : ok === theirs ? `Empate con ${from}.` : `${from} sacó ${theirs}. Repasa y vuelve a intentarlo.`) : ok === total ? "¡Perfecto!" : "Mira las respuestas y reta a alguien.";
    ev("reto:done", { k: pack, ok });
    const name = $("#g-reto-name");
    const s = await store();
    name.value = s.get("condor:first-name") || "";
    const link = async () => {
      const n = name.value.trim().slice(0, 20);
      if (n) s.set("condor:first-name", n);
      const url = await withRef(`${SITE}reto-icfes/${pack}/?s=${ok}${n ? `&de=${encodeURIComponent(n)}` : ""}&fuente=wa-reto`);
      $("#g-reto-wa").href = wa(`Te reto: ${total} preguntas reales del ICFES. Yo acerté ${ok}. ¿Me ganas? ${url}`);
    };
    name.addEventListener("input", link);
    link();
  });
}

// ---------------------------------------------------------------------------------------------- F10 partners
function aliados(root) {
  const form = $("#g-partner", root);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const out = $("#g-partner-msg");
    try {
      const r = await rpc("apply_partner", { p_name: f.get("name"), p_kind: f.get("kind"), p_email: f.get("email"), p_city: f.get("city"), p_audience: Number(f.get("audience")) || null, p_message: f.get("message"), p_visitor: await vid() });
      if (r === "ok") { msg(out, "Recibimos tu solicitud. Te escribimos con tu código en unos días.", true); form.querySelector("button").disabled = true; ev("partner:apply", { k: f.get("kind") }); }
      else msg(out, "Ya recibimos tu solicitud. Si pasan unos días sin respuesta, vuelve a intentarlo.", false);
    } catch { msg(out, "No pudimos enviarla ahora. Intenta de nuevo en un momento.", false); }
  });
}

// ---------------------------------------------------------------------------------------------- F47 school proposal
function propuesta(root) {
  const form = $("#g-prop", root);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const g11 = Math.max(1, Number(f.g11) || 0), g10 = Math.max(0, Number(f.g10) || 0);
    const today = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    const examMonth = f.cal === "B" ? "marzo" : "agosto";
    const doc = $("#g-prop-doc");
    doc.innerHTML = `
      <p class="caption">Propuesta para ${esc(f.school)}${f.city ? `, ${esc(f.city)}` : ""} · ${esc(today)}</p>
      <h2>Cóndor en ${esc(f.school)}: preparación Saber 11 con preguntas reales</h2>
      <p class="prose">Preparada por ${esc(f.name)} para rectoría y el consejo académico. Calendario ${esc(f.cal)}: examen en ${examMonth}.</p>
      <h3>A quién llega</h3>
      <p class="prose"><b>${g11}</b> estudiantes de grado 11${g10 ? ` y <b>${g10}</b> de grado 10` : ""}, con sus docentes de Lectura crítica, Matemáticas, Sociales, Ciencias e Inglés.</p>
      <h3>Qué incluye</h3>
      <ul class="checks"><li>Más de 4.000 preguntas de cuadernillos publicados por el ICFES, con la clave revisada y la fuente en cada una.</li><li>Práctica por prueba y por competencia, con explicación de cada error.</li><li>Simulacros con tiempo en línea y en papel (cuadernillo impreso con versiones y lectura de la hoja de respuestas con el celular).</li><li>Puntaje estimado de 0 a 500 por estudiante, por prueba y por curso, con el modelo del ICFES.</li><li>Seguimiento por estudiante, alertas de quién se está quedando y reportes para coordinación y familias.</li><li>Sin rankings entre estudiantes: cada uno compite con su propio progreso.</li></ul>
      <h3>Las primeras cuatro semanas</h3>
      <ol class="g-steps"><li><b>Semana 1:</b> diagnóstico de 20 preguntas a grado 11 (25 minutos en clase). Coordinación ve el resultado por curso y por prueba.</li><li><b>Semana 2:</b> cada docente asigna práctica de su prueba, 2 sesiones de 20 minutos.</li><li><b>Semana 3:</b> primer simulacro de una sesión, en línea o en papel.</li><li><b>Semana 4:</b> reunión de resultados: qué subió, qué cursos y qué temas necesitan refuerzo.</li></ol>
      <h3>Lo que vas a poder mostrar</h3>
      <ul class="checks"><li>Cuántos estudiantes practican cada semana y cuántas preguntas responden.</li><li>El puntaje estimado del colegio antes y después, por prueba.</li><li>Los temas que más cuestan, por curso, para planear las clases.</li></ul>
      <p class="prose">Siguiente paso: una prueba con un curso. Escríbenos y la activamos esta semana.</p>
      <div class="g-row g-noprint"><button type="button" class="btn btn-primary" onclick="window.print()">Imprimir o guardar en PDF</button><a class="btn btn-ghost" href="${SITE}prueba-docente/?fuente=propuesta">Empezar la prueba</a></div>`;
    show(doc, true);
    doc.scrollIntoView({ behavior: "smooth", block: "start" });
    ev("propuesta:make", { g11 });
    try {
      await rpc("save_lead", { p_email: f.email, p_kind: "propuesta", p_role: f.role === "docente" ? "docente" : "coordinador", p_payload: { school: f.school, city: f.city, g11, g10, cal: f.cal, name: f.name }, p_consent: !!f.consent, p_visitor: await vid() });
    } catch { /* the proposal is shown anyway */ }
  });
}

// ---------------------------------------------------------------------------------------------- F46 roadmap
async function roadmap(root) {
  const list = $("#g-road", root);
  const status = { idea: "Idea", haciendo: "En camino", listo: "Ya salió" };
  const draw = async () => {
    let items;
    try { items = await rpc("roadmap_list", { p_visitor: await vid() }); } catch { items = null; }
    if (!items?.length) { list.innerHTML = "<li><span>No pudimos cargar la lista ahora.</span></li>"; return; }
    list.innerHTML = items.map((i) => `<li><button type="button" class="g-vote${i.mine ? " on" : ""}" data-id="${esc(i.id)}" aria-pressed="${i.mine}"><b>${i.votes}</b><span>${i.mine ? "Votaste" : "Votar"}</span></button><div><b>${esc(i.title)}</b> <span class="g-pill">${esc(status[i.status] ?? i.status)}</span><p>${esc(i.description ?? "")}</p></div></li>`).join("");
  };
  list.addEventListener("click", async (e) => {
    const b = e.target.closest(".g-vote");
    if (!b) return;
    b.disabled = true;
    try { await rpc("roadmap_vote", { p_item: b.dataset.id, p_visitor: await vid() }); ev("roadmap:vote", { i: b.dataset.id }); } catch { /* ignore */ }
    draw();
  });
  const form = $("#g-idea", root);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = new FormData(form).get("text").trim();
    try {
      const r = await rpc("answer_survey", { p_survey: "idea", p_visitor: await vid(), p_answer: { text: text.slice(0, 500), from: "que-viene" } });
      msg($("#g-idea-msg"), r === "ok" ? "¡Gracias! La leemos todas." : "Ya enviaste varias. Intenta más tarde.", r === "ok");
      if (r === "ok") form.reset();
    } catch { msg($("#g-idea-msg"), "No pudimos enviarla ahora.", false); }
  });
  draw();
}

// ---------------------------------------------------------------------------------------------- F22 search
async function buscar(root) {
  const input = $("#g-q", root);
  const out = $("#g-results", root);
  let pages = [];
  try { pages = (await (await fetch(`${SITE}buscar/index.json`)).json()).pages; } catch { /* empty */ }
  let logTimer = null;
  const run = () => {
    const q = input.value.trim();
    const found = q.length < 2 ? [] : searchPages(pages, q, 12);
    out.innerHTML = found.map((p) => `<li><a href="${SITE}${esc(p.u)}" data-ev="search:click"><b>${esc(p.t)}</b><span>${esc(p.d)}</span></a></li>`).join("");
    show($("#g-none"), q.length >= 2 && !found.length);
    clearTimeout(logTimer);
    if (q.length >= 3) logTimer = setTimeout(() => ev("search", { q: q.toLowerCase().slice(0, 80), n: found.length }), 1200);
    try { history.replaceState(null, "", q ? `?q=${encodeURIComponent(q)}` : location.pathname); } catch { /* fine */ }
  };
  input.addEventListener("input", run);
  input.value = params.get("q") || "";
  run();
  input.focus();
}

// ---------------------------------------------------------------------------------------------- F39 certificate check
function verificar(root) {
  const form = $("#g-ver", root);
  const out = $("#g-ver-out", root);
  const check = async (code) => {
    show(out, true);
    out.innerHTML = "<p>Buscando…</p>";
    let r = null;
    try { r = await rpc("verify_certificate", { p_code: code }); } catch { /* offline */ }
    if (!r) { out.innerHTML = '<p class="g-msg bad">No hay un certificado con ese código.</p>'; return; }
    const s = r.stats ?? {};
    const day = new Date(r.issued_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    out.innerHTML = `<p class="caption">Certificado válido · ${esc(code.toUpperCase())}</p><h2>${esc(r.name)}</h2><p class="prose">Practicó el ICFES Saber 11 en Cóndor: <b>${s.answered ?? 0} preguntas</b> respondidas (${s.correct ?? 0} correctas) de <b>${s.areas ?? 0} pruebas</b>, en <b>${s.days ?? 0} días</b> distintos. Emitido el ${esc(day)}.</p>`;
    ev("cert:verify", {});
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); const c = new FormData(form).get("c").trim().toLowerCase(); if (c) check(c); });
  const c = (params.get("c") || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  if (c) { form.c.value = c; check(c); }
}

// ---------------------------------------------------------------------------------------------- F14 poster
async function cartel(root) {
  const r = (params.get("ref") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  const who = (params.get("de") || "").slice(0, 30);
  const path = r ? `r/${r}` : "?fuente=cartel";
  const url = `${SITE}${path}`;
  $("#g-poster-url", root).textContent = url.replace(/^https?:\/\//, "");
  if (who) $("#g-poster-line", root).textContent = `${who} te invita: escanea y responde tu primera pregunta en segundos.`;
  try { $("#g-qr", root).innerHTML = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#141414", light: "#ffffff" } }); } catch { /* no QR */ }
  ev("cartel:view", { r: r ? 1 : 0 });
}

// ---------------------------------------------------------------------------------------------- boot
const TOOLS = { diagnostico, curso, inversa, plan, cuenta, nacional, reto, aliados, propuesta, roadmap, buscar, verificar, cartel };
for (const root of $$("[data-tool]")) {
  const fn = TOOLS[root.dataset.tool];
  if (fn) Promise.resolve().then(() => fn(root)).catch((e) => console.warn("tool", root.dataset.tool, e));
}
