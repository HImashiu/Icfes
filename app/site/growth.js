// Growth runtime of the public site (docs/growth/LEDGER.md). Loaded by site.js on every page, after it. Everything
// here is an extra on a page that already works without it: each part fails quietly and nothing blocks rendering.
//
//   F1  events: page views, button taps (any link into the app or [data-ev]), scroll depth, tool use → track_events
//   F3  experiments: a stable variant per visitor (hash of the visitor id), exposure event, the page changes
//   F4  errors: JavaScript errors grouped by fingerprint → log_client_error
//   F5  Core Web Vitals of real visitors (LCP, CLS, INP, FCP, TTFB) per page family
//   F6  404s: the missing path is recorded and the page suggests the closest real pages
//   F8  referral and partner links (?ref=code): kept in this browser and carried into the app
//   F23 public questions: first try recorded; "El 63 % acertó" under a question once 20 visitors tried it
//   F25 returning visitors and invited visitors get their own message on the landing
//   F26 contextual sticky button on guides (experiment sticky-cta), with the area of the page
//   F27 social proof: answers of the week, only above a minimum
//   F29 campaign notices from the database (dates, audience)
//   F31 approved testimonials where a page asks for them ([data-testimonials])
//   F50 sign-up recovery: someone who started «Entrar con Google» and didn't finish gets a one-tap way back
// Privacy: the random id this browser keeps (condor:vid, shared with the app). No IP, no third-party cookie.
(function () {
  "use strict";
  var SUPABASE_URL = "__SUPABASE_URL__";
  var SUPABASE_KEY = "__SUPABASE_ANON_KEY__";
  var configured = SUPABASE_URL.indexOf("https://") === 0 && SUPABASE_KEY.length > 20;
  var W = window, D = document, L = location;
  var store = {
    get: function (k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { W.localStorage.setItem(k, v); } catch (e) { /* blocked */ } },
    del: function (k) { try { W.localStorage.removeItem(k); } catch (e) { /* blocked */ } },
    json: function (k) { try { return JSON.parse(W.localStorage.getItem(k) || "null"); } catch (e) { return null; } },
  };
  var BOT = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp/i.test(navigator.userAgent || "");
  var base = (function () {
    var s = D.querySelector('script[src$="growth.js"]');
    return s ? s.src.replace(/growth\.js(\?.*)?$/, "") : "/";
  })();

  // Styles for the pieces this file adds.
  (function () {
    var link = D.createElement("link");
    link.rel = "stylesheet";
    link.href = base + "growth.css";
    D.head.appendChild(link);
  })();

  function rpc(name, body) {
    if (!configured) return Promise.reject(new Error("not configured"));
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      keepalive: true,
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.status === 204 ? null : r.json(); });
  }

  function visitorId() {
    var id = store.get("condor:vid");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      id = W.crypto && crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
        return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
      });
      store.set("condor:vid", id);
    }
    return id;
  }
  var VID = visitorId();

  // Page family, for the readouts ("pregunta-icfes", "landing", "simulacro-icfes"...).
  var TPL = D.body.getAttribute("data-tpl") || (L.pathname.replace(/^\/+/, "").split("/")[0] || "landing");

  // ------------------------------------------------------------------------------------------ F1 events
  var queue = [];
  var timer = null;
  function flush() {
    timer = null;
    if (!queue.length || BOT) { queue = []; return; }
    var rows = queue.splice(0, 30);
    rpc("track_events", { p_visitor: VID, p_rows: rows }).catch(function () {});
    if (queue.length) timer = setTimeout(flush, 800);
  }
  function ev(name, props) {
    queue.push({ n: name, p: L.pathname.slice(0, 160), x: props || {} });
    if (!timer) timer = setTimeout(flush, 1500);
  }
  W.condorEv = ev;
  D.addEventListener("visibilitychange", function () { if (D.visibilityState === "hidden") { clearTimeout(timer); flush(); } });
  W.addEventListener("pagehide", function () { clearTimeout(timer); flush(); });

  function sourceOf() {
    try {
      var q = new URLSearchParams(L.search);
      var utm = q.get("utm_source") || q.get("fuente");
      if (utm) return utm.slice(0, 60);
      if (!D.referrer) return "directo";
      var host = new URL(D.referrer).hostname.replace(/^www\.|^m\.|^l\.|^lm\./, "");
      return host && host !== L.hostname.replace(/^www\./, "") ? host : "interno";
    } catch (e) { return null; }
  }
  var params = new URLSearchParams(L.search);
  var visits = Number(store.get("condor:visits") || "0") + (store.get("condor:visit-day") === new Date().toDateString() ? 0 : 1);
  store.set("condor:visits", String(visits));
  store.set("condor:visit-day", new Date().toDateString());
  ev("page:view", { tpl: TPL, src: sourceOf(), n: visits, w: Math.round(W.innerWidth / 100) * 100 });

  // Taps on anything that leads into the app, and on any element with data-ev="name".
  D.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("a, button, [data-ev]") : null;
    if (!el) return;
    var named = el.getAttribute("data-ev");
    var href = el.getAttribute("href") || "";
    if (named) ev(named.indexOf(":") > 0 ? named : "ui:" + named, { tpl: TPL, t: (el.textContent || "").trim().slice(0, 40) });
    if (/(^|\/)app\/(\?|#|$)/.test(href) && !el.hasAttribute("data-no-cta")) {
      var place = el.closest("header") ? "header" : el.closest(".hero, .guide-head") ? "hero" : el.closest(".g-sticky") ? "sticky" : el.closest("footer") ? "footer" : "body";
      ev("cta:click", { tpl: TPL, at: place, t: (el.textContent || "").trim().slice(0, 40), href: href.slice(0, 120) });
    }
    if (/wa\.me|whatsapp/.test(href)) ev("share:whatsapp", { tpl: TPL });
  }, true);

  // How far people read.
  (function () {
    var marks = [25, 50, 75, 100], sent = {};
    var onScroll = function () {
      var max = D.documentElement.scrollHeight - W.innerHeight;
      if (max <= 0) return;
      var pct = (W.scrollY / max) * 100;
      marks.forEach(function (m) { if (pct >= m - 2 && !sent[m]) { sent[m] = 1; ev("scroll", { tpl: TPL, d: m }); } });
    };
    W.addEventListener("scroll", function () { if (W.requestAnimationFrame) requestAnimationFrame(onScroll); }, { passive: true });
  })();

  // ------------------------------------------------------------------------------------------ F4 errors
  var errSeen = {};
  function fp(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function reportError(message, source, stack) {
    if (BOT || !message) return;
    var msg = String(message).slice(0, 300);
    if (/ResizeObserver loop|Script error\.?$/.test(msg)) return;
    var key = fp(msg + "|" + String(source || "").replace(/\?.*$/, "").replace(/:\d+:\d+$/, ""));
    if (errSeen[key]) return;
    errSeen[key] = 1;
    var known = store.json("condor:errs") || {};
    var first = !known[key];
    known[key] = 1;
    store.set("condor:errs", JSON.stringify(known));
    rpc("log_client_error", { p_fp: key, p_message: msg, p_source: String(source || "").slice(0, 200), p_path: L.pathname.slice(0, 160), p_stack: String(stack || "").slice(0, 1500), p_surface: "site", p_first: first }).catch(function () {});
  }
  W.addEventListener("error", function (e) { if (e && e.message) reportError(e.message, (e.filename || "") + ":" + (e.lineno || 0), e.error && e.error.stack); });
  W.addEventListener("unhandledrejection", function (e) { var r = e && e.reason; reportError(r && r.message ? r.message : String(r), "promise", r && r.stack); });

  // ------------------------------------------------------------------------------------------ F5 web vitals
  (function () {
    if (!("PerformanceObserver" in W) || BOT) return;
    var v = {};
    var obs = function (type, fn, opts) { try { var o = new PerformanceObserver(function (l) { l.getEntries().forEach(fn); }); o.observe(Object.assign({ type: type, buffered: true }, opts || {})); } catch (e) { /* not supported */ } };
    obs("largest-contentful-paint", function (e) { v.LCP = e.startTime; });
    obs("paint", function (e) { if (e.name === "first-contentful-paint") v.FCP = e.startTime; });
    obs("layout-shift", function (e) { if (!e.hadRecentInput) v.CLS = (v.CLS || 0) + e.value; });
    obs("event", function (e) { if (e.interactionId) v.INP = Math.max(v.INP || 0, e.duration); }, { durationThreshold: 40 });
    try { var nav = performance.getEntriesByType("navigation")[0]; if (nav) v.TTFB = nav.responseStart; } catch (e) { /* none */ }
    var sent = false;
    D.addEventListener("visibilitychange", function () {
      if (D.visibilityState !== "hidden" || sent) return;
      sent = true;
      Object.keys(v).forEach(function (m) { ev("vital", { m: m, v: m === "CLS" ? Math.round(v[m] * 1000) / 1000 : Math.round(v[m]), tpl: TPL }); });
      flush();
    });
  })();

  // ------------------------------------------------------------------------------------------ F3 experiments
  // FNV-1a of "visitor:experiment" → 0..99, compared with the weights. The same function is in the app
  // (src/lib/growth/experiments.js), so a visitor keeps their variant on both sides.
  function bucket(key) { var h = 2166136261, s = VID + ":" + key; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; }
  function variantOf(exp) {
    var vs = exp.variants || [];
    if (!vs.length) return null;
    if (!exp.running) return exp.winner || vs[0];
    var forced = params.get("exp_" + exp.key);
    if (forced && vs.indexOf(forced) >= 0) return forced;
    var ws = exp.weights && exp.weights.length === vs.length ? exp.weights : vs.map(function () { return 100 / vs.length; });
    var b = bucket(exp.key), acc = 0;
    for (var i = 0; i < vs.length; i++) { acc += ws[i]; if (b < acc) return vs[i]; }
    return vs[vs.length - 1];
  }
  var experiments = (function () {
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem("condor:exps") || "null"); } catch (e) { /* none */ }
    if (cached && cached.at > Date.now() - 10 * 60 * 1000) return Promise.resolve(cached.list);
    return rpc("active_experiments", {}).then(function (list) {
      try { sessionStorage.setItem("condor:exps", JSON.stringify({ at: Date.now(), list: list || [] })); } catch (e) { /* blocked */ }
      return list || [];
    }).catch(function () { return []; });
  })();
  function withExperiment(key, apply) {
    experiments.then(function (list) {
      var exp = null;
      for (var i = 0; i < list.length; i++) if (list[i].key === key) exp = list[i];
      if (!exp) { apply(null); return; }
      var v = variantOf(exp);
      apply(v);
      if (exp.running) ev("exp:expose", { k: key, v: v });
    });
  }

  // Landing hero button (experiment hero-cta).
  var heroCta = D.querySelector(".hero .btn-go[href*='empezar']");
  if (heroCta) {
    withExperiment("hero-cta", function (v) {
      if (v === "pregunta" && !heroCta.getAttribute("data-personal")) heroCta.firstChild.nodeValue = "Haz tu primera pregunta ";
    });
  }

  // ------------------------------------------------------------------------------------------ F8 referral links
  // ?ref=<code> (a friend's or a partner's link) and ?de=<first name>: kept 30 days and added to every link into the
  // app, where the account claims it once signed in (src/lib/growth/referral.js).
  (function () {
    var ref = (params.get("ref") || "").toLowerCase();
    if (/^[a-z0-9-]{3,24}$/.test(ref)) {
      var de = (params.get("de") || "").replace(/[^\p{L} ]/gu, "").slice(0, 20);
      store.set("condor:ref", JSON.stringify({ code: ref, de: de, via: params.get("via") || "amigo", at: Date.now() }));
      ev("ref:land", { code: ref, via: params.get("via") || "amigo" });
    }
    var saved = store.json("condor:ref");
    if (!saved || saved.at < Date.now() - 30 * 864e5) return;
    D.querySelectorAll('a[href*="app/"]').forEach(function (a) {
      var href = a.getAttribute("href");
      if (/[?&]ref=/.test(href) || /#/.test(href)) return;
      a.setAttribute("href", href + (href.indexOf("?") >= 0 ? "&" : "?") + "ref=" + encodeURIComponent(saved.code) + (saved.via && saved.via !== "amigo" ? "&via=" + encodeURIComponent(saved.via) : ""));
    });
  })();

  // ------------------------------------------------------------------------------------------ banner helper
  function banner(id, html, kind) {
    if (store.get("condor:hide:" + id)) return null;
    var el = D.createElement("div");
    el.className = "g-banner " + (kind || "");
    el.setAttribute("role", "status");
    el.innerHTML = '<div class="g-banner-in">' + html + '<button type="button" class="g-x" aria-label="Cerrar">×</button></div>';
    el.querySelector(".g-x").addEventListener("click", function () { store.set("condor:hide:" + id, "1"); el.remove(); ev("banner:close", { id: id }); });
    var main = D.querySelector("main") || D.body;
    main.insertBefore(el, main.firstChild);
    ev("banner:show", { id: id });
    return el;
  }
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var appUrl = function (q) { return base + "app/" + (q || ""); };

  // ------------------------------------------------------------------------------------------ F25 / F50 personal landing
  (function () {
    var ref = store.json("condor:ref");
    var signedBefore = store.get("condor:signed") === "1";
    var authStart = Number(store.get("condor:auth-start") || "0");
    var authDone = store.get("condor:auth-done") === "1";
    // Someone who started signing in a while ago and never finished.
    if (authStart && !authDone && Date.now() - authStart > 2 * 60 * 1000 && Date.now() - authStart < 14 * 864e5) {
      banner("auth-" + Math.floor(authStart / 864e5), '<span><b>Te faltó un paso.</b> Entra con tu cuenta de Google y sigues donde ibas: es un solo toque.</span><a class="btn btn-go btn-sm" data-ev="recover:click" href="' + appUrl("?empezar=1&fuente=recuperar") + '">Terminar</a>', "warm");
      ev("recover:show", {});
    } else if (ref && ref.at > Date.now() - 30 * 864e5 && !signedBefore && TPL === "landing") {
      var who = ref.de ? esc(ref.de) : ref.via === "aliado" ? "Tu profe o academia" : "Un amigo";
      banner("ref-" + ref.code, '<span><b>' + who + ' te invitó a practicar el ICFES.</b> Entra y empiezas con 10 preguntas extra cada día durante tu primera semana.</span><a class="btn btn-go btn-sm" href="' + appUrl("?empezar=1&ref=" + encodeURIComponent(ref.code)) + '">Aceptar</a>', "lime");
    }
    // Returning students: the landing speaks to them as such.
    if (signedBefore && heroCta) {
      heroCta.setAttribute("data-personal", "1");
      heroCta.firstChild.nodeValue = "Seguir practicando ";
      var sub = D.querySelector(".hero .btn-ghost");
      if (sub && /docente/i.test(sub.textContent)) sub.hidden = false;
      ev("personal:returning", {});
    }
  })();

  // ------------------------------------------------------------------------------------------ F29 notices
  if (!BOT) {
    rpc("active_notices", { p_audience: "site" }).then(function (list) {
      (list || []).slice(0, 1).forEach(function (n) {
        var cta = n.cta_url ? '<a class="btn btn-primary btn-sm" data-ev="notice:click" href="' + esc(n.cta_url.replace(/^https:\/\/condoricfes\.com\//, base).replace(/^\//, base)) + '">' + esc(n.cta_label || "Ver") + "</a>" : "";
        banner("notice-" + n.id, "<span><b>" + esc(n.title) + "</b> " + esc(n.body || "") + "</span>" + cta, "ink");
      });
    }).catch(function () {});
  }

  // ------------------------------------------------------------------------------------------ F26 sticky button
  var AREA_OF = [["matematicas", "matematicas", "Matemáticas"], ["lectura-critica", "lectura-critica", "Lectura crítica"], ["sociales", "sociales-y-ciudadanas", "Sociales"],
    ["ciencias", "ciencias-naturales", "Ciencias naturales"], ["ingles", "ingles", "Inglés"]];
  function pageArea() {
    var p = L.pathname;
    for (var i = 0; i < AREA_OF.length; i++) if (p.indexOf(AREA_OF[i][0]) >= 0) return AREA_OF[i];
    var tag = D.querySelector(".guide-head .tag, .qarea");
    var t = tag ? tag.textContent.toLowerCase() : "";
    for (var j = 0; j < AREA_OF.length; j++) if (t.indexOf(AREA_OF[j][2].toLowerCase().slice(0, 6)) >= 0) return AREA_OF[j];
    return null;
  }
  if (D.body.classList.contains("guide") && !D.querySelector("[data-no-sticky]")) {
    withExperiment("sticky-cta", function (v) {
      if (v === "sin-barra") return;
      var area = pageArea();
      var bar = D.createElement("div");
      bar.className = "g-sticky";
      bar.hidden = true;
      var label = area ? "Practica " + area[2] + " con preguntas reales" : "Practica con preguntas reales del ICFES";
      bar.innerHTML = '<span>' + esc(label) + '</span><a class="btn btn-go btn-sm" href="' + appUrl("?empezar=1" + (area ? "&area=" + area[1] : "") + "&fuente=barra") + '">Empezar <span class="go" aria-hidden="true"></span></a><button type="button" class="g-x" aria-label="Cerrar">×</button>';
      D.body.appendChild(bar);
      bar.querySelector(".g-x").addEventListener("click", function () { bar.remove(); store.set("condor:hide:sticky", String(Date.now())); });
      if (Number(store.get("condor:hide:sticky") || 0) > Date.now() - 3 * 864e5) { bar.remove(); return; }
      var shown = false;
      W.addEventListener("scroll", function () {
        var max = D.documentElement.scrollHeight - W.innerHeight;
        var on = max > 0 && W.scrollY / max > 0.4;
        if (on !== !bar.hidden) bar.hidden = !on;
        if (on && !shown) { shown = true; ev("sticky:show", { tpl: TPL, area: area ? area[1] : null }); }
      }, { passive: true });
    });
  }

  // ------------------------------------------------------------------------------------------ F27 social proof
  (function () {
    var spots = D.querySelectorAll("[data-proof]");
    if (!spots.length) return;
    var fill = function (a) {
      if (!a || !a.answers) return;
      spots.forEach(function (el) {
        el.textContent = a.answers.toLocaleString("es-CO") + " preguntas respondidas esta semana" + (a.students ? " por " + a.students.toLocaleString("es-CO") + " estudiantes" : "");
        el.hidden = false;
      });
    };
    var c = store.json("condor:proof");
    if (c && c.at > Date.now() - 3600 * 1000) { fill(c.a); return; }
    rpc("public_activity", {}).then(function (a) { store.set("condor:proof", JSON.stringify({ at: Date.now(), a: a })); fill(a); }).catch(function () {});
  })();

  // ------------------------------------------------------------------------------------------ F31 testimonials
  (function () {
    var box = D.querySelector("[data-testimonials]");
    if (!box) return;
    rpc("approved_testimonials", {}).then(function (list) {
      if (!list || !list.length) return;
      box.innerHTML = list.slice(0, 6).map(function (t) {
        return '<figure class="g-quote"><blockquote>' + esc(t.body) + "</blockquote><figcaption><b>" + esc(t.name) + "</b>" + (t.detail ? " · " + esc(t.detail) : "") + "</figcaption></figure>";
      }).join("");
      box.hidden = false;
      var sec = box.closest("[hidden]");
      if (sec) sec.hidden = false;
    }).catch(function () {});
  })();

  // ------------------------------------------------------------------------------------------ F23 public questions
  (function () {
    var cards = [].slice.call(D.querySelectorAll(".q[data-key][id]"));
    if (!cards.length) return;
    var stats = null;
    var show = function (q) {
      if (!stats || !stats[q.id] || q.querySelector(".g-pct")) return;
      var p = document.createElement("p");
      p.className = "g-pct";
      p.textContent = "El " + stats[q.id].pct + " % de quienes la intentaron aquí acertó en el primer intento.";
      var after = q.querySelector(".ans") || q.lastElementChild;
      after.parentNode.insertBefore(p, after.nextSibling);
    };
    var load = function () {
      if (stats) return Promise.resolve(stats);
      return rpc("public_question_stats", { p_qids: cards.slice(0, 60).map(function (q) { return q.id; }) }).then(function (s) { stats = s || {}; return stats; }).catch(function () { stats = {}; return stats; });
    };
    cards.forEach(function (q) {
      q.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".opt");
        if (!btn || q.getAttribute("data-logged")) return;
        q.setAttribute("data-logged", "1");
        var pick = btn.getAttribute("data-l");
        var right = pick === q.getAttribute("data-key");
        if (!BOT) rpc("log_public_answer", { p_qid: q.id, p_visitor: VID, p_choice: pick, p_correct: right }).catch(function () {});
        ev("pq:answer", { tpl: TPL, ok: right });
        load().then(function () { show(q); });
      });
    });
  })();

  // ------------------------------------------------------------------------------------------ F6 404 page
  if (D.body.hasAttribute("data-nf") || /no existe|no encontrada/i.test(D.title)) {
    var refHost = "";
    try { refHost = D.referrer ? new URL(D.referrer).hostname : ""; } catch (e) { /* none */ }
    ev("nf", { p: L.pathname.slice(0, 150), r: refHost.slice(0, 60) });
    fetch(base + "buscar/index.json").then(function (r) { return r.json(); }).then(function (idx) {
      var words = decodeURIComponent(L.pathname).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; });
      if (!words.length) return;
      var scored = idx.pages.map(function (p) {
        var hay = (p.u + " " + p.t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        var s = 0;
        words.forEach(function (w) { if (hay.indexOf(w) >= 0) s += w.length; });
        return { p: p, s: s };
      }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 5);
      if (!scored.length) return;
      var box = D.createElement("div");
      box.className = "g-nf";
      box.innerHTML = "<p><b>¿Buscabas alguna de estas?</b></p><ul>" + scored.map(function (x) { return '<li><a data-ev="nf:suggest" href="/' + esc(x.p.u) + '">' + esc(x.p.t) + "</a></li>"; }).join("") + '</ul><p><a href="/buscar/">Buscar en Cóndor</a></p>';
      var at = D.querySelector("main .wrap") || D.body;
      at.appendChild(box);
    }).catch(function () {});
  }

  // Pages with tools (diagnóstico, calculadoras, plan...) call this to record what visitors do with them.
  W.condorGrowth = { ev: ev, rpc: rpc, vid: VID, store: store, banner: banner, variantOf: variantOf, bucket: bucket, base: base, flush: flush };
})();
