// Landing page forms: the school demo request and the launch-discount list. Both go to the same Supabase project as
// the app (tables from migration 0029). The URL and the publishable key are filled in when the site is assembled
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
