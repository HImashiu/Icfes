// Pregunta ICFES del día (insertar/pregunta-del-dia/, shown in other sites' iframes): picks today's question by the
// date in Colombia, lets the student answer once, then shows the key, a short why and a link to the full explanation.
(function () {
  var dataEl = document.getElementById("pdd-data");
  if (!dataEl) return;
  var list = JSON.parse(dataEl.textContent);
  if (!list.length) return;
  // Days since 1970 in Colombia (UTC-5, no daylight saving), so the question changes at midnight there.
  var day = Math.floor((Date.now() - 5 * 3600 * 1000) / 86400000);
  var q = list[day % list.length];
  var area = document.getElementById("pdd-area");
  area.style.setProperty("--c", q.c);
  area.querySelector("em").textContent = q.area;
  document.getElementById("pdd-q").innerHTML = q.html;
  if (q.src) document.getElementById("pdd-src").textContent = q.src;
  var ul = document.getElementById("pdd-opts");
  var res = document.getElementById("pdd-res");
  var done = false;
  q.opts.forEach(function (o) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.className = "o";
    b.innerHTML = "<b></b><span></span>";
    b.querySelector("b").textContent = o.l;
    b.querySelector("span").innerHTML = o.h;
    b.addEventListener("click", function () {
      if (done) return;
      done = true;
      var right = o.l === q.key;
      b.classList.add(right ? "ok" : "no");
      ul.querySelectorAll("button").forEach(function (x) {
        if (x.querySelector("b").textContent === q.key) x.classList.add("ok");
        x.setAttribute("aria-disabled", "true");
      });
      res.innerHTML = "";
      var p1 = document.createElement("span");
      p1.textContent = (right ? "¡Bien! " : "La respuesta es la " + q.key + ". ") + q.corta + " ";
      var a = document.createElement("a");
      a.href = q.url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Ver la explicación completa ↗";
      res.appendChild(p1); res.appendChild(a);
    });
    li.appendChild(b);
    ul.appendChild(li);
  });
})();
