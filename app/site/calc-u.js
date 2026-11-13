// "Puntaje ICFES para entrar a…" pages: the visitor's weighted score for every program in the table.
// Each row carries data-w (weights in %, order CN, LC, M, S, I) and, when the university publishes one, data-cut.
// The form may carry data-min: the minimum score the university asks in every test.
// Rows with data-g instead of data-w are compared on the global score (0-500, ICFES formula: round(5 × (3·LC + 3·M +
// 3·S + 3·CN + I) / 13)); the form may carry data-gmin, the minimum global a university asks to apply, and
// data-kind="minimos" when each row's data-cut is a minimum to meet (ICETEX by municipality, a beca) rather than a cut line,
// or data-kind="promedio" when the single row is a plain average with no cut (Rosario beca).
(function () {
  var form = document.getElementById("ucalc");
  if (!form) return;
  var rows = [].slice.call(document.querySelectorAll("tr[data-w], tr[data-g]"));
  var note = document.getElementById("ucalc-note");
  var min = Number(form.getAttribute("data-min") || 0);
  var gmin = Number(form.getAttribute("data-gmin") || 0);
  var IDS = ["cn", "lc", "ma", "sc", "in"];
  var NAMES = { cn: "Ciencias naturales", lc: "Lectura crítica", ma: "Matemáticas", sc: "Sociales y ciudadanas", in: "Inglés" };
  var first = note.textContent;
  function fmt(n) { return n.toFixed(2).replace(".", ","); }
  function update() {
    var v = {}, all = true, low = [];
    IDS.forEach(function (k) {
      var el = form.elements[k];
      var x = el.value === "" ? null : Math.round(Number(el.value));
      if (x != null && (isNaN(x) || x < 0 || x > 100)) { el.setAttribute("aria-invalid", "true"); x = null; }
      else el.removeAttribute("aria-invalid");
      v[k] = x;
      if (x == null) all = false;
      else if (min && x < min) low.push(NAMES[k]);
    });
    var pass = 0, withCut = 0;
    var global = all ? Math.round(5 * (3 * (v.lc + v.ma + v.sc + v.cn) + v.in) / 13) : 0;
    rows.forEach(function (r) {
      var cell = r.querySelector(".you");
      r.classList.remove("ok", "near");
      if (!all) { cell.textContent = "–"; return; }
      var s, isG = r.hasAttribute("data-g");
      if (isG) {
        s = global;
        cell.textContent = String(s);
      } else {
        var w = r.getAttribute("data-w").split(",").map(Number);
        s = 0;
        IDS.forEach(function (k, i) { s += w[i] * v[k]; });
        s = s / 100;
        cell.textContent = fmt(s);
      }
      var cut = parseFloat(r.getAttribute("data-cut"));
      if (!isNaN(cut)) {
        withCut++;
        if (s >= cut) { r.classList.add("ok"); pass++; }
        else if (s >= cut - (isG ? 15 : 3)) r.classList.add("near");
      }
    });
    if (!all) { note.textContent = first; return; }
    var msg = !withCut ? (rows.length && rows.every(function (r) { return r.hasAttribute("data-g"); })
        ? "Tu puntaje global es " + global + " de 500. Sin corte publicado, compites con los inscritos de cada semestre."
        : "Este es tu ponderado en cada programa. Sin corte publicado, compites con los inscritos de cada semestre.")
      : withCut === 1 ? (pass ? "Quedas igual o por encima del último corte publicado." : "Todavía estás por debajo del último corte publicado.")
      : "Quedas igual o por encima del último corte en " + pass + " de " + withCut + " programas con corte publicado.";
    if (form.getAttribute("data-kind") === "promedio" && rows.length) msg = "Tu promedio es " + rows[0].querySelector(".you").textContent + " sobre 100. No hay corte publicado: compites con los demás admitidos.";
    if (form.getAttribute("data-kind") === "minimos") msg = "Tu puntaje global es " + global + " de 500. Cumples el mínimo en " + pass + " de " + withCut + " filas de la tabla.";
    if (gmin && global < gmin) msg += " Ojo: esta universidad pide un puntaje global mínimo de " + gmin + " para inscribirte y el tuyo es " + global + ".";
    if (low.length) msg += " Ojo: esta universidad pide mínimo " + min + " en cada prueba y te falta en " + low.join(", ") + ".";
    note.textContent = msg;
  }
  form.addEventListener("input", update);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
})();
