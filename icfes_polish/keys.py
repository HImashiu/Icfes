"""Keys, explanations and hints that agree with each other.

Rounds (each builds a request file for the laptop relay, or reads its answers):
  solve    two blind solves per question (the second with the options in another order), scan without the blue dot
  settle   weighted vote: blue dot, judge, the two solves, the key file; decides which questions need the judge
  judge    a stronger model solves the disputed questions blind
  explain  explanation, distractors and hint written FOR the settled key (never against it)
  check    a different model reads only the explanation and the hint and says which option they lead to
  finish   enrichment file (icfes-enrichment/2, same shape the app reads) + proposed key file + review list

python -m icfes_polish.keys <round> --golden G.json --crops <icfes_crop dir> --key K.key.json --work <dir> [--deployment D]
All state lives in <work>: requests go to <work>/req-<round>.jsonl, the relay answers are read from <work>/out-<round>*.jsonl.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

from .images import jpeg_b64, remove_blue

LETTERS = "ABCD"
WEIGHTS = {"dot": 2.5, "judge": 2.0, "v1": 1.0, "v2": 1.0, "keyfile": 0.5}
MARGIN = 1.5

FRAME = {
    "Matemáticas": (["Interpretación y representación", "Formulación y ejecución", "Argumentación"],
                    ["Numérico-variacional", "Geométrico-métrico", "Aleatorio"]),
    "Lectura crítica": (["Identificar y entender los contenidos locales que conforman un texto",
                         "Comprender cómo se articulan las partes de un texto para darle un sentido global",
                         "Reflexionar a partir de un texto y evaluar su contenido"],
                        ["Texto literario", "Texto informativo", "Texto filosófico o argumentativo", "Texto discontinuo (tabla, gráfica, imagen)"]),
    "Sociales y ciudadanas": (["Pensamiento social", "Interpretación y análisis de perspectivas", "Pensamiento reflexivo y sistémico"],
                              ["Relaciones con la historia y las culturas", "Relaciones espaciales y ambientales", "Relaciones ético-políticas"]),
    "Ciencias naturales": (["Uso comprensivo del conocimiento científico", "Explicación de fenómenos", "Indagación"],
                           ["Biológico", "Químico", "Físico", "Ciencia, tecnología y sociedad"]),
    "Inglés": (["Comprensión de lectura", "Uso del lenguaje (vocabulario y gramática)", "Interacción comunicativa"],
               ["Avisos y señales", "Léxico", "Conversaciones cotidianas", "Gramática y uso del lenguaje", "Comprensión de lectura"]),
}

SOLVE_SYS = (
    "Eres un experto en las pruebas Saber 11 de Colombia. Resuelve la pregunta tú mismo, con cuidado y paso a paso, usando "
    "solo lo que está en el texto, las tablas y las figuras de la imagen. La imagen es el cuadernillo escaneado; el texto "
    "transcrito puede tener errores de lectura: si no coinciden, manda la imagen. Las letras de las opciones son las del TEXTO "
    "que te doy (pueden estar en otro orden que en la imagen). Responde SOLO JSON: "
    '{"razonamiento": "breve, con los pasos clave", "respuesta": "A|B|C|D|null", "confianza": 0.0-1.0, '
    '"falta_informacion": true|false, "que_falta": ""}. Si una figura necesaria no se ve, falta_informacion=true y respuesta=null.')

JUDGE_SYS = SOLVE_SYS + (" Esta pregunta tiene respuestas en conflicto, así que verifica cada opción una por una antes de decidir "
                         "y revisa los cálculos dos veces.")

EXPLAIN_TAIL = (
    '"afirmacion": "una frase al estilo ICFES (El estudiante ...)", "evidencia": "una frase al estilo ICFES (El estudiante ...)", '
    '"explicacion_es": "2 a 4 frases: por qué la clave es la correcta y la trampa del distractor más atractivo", '
    '"distractores_porque": {"A": "...", "B": "...", "C": "...", "D": "..."} (para la clave escribe solo "Correcta"; para las demás, '
    'una frase con por qué es incorrecta y qué error la hace atractiva), '
    '"pista": "una frase que encamine al estudiante HACIA LA CLAVE sin nombrarla, sin decir su letra y sin copiar su texto; nunca debe '
    'favorecer otra opción", "nivel_desempeno_modelo": 1-4, '
    '"rubrica": {"pasos": n, "abstraccion": n, "carga_texto": n, "conocimiento_previo": n, "distractores": n}, "rubrica_motivo": "una frase", '
    '"respuesta_explicada": "la letra que tu explicación justifica"}. '
    "Califica cada dimensión de 1 a 5 con todo el rango (pasos: 1 lectura directa ... 5 estrategia no evidente; abstraccion: 1 concreto ... "
    "5 formal; carga_texto: 1 corto ... 5 varias fuentes; conocimiento_previo: 1 ninguno ... 5 avanzado; distractores: 1 absurdos ... 5 muy plausibles). "
    "La clave ya fue verificada por varias fuentes. Si aun así estás seguro de que es imposible justificarla, NO escribas la explicación: "
    'responde solo {"objecion": "por qué"}.')

CHECK_SYS = (
    "Revisas material de estudio para una pregunta de opción múltiple del Saber 11. Te doy la pregunta, una EXPLICACIÓN y una PISTA. "
    "No resuelvas la pregunta por tu cuenta: di a qué opción llevan la explicación y la pista tal como están escritas. Responde SOLO JSON: "
    '{"opcion_que_justifica_explicacion": "A|B|C|D|ninguna", "pista_lleva_a": "A|B|C|D|ninguna", "pista_revela_respuesta": true|false, '
    '"contradicciones": "si la explicación o la pista se contradicen entre sí o con la pregunta, cuál; si no, vacío"}. '
    'pista_revela_respuesta es true solo si la pista dice la letra o el texto de una opción.')


# ---------------- question text and images ----------------

def to_text(s: str) -> str:
    """Field markup -> plain text a model reads well: tables as rows, tags dropped, math kept as TeX."""
    s = s or ""
    s = re.sub(r"<table\b.*?</table>", lambda m: "\n" + "\n".join(
        " | ".join(re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S))
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(0), re.S)) + "\n", s, flags=re.S)
    s = re.sub(r"\[\[figura:[^\]]*\]\]", "[figura]", s)
    s = re.sub(r"\[\[hueco:(\d+)(?:\|([^\]]*))?\]\]", lambda m: f"____({m.group(1)}{': ' + m.group(2) if m.group(2) else ''})", s)
    s = re.sub(r"\[\[hueco\]\]", "____", s)
    s = re.sub(r"</p>|<br\s*/?>|</div>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(s)).strip()


def perm_for(n: int) -> list[int]:
    """A fixed reordering of the four options for the second solve, different from the original order."""
    perms = [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]
    return perms[n % 3]


def question_text(q: dict, groups: dict, order: list[int] | None = None) -> tuple[str, list[str]]:
    opts = {o["letter"]: o.get("text_md") or "" for o in q["options"]}
    letters = [l for l in LETTERS if l in opts]
    shown = letters if order is None else [letters[i] for i in order if i < len(letters)]
    t = f"ÁREA: {q.get('section')}\n"
    g = groups.get(q.get("group_id"))
    if g:
        if g.get("directions"):
            t += f"INSTRUCCIÓN DEL GRUPO: {to_text(g['directions'])}\n"
        if g.get("stimulus_md"):
            t += f"INFORMACIÓN DEL GRUPO:\n{to_text(g['stimulus_md'])}\n"
        if g.get("passage_md"):
            t += f"TEXTO DEL GRUPO:\n{to_text(g['passage_md'])}\n"
    if q.get("stimulus_md"):
        t += f"CONTEXTO:\n{to_text(q['stimulus_md'])}\n"
    t += f"PREGUNTA {q['number']}:\n{to_text(q.get('stem_md'))}\nOPCIONES:\n"
    for new, old in zip(LETTERS, shown):
        txt = to_text(opts[old]) or f"(opción solo en imagen: es la que en la imagen lleva la letra {old})"
        t += f"{new}) {txt}\n"
    return t, shown


def images_for(q: dict, bundles: dict, crops: Path) -> list[str]:
    out = []
    for bid in (q.get("group_id"), f"q{q['number']}"):
        b = bundles["bundles"].get(bid) if bid else None
        if b:
            b64, _ = jpeg_b64(remove_blue(Image.open(crops / b["file"])), max_side=1800)
            out.append(b64)
    return out


def chat(sys_msg: str, text: str, imgs: list[str]) -> list[dict]:
    content = [{"type": "text", "text": text}] + [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b, "detail": "high"}} for b in imgs]
    return [{"role": "system", "content": sys_msg}, {"role": "user", "content": content}]


# ---------------- state ----------------

class Ctx:
    def __init__(self, a):
        self.a = a
        self.g = json.load(open(a.golden, encoding="utf-8"))
        self.groups = {x["id"]: x for x in self.g.get("groups", [])}
        self.qs = {q["number"]: q for q in self.g["questions"]}
        self.crops = Path(a.crops) if a.crops else None
        self.bundles = json.load(open(self.crops / "bundles.json", encoding="utf-8")) if self.crops else {"bundles": {}}
        self.keyfile = json.load(open(a.key, encoding="utf-8"))["answers"] if a.key and Path(a.key).exists() else {}
        self.work = Path(a.work)
        self.work.mkdir(parents=True, exist_ok=True)

    def results(self, rnd: str) -> dict[str, dict]:
        out = {}
        for p in sorted(self.work.glob(f"out-{rnd}*.jsonl")):
            for line in open(p, encoding="utf-8"):
                r = json.loads(line)
                out[r["id"]] = r
        return out

    def write(self, rnd: str, reqs: list[dict]) -> None:
        from .format_stage import write_split
        names = write_split(str(self.work / f"req-{rnd}.jsonl"), [json.dumps(r, ensure_ascii=False) for r in reqs])
        print(f"{len(reqs)} requests -> {', '.join(names)}")

    def settled(self) -> dict:
        p = self.work / "settled.json"
        return json.load(open(p, encoding="utf-8")) if p.exists() else {}


def parse(r: dict | None) -> dict:
    if not r or not r.get("content"):
        return {}
    try:
        return json.loads(r["content"])
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", r["content"], re.S)
        try:
            return json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError:
            return {}


def letter(x) -> str | None:
    x = (x or "").strip().upper()[:1] if isinstance(x, str) else None
    return x if x in LETTERS else None


# ---------------- rounds ----------------

def r_solve(c: Ctx) -> int:
    reqs = []
    for n, q in c.qs.items():
        imgs = images_for(q, c.bundles, c.crops)
        has_img_opt = any(not (o.get("text_md") or "").strip() for o in q["options"])
        t1, _ = question_text(q, c.groups)
        reqs.append({"id": f"v1:{n}", "deployment": c.a.deployment, "messages": chat(SOLVE_SYS, t1, imgs),
                     "max_completion_tokens": 12000, "reasoning_effort": c.a.effort, "response_format": {"type": "json_object"}})
        order = None if has_img_opt else perm_for(n)
        t2, shown = question_text(q, c.groups, order)
        sys2 = SOLVE_SYS if order else SOLVE_SYS + " Antes de elegir, descarta explícitamente cada opción incorrecta."
        reqs.append({"id": f"v2:{n}:{''.join(shown)}", "deployment": c.a.deployment, "messages": chat(sys2, t2, imgs),
                     "max_completion_tokens": 12000, "reasoning_effort": c.a.effort, "response_format": {"type": "json_object"}})
    c.write("solve", reqs)
    return 0


def votes_for(c: Ctx, n: int, solve: dict, judge: dict) -> dict:
    q = c.qs[n]
    v = {"dot": letter(q.get("scan_marked_option")), "keyfile": letter(c.keyfile.get(str(n)))}
    a1 = parse(solve.get(f"v1:{n}"))
    v["v1"] = letter(a1.get("respuesta"))
    r2 = next((r for k, r in solve.items() if k.startswith(f"v2:{n}:")), None)
    if r2:
        shown = r2["id"].split(":")[2]
        a2 = parse(r2)
        l2 = letter(a2.get("respuesta"))
        v["v2"] = shown[LETTERS.index(l2)] if l2 and LETTERS.index(l2) < len(shown) else None
    j = parse(judge.get(f"judge:{n}"))
    if j:
        v["judge"] = letter(j.get("respuesta"))
    return v


def decide(v: dict) -> dict:
    score = defaultdict(float)
    for src, w in WEIGHTS.items():
        if v.get(src):
            score[v[src]] += w
    ranked = sorted(score.items(), key=lambda kv: -kv[1])
    if not ranked:
        return {"final": None, "status": "review", "why": "no answer from any source"}
    top, s1 = ranked[0]
    s2 = ranked[1][1] if len(ranked) > 1 else 0.0
    dot = v.get("dot")
    if dot and top != dot:
        return {"final": dot, "status": "review", "why": f"models favour {top} over the blue dot {dot}", "score": dict(score)}
    if s1 - s2 < MARGIN:
        return {"final": top, "status": "review", "why": f"no clear majority ({dict(score)})", "score": dict(score)}
    agree = [s for s in ("v1", "v2", "judge") if v.get(s) == top]
    return {"final": top, "status": "settled", "why": ("blue dot + " if dot == top else "models: ") + ", ".join(agree), "score": dict(score)}


def needs_judge(v: dict) -> bool:
    if not v.get("dot"):
        return True
    return any(v.get(s) and v[s] != v["dot"] for s in ("v1", "v2", "keyfile")) or not (v.get("v1") and v.get("v2"))


def r_settle(c: Ctx) -> int:
    solve, judge = c.results("solve"), c.results("judge")
    out, need = {}, []
    for n in c.qs:
        v = votes_for(c, n, solve, judge)
        d = decide(v)
        if needs_judge(v) and "judge" not in v:
            need.append(n)
            d = {**d, "status": "needs_judge"}
        out[str(n)] = {"votes": v, **d}
    json.dump(out, open(c.work / "settled.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    by = defaultdict(int)
    for x in out.values():
        by[x["status"]] += 1
    print(f"settle: {dict(by)}; judge needed for {need}")
    return 0


def r_judge(c: Ctx) -> int:
    st = c.settled()
    reqs = []
    for n, q in c.qs.items():
        if st.get(str(n), {}).get("status") != "needs_judge":
            continue
        t, _ = question_text(q, c.groups)
        reqs.append({"id": f"judge:{n}", "deployment": c.a.deployment, "messages": chat(JUDGE_SYS, t, images_for(q, c.bundles, c.crops)),
                     "max_completion_tokens": 25000, "reasoning_effort": c.a.effort or "high", "response_format": {"type": "json_object"}})
    c.write("judge", reqs)
    return 0


def explain_sys(area: str) -> str:
    comp, compo = FRAME.get(area, FRAME["Ciencias naturales"])
    return ("Eres un diseñador de ítems ICFES (Saber 11) del área de %s. Con la pregunta y su CLAVE, responde SOLO JSON: "
            '{"competencia": exactamente una de %s, "componente": exactamente una de %s, "tema": "2-4 palabras", "habilidad": "verbo breve", '
            % (area, json.dumps(comp, ensure_ascii=False), json.dumps(compo, ensure_ascii=False))) + EXPLAIN_TAIL


def r_explain(c: Ctx) -> int:
    st = c.settled()
    reqs = []
    for n, q in c.qs.items():
        s = st.get(str(n), {})
        if s.get("status") != "settled":
            continue
        t, _ = question_text(q, c.groups)
        t += f"\nCLAVE: {s['final']}\n"
        reqs.append({"id": f"explain:{n}", "deployment": c.a.deployment, "messages": chat(explain_sys(q.get("section")), t, images_for(q, c.bundles, c.crops)),
                     "max_completion_tokens": 12000, "reasoning_effort": c.a.effort, "response_format": {"type": "json_object"}})
    c.write("explain", reqs)
    return 0


def r_check(c: Ctx) -> int:
    ex = c.results("explain")
    reqs = []
    for n, q in c.qs.items():
        e = parse(ex.get(f"explain:{n}"))
        if not e or "objecion" in e:
            continue
        t, _ = question_text(q, c.groups)
        t += f"\nEXPLICACIÓN: {e.get('explicacion_es', '')}\nPISTA: {e.get('pista', '')}\n"
        req = {"id": f"check:{n}", "deployment": c.a.deployment, "messages": chat(CHECK_SYS, t, images_for(q, c.bundles, c.crops)[-1:]),
               "max_completion_tokens": 4000, "response_format": {"type": "json_object"}}
        if c.a.effort:
            req["reasoning_effort"] = c.a.effort
        reqs.append(req)
    c.write("check", reqs)
    return 0


W = {"pasos": .30, "abstraccion": .20, "carga_texto": .15, "conocimiento_previo": .15, "distractores": .20}


def r_finish(c: Ctx) -> int:
    st, ex, ck, solve = c.settled(), c.results("explain"), c.results("check"), c.results("solve")
    usd = sum(r.get("usd", 0) for rnd in ("solve", "judge", "explain", "check") for r in c.results(rnd).values())
    out = {"format": "icfes-enrichment/2", "exam": c.g["exam"]["title"] if isinstance(c.g.get("exam"), dict) else c.g.get("exam"),
           "estimated": True, "spend_usd": round(usd, 4), "questions": {},
           "note": ("Keys settled by vote (blue dot 2.5, judge 2, two blind solves 1 each, key file 0.5); explanation and hint are written for "
                    "the settled key and shown only when an independent check reads them as leading to that key. Keys stay preliminary. "
                    "difficulty is an ESTIMATE (rubric quintile within the area of this exam).")}
    review, keys = [], {}
    for n, q in c.qs.items():
        s = st.get(str(n), {})
        keys[str(n)] = s.get("final")
        a1 = parse(solve.get(f"v1:{n}"))
        rec = {"number": n, "section": q.get("section"), "key": s.get("final"), "scan_dot": q.get("scan_marked_option"),
               "settle": {k: s.get(k) for k in ("status", "why", "votes", "score")},
               "blind": {"pasos": a1.get("razonamiento"), "respuesta": a1.get("respuesta"), "confianza": a1.get("confianza"),
                         "falta_informacion": a1.get("falta_informacion"), "que_falta": a1.get("que_falta")}}
        e = parse(ex.get(f"explain:{n}"))
        k = parse(ck.get(f"check:{n}"))
        ok, why = False, None
        if s.get("status") != "settled":
            why = "key not settled"
        elif not e:
            why = "no explanation"
        elif "objecion" in e:
            why = "explainer objected: " + str(e["objecion"])[:300]
        elif letter(e.get("respuesta_explicada")) != s["final"]:
            why = f"explanation argues for {e.get('respuesta_explicada')}"
        elif not k:
            why = "not checked"
        elif letter(k.get("opcion_que_justifica_explicacion")) != s["final"]:
            why = f"checker reads the explanation as {k.get('opcion_que_justifica_explicacion')}"
        elif letter(k.get("pista_lleva_a")) not in (None, s["final"]):
            why = f"checker reads the hint as leading to {k.get('pista_lleva_a')}"
        elif k.get("pista_revela_respuesta") is True:
            why = "hint gives the answer away"
        else:
            ok = True
        if ok:
            e = {kk: vv for kk, vv in e.items() if kk != "respuesta_explicada"}
            e["clave_coherente"] = True
            e["nota_clave"] = ""
            rec["enrich"] = e
            rec["key_check"] = "agree"
        else:
            rec["enrich"] = {kk: e.get(kk) for kk in ("competencia", "componente", "tema", "habilidad", "rubrica", "nivel_desempeno_modelo") if e and e.get(kk)}
            rec["enrich"]["clave_coherente"] = False
            rec["hidden_reason"] = why
            rec["key_check"] = "DISAGREE" if s.get("status") == "review" else "hidden"
            review.append({"number": n, "reason": why, "settle": s.get("why"), "votes": s.get("votes")})
        rec["check"] = k
        out["questions"][str(n)] = rec
    # relative difficulty within each area, as in the earlier enrichment
    by = defaultdict(list)
    for n, r in out["questions"].items():
        ru = (r.get("enrich") or {}).get("rubrica")
        try:
            raw = sum(W[x] * float(ru[x]) for x in W)
        except (TypeError, KeyError, ValueError):
            continue
        if r["blind"].get("respuesta") not in (None, "null", r["key"]) and not r["blind"].get("falta_informacion"):
            raw += 0.5
        r["enrich"]["dificultad_bruta"] = round(min(raw, 5.0), 2)
        by[r["section"]].append((r["enrich"]["dificultad_bruta"], n))
    for sec, L in by.items():
        L.sort()
        for i, (_, n) in enumerate(L):
            ee = out["questions"][n]["enrich"]
            ee["dificultad"] = min(5, 1 + (5 * i) // len(L))
            ee["nivel_desempeno"] = min(4, 1 + (4 * i) // len(L))
    json.dump(out, open(c.work / "enrichment.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"format": "icfes-key/1", "exam": out["exam"], "answers": keys, "note": "preliminary; see settle in enrichment.json"},
              open(c.work / "key.proposed.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(review, open(c.work / "review.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    shown = sum(1 for r in out["questions"].values() if r["key_check"] == "agree")
    print(f"finish: {shown}/{len(c.qs)} with explanation+hint shown, review list {len(review)}, spend ${usd:.3f}")
    return 0


ROUNDS = {"solve": r_solve, "settle": r_settle, "judge": r_judge, "explain": r_explain, "check": r_check, "finish": r_finish}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("round", choices=ROUNDS)
    ap.add_argument("--golden", required=True)
    ap.add_argument("--crops")
    ap.add_argument("--key")
    ap.add_argument("--work", required=True)
    ap.add_argument("--deployment", default="solve")
    ap.add_argument("--effort", default="medium")
    a = ap.parse_args(argv)
    return ROUNDS[a.round](Ctx(a))


if __name__ == "__main__":
    sys.exit(main())
