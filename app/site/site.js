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

  // Landing: hero stickers follow the pointer a little and drift with the scroll; a "how it works" card shrinks and
  // dims while the next one slides over it. One rAF per frame, only while something moved.
  var hero = document.querySelector(".hero");
  var cards = [].slice.call(document.querySelectorAll(".stack .sc"));
  if (!reduce && (hero || cards.length)) {
    var queued = false;
    var frame = function () {
      queued = false;
      if (hero) hero.style.setProperty("--sy", Math.min(window.scrollY, 1200));
      for (var i = 0; i < cards.length - 1; i++) {
        var a = cards[i].getBoundingClientRect(), b = cards[i + 1].getBoundingClientRect();
        // 0 while the next card is a full card-height away, 1 once it has reached its own resting place.
        var gap = b.top - a.top, rest = parseFloat(getComputedStyle(cards[i + 1]).top) - parseFloat(getComputedStyle(cards[i]).top);
        if (isNaN(rest)) { cards[i].style.setProperty("--p", "0"); continue; }
        var p = 1 - (gap - rest) / Math.max(1, a.height);
        cards[i].style.setProperty("--p", Math.max(0, Math.min(1, p)).toFixed(3));
      }
    };
    var ask = function () { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    ask();
    if (hero && window.matchMedia("(pointer: fine)").matches) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        hero.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    }
  }

  // Landing: things to play with. All of it is decoration on a page that already works without it.
  var fine = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
  var on = function (el, ev, fn, opt) { el.addEventListener(ev, fn, opt || false); };
  var rel = function (el, e) { var r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r: r }; };

  // Scroll progress on the header.
  var topBar = document.querySelector(".landing .top");
  if (topBar) {
    var spQ = false;
    var sp = function () { spQ = false; var max = document.documentElement.scrollHeight - window.innerHeight; topBar.style.setProperty("--sp", max > 0 ? (window.scrollY / max).toFixed(4) : "0"); };
    on(window, "scroll", function () { if (!spQ) { spQ = true; requestAnimationFrame(sp); } }, { passive: true });
    sp();
  }

  // Words that try on typefaces (like a type specimen): they flip through a few faces when they first show up, while
  // the pointer moves over them, or when tapped, and always land back on our own. The faces are fetched only for
  // the capital letters these words use, so they cost a few KB.
  var shuf = [].slice.call(document.querySelectorAll("[data-shuffle]"));
  if (shuf.length && !reduce) {
    var FACES = [ // family, style, weight, size so that every face sits about as wide as ours
      ["'Abril Fatface', serif", "normal", 400, 1],
      ["Newsreader, Georgia, serif", "italic", 500, 1.08],
      ["Bungee, sans-serif", "normal", 400, 0.84],
      ["Pacifico, cursive", "normal", 400, 0.82],
      ["'Space Mono', monospace", "normal", 700, 0.86],
      ["Shrikhand, serif", "normal", 400, 0.9],
      ["'Rubik Mono One', sans-serif", "normal", 400, 0.72],
      ["Fraunces, serif", "italic", 900, 0.98],
      ["Monoton, sans-serif", "normal", 400, 0.78],
      ["'Bebas Neue', sans-serif", "normal", 400, 1.22]
    ];
    var GLYPHS = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚ0123456789";
    var ready = false;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Bebas+Neue&family=Bungee&family=Fraunces:ital,opsz,wght@1,9..144,900&family=Monoton&family=Pacifico&family=Rubik+Mono+One&family=Shrikhand&family=Space+Mono:wght@700&display=block&text=" + encodeURIComponent(GLYPHS);
    var whenReady = [];
    on(link, "load", function () {
      if (!document.fonts || !document.fonts.load) { ready = true; whenReady.forEach(function (f) { f(); }); return; }
      Promise.all(FACES.map(function (f) { return document.fonts.load(f[1] + " " + f[2] + " 40px " + f[0], GLYPHS); }))
        .then(function () { ready = true; whenReady.forEach(function (f) { f(); }); }, function () {});
    });
    document.head.appendChild(link);

    var setFace = function (el, f) {
      var s = el.firstElementChild.style;
      if (!f) { s.fontFamily = s.fontStyle = s.fontWeight = s.fontSize = s.letterSpacing = ""; return; }
      s.fontFamily = f[0]; s.fontStyle = f[1]; s.fontWeight = f[2]; s.fontSize = f[3] + "em"; s.letterSpacing = "0";
      // Never much wider than the word in our own face, so nothing overflows on a phone.
      var w = el.firstElementChild.offsetWidth;
      if (el._w && w > el._w * 1.1) s.fontSize = (f[3] * el._w * 1.1 / w).toFixed(3) + "em";
    };
    var land = function (el) { el._off = false; setFace(el, null); el.classList.remove("landed"); void el.offsetWidth; el.classList.add("landed"); };
    var next = function (el) { if (!el._off) el._w = el.firstElementChild.offsetWidth; el._off = true; el._i = ((el._i || 0) + 1 + Math.floor(Math.random() * 2)) % FACES.length; setFace(el, FACES[el._i]); };
    var burst = function (el, n, ms) {
      if (!ready || el._t) return;
      var k = 0;
      el._t = setInterval(function () {
        if (k++ >= n) { clearInterval(el._t); el._t = 0; land(el); return; }
        next(el);
      }, ms || 80);
    };
    var seen = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        seen.unobserve(e.target);
        var el = e.target;
        setTimeout(function () { if (ready) burst(el, el.closest(".hero") ? 12 : 7); else whenReady.push(function () { burst(el, 7); }); }, el.closest(".hero") ? 900 : 350);
      });
    }, { threshold: 0.6 }) : null;
    shuf.forEach(function (el) {
      if (seen) seen.observe(el);
      var zone = el.closest(".hero") || el.closest("summary") || el;
      var lx = null, ly = 0, acc = 0, idle = 0;
      if (fine) {
        on(zone, "pointermove", function (e) {
          if (!ready || el._t) return;
          if (lx !== null) acc += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
          lx = e.clientX; ly = e.clientY;
          if (acc > 70) { acc = 0; next(el); }
          clearTimeout(idle);
          idle = setTimeout(function () { if (el._off && !el._t) land(el); }, 650);
        });
        on(zone, "pointerleave", function () { lx = null; clearTimeout(idle); if (!el._t && el._off) land(el); });
      } else {
        on(el, "click", function () { burst(el, 8); });
      }
    });
  }

  // The squares of the grid light up under the pointer.
  if (fine) {
    [].forEach.call(document.querySelectorAll(".dots, .dots-dark"), function (sec) {
      on(sec, "pointermove", function (e) {
        var r = sec.getBoundingClientRect();
        sec.style.setProperty("--px", (e.clientX - r.left) + "px");
        sec.style.setProperty("--py", (e.clientY - r.top) + "px");
        sec.classList.add("lit");
      });
      on(sec, "pointerleave", function () { sec.classList.remove("lit"); });
    });
  }

  // The owls: they look at the pointer (or where you tap), get happy when you point at them, celebrate when you tap
  // them, and now and then do something on their own (think, flap, hop), like the "Búho de Cóndor" animation.
  var owls = [].slice.call(document.querySelectorAll("svg.ow"));
  var lookers = owls.concat([].slice.call(document.querySelectorAll(".peek-head svg")));
  if (owls.length && !reduce) {
    var eyeQ = false, ex = 0, ey = 0, eyeIdle = 0;
    var inView = function (o) { var r = o.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < window.innerHeight ? r : null; };
    var look = function () {
      eyeQ = false;
      lookers.forEach(function (o) {
        var r = inView(o);
        if (!r) return;
        var dx = ex - (r.left + r.width / 2), dy = ey - (r.top + r.height * 0.42);
        var d = Math.sqrt(dx * dx + dy * dy) + Math.max(60, r.width * 0.6);
        o.style.setProperty("--ex", (dx / d).toFixed(3));
        o.style.setProperty("--ey", (dy / d).toFixed(3));
        o.classList.add("tracking");
      });
    };
    var aim = function (x, y, ms) {
      ex = x; ey = y;
      if (!eyeQ) { eyeQ = true; requestAnimationFrame(look); }
      clearTimeout(eyeIdle);
      // Back to looking around on their own after a while without the pointer.
      eyeIdle = setTimeout(function () { lookers.forEach(function (o) { o.classList.remove("tracking"); }); }, ms);
    };
    on(window, "pointermove", function (e) { if (e.pointerType === "mouse" || e.pointerType === "pen") aim(e.clientX, e.clientY, 4000); }, { passive: true });
    on(window, "pointerdown", function (e) { aim(e.clientX, e.clientY, 2200); }, { passive: true });
    on(document, "mouseleave", function () { clearTimeout(eyeIdle); lookers.forEach(function (o) { o.classList.remove("tracking"); }); });

    var POSE_MS = { "pose-happy": 1100, "pose-party": 2400, "pose-think": 1900, "pose-flap": 1100 };
    var pose = function (o, name) {
      if (o._pose) return;
      o._pose = name; o.classList.add(name);
      setTimeout(function () { o.classList.remove(name); o._pose = null; }, POSE_MS[name]);
    };
    owls.forEach(function (o) {
      var box = o.parentElement;
      if (fine) on(box, "pointerenter", function () { pose(o, "pose-happy"); });
      on(box, "click", function () { o.classList.remove("pose-happy"); o._pose = null; pose(o, "pose-party"); });
    });
    // The hero owl cheers when you point at the main button.
    var heroOwl = document.querySelector(".h-owl svg.ow");
    if (heroOwl && fine) [].forEach.call(document.querySelectorAll(".hero .btn-go"), function (b) { on(b, "pointerenter", function () { pose(heroOwl, "pose-happy"); }); });
    // Now and then an owl on screen does something on its own.
    var IDLE = ["pose-think", "pose-flap", "pose-happy", "pose-think"];
    setInterval(function () {
      if (document.hidden) return;
      var vis = owls.filter(function (o) { return inView(o) && !o._pose; });
      if (vis.length) pose(vis[Math.floor(Math.random() * vis.length)], IDLE[Math.floor(Math.random() * IDLE.length)]);
    }, 6500);
  }

  // Stickers you can pick up and drop anywhere (mouse or finger).
  [].forEach.call(document.querySelectorAll(".hero-stk, .final .sticker"), function (s) {
    var id = null, sx = 0, sy = 0, bx = 0, by = 0;
    on(s, "pointerdown", function (e) {
      id = e.pointerId; sx = e.clientX - bx; sy = e.clientY - by;
      try { s.setPointerCapture(id); } catch (err) {}
      s.classList.remove("dropped"); s.classList.add("held"); e.preventDefault();
    });
    on(s, "pointermove", function (e) {
      if (e.pointerId !== id) return;
      bx = e.clientX - sx; by = e.clientY - sy;
      s.style.translate = bx + "px " + by + "px";
    });
    var up = function (e) {
      if (e.pointerId !== id) return;
      id = null; s.classList.remove("held");
      if (!reduce) { s.classList.add("dropped"); setTimeout(function () { s.classList.remove("dropped"); }, 500); }
    };
    on(s, "pointerup", up); on(s, "pointercancel", up);
  });

  if (fine && !reduce) {
    // Cards tilt toward the pointer and catch a shine.
    [].forEach.call(document.querySelectorAll(".fan-card, .cookie, .ticket, .tile"), function (el) {
      on(el, "pointermove", function (e) {
        var p = rel(el, e);
        el.style.setProperty("--tx", ((p.x - 0.5) * 16).toFixed(2) + "deg");
        el.style.setProperty("--ty", ((0.5 - p.y) * 16).toFixed(2) + "deg");
        el.style.setProperty("--gx", (p.x * 100).toFixed(1) + "%");
        el.style.setProperty("--gy", (p.y * 100).toFixed(1) + "%");
      });
      on(el, "pointerleave", function () { el.style.removeProperty("--tx"); el.style.removeProperty("--ty"); });
    });

    // Buttons lean toward the pointer.
    [].forEach.call(document.querySelectorAll(".landing .btn-go, .landing .btn-ink, .p-go"), function (b) {
      b.classList.add("mag");
      on(b, "pointermove", function (e) {
        var p = rel(b, e);
        b.style.setProperty("--bx", ((p.x - 0.5) * 12).toFixed(1) + "px");
        b.style.setProperty("--by", ((p.y - 0.5) * 10).toFixed(1) + "px");
      });
      on(b, "pointerleave", function () { b.style.removeProperty("--bx"); b.style.removeProperty("--by"); });
    });

    // The morphing blobs drift with the pointer.
    [].forEach.call(document.querySelectorAll("svg.blobs"), function (svg) {
      var sec = svg.parentElement;
      on(sec, "pointermove", function (e) {
        var p = rel(sec, e);
        svg.style.setProperty("--mx", (p.x - 0.5).toFixed(3));
        svg.style.setProperty("--my", (p.y - 0.5).toFixed(3));
      });
    });
  }

  // The marquee runs with the scroll: faster when you scroll, backwards when you scroll up, slower under the pointer.
  var tracks = [].slice.call(document.querySelectorAll(".band-track"));
  if (tracks.length && !reduce && "IntersectionObserver" in window) {
    var mPos = 0, mDir = 1, mVel = 0, mY = window.scrollY, mLast = 0, mOn = false, mSlow = false, mRaf = 0;
    tracks.forEach(function (t) { t.style.animation = "none"; });
    on(window, "scroll", function () {
      var d = window.scrollY - mY; mY = window.scrollY;
      if (d) mDir = d > 0 ? 1 : -1;
      mVel = Math.min(1.2, mVel + Math.abs(d) * 0.004);
    }, { passive: true });
    var mTick = function (t) {
      var dt = mLast ? Math.min(50, t - mLast) : 16; mLast = t;
      mVel *= 0.94;
      var speed = (0.06 + mVel) * (mSlow ? 0.3 : 1);
      tracks.forEach(function (tr) {
        var half = tr.scrollWidth / 2;
        var pos = (tr._pos || 0) - mDir * speed * dt;
        if (pos <= -half) pos += half;
        if (pos > 0) pos -= half;
        tr._pos = pos;
        tr.style.transform = "translate3d(" + pos.toFixed(1) + "px,0,0)";
      });
      mRaf = mOn ? requestAnimationFrame(mTick) : 0;
    };
    var mIo = new IntersectionObserver(function (entries) {
      mOn = entries.some(function (e) { return e.isIntersecting; });
      if (mOn && !mRaf) { mLast = 0; mRaf = requestAnimationFrame(mTick); }
    });
    tracks.forEach(function (tr) {
      mIo.observe(tr.parentElement);
      if (fine) { on(tr.parentElement, "pointerenter", function () { mSlow = true; }); on(tr.parentElement, "pointerleave", function () { mSlow = false; }); }
    });
  }

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
  // Phone, tablet or computer. Nothing else about the device is sent.
  function deviceKind() {
    try {
      var ua = navigator.userAgent || "";
      if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
      if ((navigator.userAgentData && navigator.userAgentData.mobile) || /Mobi|iPhone|iPod|Android/i.test(ua)) return "movil";
      return Math.min(screen.width || 1200, screen.height || 1200) < 600 ? "movil" : "computador";
    } catch (e) { return null; }
  }
  var tracked = {};
  window.condorTrack = function (event) {
    var id = visitorId();
    if (!id || tracked[event] || !configured) return;
    tracked[event] = true;
    var args = { p_visitor: id, p_event: event, p_path: location.pathname, p_source: sourceOf() };
    // p_device arrives with migration 0040; before it runs, the 4-argument call still works.
    post("rpc/track_visit", Object.assign({ p_device: deviceKind() }, args)).catch(function () {
      post("rpc/track_visit", args).catch(function () {});
    });
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
