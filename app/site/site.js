// Landing page behaviour: scroll reveals, the sample question with the peeking owl, number count-up, and the two
// forms (school demo request and launch-discount list).
document.documentElement.classList.add("js");

(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reveal sections as they scroll in.
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }

  // Landing: the doubt cookies flip to their answer; the moving shapes stand still for reduced motion; only one big
  // word is open at a time.
  document.querySelectorAll(".cookie").forEach(function (c) {
    c.addEventListener("click", function () { c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true"); });
  });
  if (reduce) document.querySelectorAll("svg.blobs").forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });
  var words = document.querySelectorAll(".word");
  words.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (d.open) words.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  // Count the hero numbers up once.
  var fmt = function (n) { return n.toLocaleString("es-CO"); };
  document.querySelectorAll("[data-count]").forEach(function (el) {
    var end = +el.getAttribute("data-count");
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduce) { el.textContent = fmt(end) + suffix; return; }
    var t0 = null, dur = 1100;
    el.textContent = "0";
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(Math.round(end * (1 - Math.pow(1 - k, 3)))) + (k < 1 ? "" : suffix);
      if (k < 1) requestAnimationFrame(step);
    }
    setTimeout(function () { requestAnimationFrame(step); }, 450);
  });


  // Question pages: answer any question card; the right answer shows and its "Ver la respuesta" opens.
  document.querySelectorAll(".q[data-key]").forEach(function (q) {
    var key = q.getAttribute("data-key");
    var opts = q.querySelectorAll(".opt");
    opts.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pick = btn.getAttribute("data-l");
        opts.forEach(function (o) {
          o.disabled = true;
          var l = o.getAttribute("data-l");
          if (l === key) o.classList.add("correct");
          else if (l === pick) o.classList.add("incorrect");
          else o.classList.add("dim");
        });
        var ans = q.querySelector(".ans");
        if (ans) {
          ans.open = true;
          var s = ans.querySelector("summary");
          if (s) s.textContent = pick === key ? "¡Correcto!" : "Casi. Mira la respuesta";
        }
        q.setAttribute("data-done", pick === key ? "ok" : "bad");
        if (window.condorTrack) window.condorTrack("sample");
        miniScore(q.closest(".mini"));
      });
    });
  });

  // Mini simulacro pages: once every question is answered, show the score.
  function miniScore(mini) {
    if (!mini) return;
    var qs = mini.querySelectorAll(".q[data-key]");
    var done = mini.querySelectorAll(".q[data-done]");
    if (done.length < qs.length) return;
    var ok = mini.querySelectorAll('.q[data-done="ok"]').length;
    var box = mini.querySelector(".mini-score");
    if (!box) return;
    var share = ok / qs.length;
    box.querySelector("strong").textContent = "Acertaste " + ok + " de " + qs.length;
    box.querySelector("span").textContent = share === 1 ? "¡Perfecto! Mide tu nivel con un simulacro completo." : share >= 0.6 ? "Vas bien. Repasa las que fallaste y prueba el simulacro completo." : "Repasa las respuestas de arriba y sigue practicando: así se sube el puntaje.";
    if (!box.querySelector(".share-wa")) {
      var wa = document.createElement("a");
      wa.className = "btn btn-ghost btn-sm share-wa";
      wa.target = "_blank";
      wa.rel = "noopener";
      wa.textContent = "Compartir por WhatsApp";
      var page = location.origin + location.pathname + "?fuente=wa-mini";
      wa.href = "https://wa.me/?text=" + encodeURIComponent("Preguntas reales del ICFES para practicar gratis, con respuestas: " + page);
      box.appendChild(wa);
    }
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // The sample question: answer like in the app; the owl reacts.
  var card = document.getElementById("muestra");
  if (card) {
    var KEY = "B";
    var peek = document.getElementById("peek");
    var verdict = document.getElementById("verdict");
    var opts = card.querySelectorAll(".opt");
    var xp = document.getElementById("xp");
    var xpN = document.getElementById("xp-n");
    opts.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pick = btn.getAttribute("data-l");
        var right = pick === KEY;
        opts.forEach(function (o) {
          o.disabled = true;
          var l = o.getAttribute("data-l");
          o.setAttribute("aria-checked", l === pick ? "true" : "false");
          if (l === KEY) o.classList.add("correct");
          else if (l === pick) o.classList.add("incorrect");
          else o.classList.add("dim");
        });
        if (window.condorTrack) window.condorTrack("sample");
        peek.classList.remove("happy", "think");
        void peek.offsetWidth;
        peek.classList.add(right ? "happy" : "think");
        verdict.hidden = false;
        verdict.className = "verdict " + (right ? "ok" : "bad");
        document.getElementById("verdict-t").textContent = right ? "¡Correcto!" : "Casi.";
        document.getElementById("verdict-s").textContent = right
          ? "La raíz de un cuadrado es un valor absoluto: x − 1 también puede ser −2, y x = −1 es otra solución."
          : "La respuesta es B: en el paso 3 falta el caso x − 1 = −2, que da x = −1.";
        if (right) {
          xpN.textContent = "10";
          xp.classList.remove("pop"); void xp.offsetWidth; xp.classList.add("pop");
          var f = document.createElement("span");
          f.className = "floater";
          f.textContent = "+10 XP";
          var r = btn.getBoundingClientRect(), c = card.getBoundingClientRect();
          f.style.left = (r.right - c.left - 90) + "px";
          f.style.top = (r.top - c.top) + "px";
          card.appendChild(f);
          setTimeout(function () { f.remove(); }, 1000);
        }
      });
    });
  }
})();

