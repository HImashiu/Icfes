// Serves the admin page's API from data embedded in the page (used by the published Artifact).
// It answers the same endpoints as icfes_admin/server.py. Saved edits go to the Artifact's `db` as
// one document per question (collection "edits"); icfes_admin.apply_edits writes them into the shared folder.
(function () {
  const D = JSON.parse(document.getElementById("icfes-data").textContent);
  const overlay = {};            // exam -> n -> patch
  const keyOverlay = {};         // exam -> n -> letter|null
  let db = null;
  let readOnly = false;
  const ready = (async () => {
    try {
      db = (await window.claude?.use?.("db")) || null;
    } catch (e) { db = null; }
    if (!db) { readOnly = true; return; }
    try {
      const snap = await db.collection("edits").get();
      for (const d of snap.docs) if (d.exists) applyRow(d.data());
    } catch (e) { readOnly = true; }
  })();

  function applyRow(row) {
    if (!row || !row.exam) return;
    overlay[row.exam] = overlay[row.exam] || {};
    overlay[row.exam][row.number] = { ...(overlay[row.exam][row.number] || {}), ...row.patch };
    if ("answer" in row.patch) {
      keyOverlay[row.exam] = keyOverlay[row.exam] || {};
      keyOverlay[row.exam][row.number] = row.patch.answer;
    }
  }

  const golden = (e) => D.golden[e];
  const groups = (e) => Object.fromEntries((golden(e).groups || []).map(g => [g.id, g]));
  const pendingFig = (e, n) => (D.pending[e] || []).includes(n);
  const answerOf = (e, n) => {
    const ov = keyOverlay[e] && (n in keyOverlay[e]) ? keyOverlay[e][n] : undefined;
    if (ov !== undefined) return ov;
    return (D.keys[e] || {})[String(n)] ?? null;
  };

  function eff(e, n) {
    const q = golden(e).questions.find(x => x.number === n);
    const p = (overlay[e] || {})[n] || {};
    return { ...q, ...["stem_md", "stimulus_md", "options", "ready"].reduce((a, k) => (k in p ? { ...a, [k]: p[k] } : a), {}) };
  }

  function hidden(e, q) {
    const reasons = [];
    if (!q.ready) reasons.push("not ready");
    const g = groups(e)[q.group_id] || {};
    const texts = [q.stem_md, q.stimulus_md, g.passage_md, ...(q.options || []).map(o => o.text_md)].map(t => t || "");
    if (texts.some(t => t.includes("[Texto pendiente"))) reasons.push("text pending");
    if (texts.some(t => t.includes("[FIGURE"))) reasons.push("[FIGURE] note");
    if (pendingFig(e, q.number)) reasons.push("figure pending spec");
    if ((q.options || []).some(o => !(o.text_md || "").trim())) reasons.push("blank option");
    return reasons;
  }

  const msgs = (e, n) => {
    const v = D.validation[e] || { errors: {}, warnings: {} };
    return { errors: v.errors[n] || [], warnings: v.warnings[n] || [] };
  };

  function rows(e) {
    return golden(e).questions.map(q => {
      const fx = eff(e, q.number);
      const m = msgs(e, q.number);
      return { number: q.number, section: q.section, ready: !!fx.ready, hidden: hidden(e, fx), errors: m.errors.length, warnings: m.warnings.length };
    });
  }

  function progress(e) {
    const g = golden(e);
    const rs = rows(e);
    const v = D.validation[e] || { summary: {} };
    const traced = D.traced[e] || { count: 0, pending: 0, eyeballed: 0 };
    const answers = D.keys[e] ? Object.keys(D.keys[e]).length : 0;
    return {
      exam: e, title: g.exam.title, questions: rs.length, expected: g.exam.cover_expected_total,
      ready: rs.filter(r => r.ready).length, hidden: rs.filter(r => r.hidden.length).length,
      errors: v.summary.errors || 0, warnings: v.summary.warnings || 0, validation_ok: !!v.summary.ok,
      key: { present: !!D.keys[e], answers, disputed: D.disputed[e] ?? null },
      figures: { traced: traced.count, pending_spec: traced.pending, eyeballed: traced.eyeballed },
    };
  }

  function detail(e, n) {
    const g = golden(e);
    const raw = g.questions.find(x => x.number === n);
    if (!raw) throw new Error(`no question ${n} in ${e}`);
    const q = eff(e, n);
    const grp = groups(e)[q.group_id] || null;
    const natives = ((D.natives[e] || {})[n]) || [];
    return {
      exam: e, number: n, question: q, group: grp, hidden_reasons: hidden(e, q),
      messages: msgs(e, n), figures: [], native_figures: natives,
      key: answerOf(e, n), scan_pages: [], numbers: g.questions.map(x => x.number),
      scan: { pages: (raw.source && raw.source.pages) || [], guess: 1, count: null, estimated: true },
      anchor: null, undo: 0, ocr: false,
    };
  }

  async function save(e, n, body) {
    if (readOnly || !db) throw Object.assign(new Error("Solo lectura: no tienes permiso para guardar en esta página."), { status: 403 });
    const q = golden(e).questions.find(x => x.number === n);
    const patch = {};
    if ("stem_md" in body) patch.stem_md = body.stem_md;
    if ("stimulus_md" in body) patch.stimulus_md = body.stimulus_md;
    if ("options" in body) {
      const letters = q.options.map(o => o.letter);
      if (!Array.isArray(body.options) || body.options.some(o => !letters.includes(o.letter))) throw Object.assign(new Error("Las letras de las opciones no coinciden."), { status: 400 });
      patch.options = body.options.map(o => ({ letter: o.letter, text_md: o.text_md, marked_in_scan: q.options.find(x => x.letter === o.letter).marked_in_scan }));
    }
    if ("ready" in body) {
      if (body.ready) {
        const cur = eff(e, n);
        const m = msgs(e, n);
        const blockers = [...m.errors, ...hidden(e, { ...cur, ...patch }).filter(r => r !== "not ready")];
        if (blockers.length) throw Object.assign(new Error("no se guardó"), { status: 409, body: { reasons: blockers } });
      }
      patch.ready = !!body.ready;
    }
    if ("answer" in body) {
      if (body.answer && !q.options.some(o => o.letter === body.answer)) throw Object.assign(new Error(`${body.answer} no es una opción de Q${n}`), { status: 400 });
      patch.answer = body.answer || null;
    }
    const id = `${e}__${n}`;
    const prev = (overlay[e] || {})[n] || {};
    const merged = { ...prev, ...patch };
    const row = { exam: e, number: n, patch: merged, saved_at: new Date().toISOString() };
    await db.collection("edits").doc(id).set(row);
    applyRow(row);
    return detail(e, n);
  }

  window.ICFES_STATIC = async function (path, opts) {
    await ready;
    const method = (opts && opts.method) || "GET";
    let m;
    const fail = (status, error) => { throw Object.assign(new Error(error), { status, body: { error } }); };
    try {
      if (method === "GET" && path === "/api/exams") return D.exams.map(progress);
      if ((m = path.match(/^\/api\/exams\/([^/]+)\/questions$/))) return rows(decodeURIComponent(m[1]));
      if ((m = path.match(/^\/api\/exams\/([^/]+)\/questions\/(\d+)$/))) {
        const e = decodeURIComponent(m[1]), n = Number(m[2]);
        if (method === "PUT") return await save(e, n, JSON.parse(opts.body));
        return detail(e, n);
      }
      if ((m = path.match(/^\/api\/exams\/([^/]+)\/validation$/))) return D.validation[decodeURIComponent(m[1])];
      if ((m = path.match(/^\/api\/exams\/([^/]+)\/figures$/))) return D.natives[decodeURIComponent(m[1])] || {};
      return fail(404, "not found");
    } catch (err) {
      if (err.status) throw Object.assign(err, { body: err.body || { error: err.message } });
      throw Object.assign(err, { status: 500 });
    }
  };
  window.ICFES_READONLY = () => readOnly;
})();
