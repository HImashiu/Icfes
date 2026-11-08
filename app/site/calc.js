// Score calculator page: global 0-500 with the ICFES formula, level per test and national percentile (2022 data).
(function () {
  var form = document.getElementById("calc");
  var dataEl = document.getElementById("calc-data");
  if (!form || !dataEl) return;
  var data = JSON.parse(dataEl.textContent);
  var NAMES = { lc: "Lectura crítica", ma: "Matemáticas", sc: "Sociales y ciudadanas", cn: "Ciencias naturales", in: "Inglés" };
  var W = { lc: 3, ma: 3, sc: 3, cn: 3, in: 1 };
  var dists = {};
  Object.keys(data.dist).forEach(function (k) {
    var d = data.dist[k], n = 0, below = [];
    d.counts.forEach(function (c) { below.push(n); n += c; });
    dists[k] = { min: d.min, max: d.min + d.counts.length - 1, below: below, n: n };
  });
  function pct(k, s) {
    var d = dists[k];
    if (!d) return null;
    if (s <= d.min) return 0;
    if (s > d.max) return 100;
    return Math.min(99, Math.floor((d.below[s - d.min] / d.n) * 100));
  }
  function level(k, s) {
    var ls = data.levels[k];
    for (var i = 0; i < ls.length; i++) if (s >= ls[i][1] && s <= ls[i][2]) return ls[i][0];
    return ls[ls.length - 1][0];
  }
  var out = document.getElementById("calc-levels");
  var g = document.getElementById("calc-global");
  var gp = document.getElementById("calc-gpct");
  function update() {
    var vals = {}, all = true, rows = [];
    Object.keys(W).forEach(function (k) {
      var el = form.elements[k];
      var v = el.value === "" ? null : Math.round(Number(el.value));
      if (v != null && (isNaN(v) || v < 0 || v > 100)) { el.setAttribute("aria-invalid", "true"); v = null; }
      else el.removeAttribute("aria-invalid");
      vals[k] = v;
      if (v == null) { all = false; return; }
      var p = pct(k, v);
      rows.push("<li><span>" + NAMES[k] + "</span><b>" + level(k, v) + "</b><small>superas al " + p + " %</small></li>");
    });
    out.innerHTML = rows.join("");
    if (!all) { g.textContent = "–"; gp.textContent = "Llena las cinco pruebas"; return; }
    var sum = 0;
    Object.keys(W).forEach(function (k) { sum += W[k] * vals[k]; });
    var glob = Math.round((sum / 13) * 5);
    g.textContent = glob;
    gp.textContent = "Superas al " + pct("global", glob) + " % de los estudiantes del país";
  }
  form.addEventListener("input", update);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
})();