// The forms go to the same Supabase project as the app (tables from migration 0029). The URL and the publishable key are filled in when the site is assembled
// (scripts/build-site.mjs); both are public by design, and row-level security only lets the public insert.
(function () {
  var SUPABASE_URL = "__SUPABASE_URL__";
  var SUPABASE_KEY = "__SUPABASE_ANON_KEY__";
  var configured = SUPABASE_URL.indexOf("https://") === 0 && SUPABASE_KEY.length > 20;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function post(path, body) {
    if (!configured) return Promise.reject(new Error("not configured"));
    return fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
    });
  }

  // Usage statistics (migration 0037): a random id kept by this browser (shared with the app), the page, where the
  // visit came from, and whether a sample question was answered. No IP, no name, no third-party cookie.
  function visitorId() {
    try {
      var id = localStorage.getItem("condor:vid");
      if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
        id = crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
          return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
        });
        localStorage.setItem("condor:vid", id);
      }
      return id;
    } catch (e) { return null; }
  }
  function sourceOf() {
    try {
      var q = new URLSearchParams(location.search);
      var utm = q.get("utm_source") || q.get("fuente");
      if (utm) return utm.slice(0, 80);
      if (!document.referrer) return null;
      var host = new URL(document.referrer).hostname.replace(/^www\.|^m\.|^l\.|^lm\./, "");
      return host && host !== location.hostname.replace(/^www\./, "") ? host : null;
    } catch (e) { return null; }
  }
  var tracked = {};
  window.condorTrack = function (event) {
    var id = visitorId();
    if (!id || tracked[event] || !configured) return;
    tracked[event] = true;
    post("rpc/track_visit", { p_visitor: id, p_event: event, p_path: location.pathname, p_source: sourceOf() }).catch(function () {});
  };
  window.condorTrack("view");

  function say(form, text, kind) {
    var msg = form.querySelector(".form-msg");
    msg.textContent = text;
    msg.className = "form-msg" + (kind ? " " + kind : "");
  }

  var lista = document.getElementById("form-lista");
  if (lista) {
    lista.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = lista.querySelector("input");
      var email = input.value.trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 200) {
        input.setAttribute("aria-invalid", "true");
        say(lista, "Escribe un correo válido.", "err");
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
      var btn = lista.querySelector("button");
      btn.disabled = true;
      say(lista, "Guardando…");
      post("rpc/join_launch_waitlist", { p_email: email, p_source: "landing" })
        .then(function () {
          input.value = "";
          say(lista, "¡Listo! Te avisaremos antes de abrir los precios y tendrás tu descuento.", "ok");
        })
        .catch(function () { say(lista, "No pudimos guardar tu correo. Inténtalo de nuevo en unos minutos.", "err"); })
        .then(function () { btn.disabled = false; });
    });
  }

  var colegio = document.getElementById("form-colegio");
  if (colegio) {
    colegio.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = colegio.elements;
      var missing = null;
      ["nombre", "colegio", "contacto"].forEach(function (name) {
        var el = f[name];
        var empty = !el.value.trim();
        if (empty) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
        if (empty && !missing) missing = el;
      });
      if (missing) { say(colegio, "Completa los tres campos.", "err"); missing.focus(); return; }
      var btn = colegio.querySelector("button");
      btn.disabled = true;
      say(colegio, "Enviando…");
      post("public_feedback", {
        kind: "school",
        message: ("Demostración para colegio. Nombre: " + f.nombre.value.trim() + ". Colegio: " + f.colegio.value.trim()).slice(0, 2000),
        contact: f.contacto.value.trim().slice(0, 200),
        client: "landing",
      })
        .then(function () {
          colegio.reset();
          say(colegio, "¡Gracias! Te escribimos pronto para agendar la demostración.", "ok");
        })
        .catch(function () { say(colegio, "No se pudo enviar. Inténtalo de nuevo en unos minutos.", "err"); })
        .then(function () { btn.disabled = false; });
    });
  }
})();
