import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog, Select } from "../../components/Controls.jsx";
import QuestionView from "../../components/QuestionView.jsx";
import RichText from "../../components/RichText.jsx";
import { DIFFICULTY_LABEL } from "../../lib/bank.js";
import { answerKeyFrom, detectQuestions, openSource } from "../../lib/builder/pdfSource.js";
import { cleanText, parseQuestionText, splitOptions } from "../../lib/builder/richSource.js";
import { forgetDoc, recentDocs, rememberDoc, saveSession, clearSession, touchDoc } from "../../lib/builder/docStore.js";
import { draftToRow, emptyDraft, rowToQuestion, shrinkImage, TEACHER_AREAS, validateDraft } from "../../lib/teacherExam.js";
import CropDialog from "./CropDialog.jsx";
import FormulaDialog from "./FormulaDialog.jsx";
import { placeFigure, placeFormula, RichCtx, RichField, Toolbar, useRichFields } from "./RichField.jsx";
import SourcePane from "./SourcePane.jsx";
import "./builder.css";
import { Dialog, FileButton, Segmented } from "./ui.jsx";

const LETTERS = ["A", "B", "C", "D"];
const uid = () => Math.random().toString(36).slice(2, 10);
const newFigId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const withUid = (d) => ({ ...d, uid: d.uid ?? uid() });

// The full-screen question builder: the teacher's PDF on the left, the question form in the middle and the
// student's view on the right, like the admin editor. Several questions are worked on at once (the strip at the
// top); questions that share a text form a group.
export default function Workspace({ api, profile, guard, initial, startAt = 0, onClose, saver = null }) {
  const [drafts, setDrafts] = useState(() => (initial.length ? initial : [emptyDraft()]).map(withUid));
  const [cur, setCur] = useState(Math.min(startAt, Math.max(0, initial.length - 1)));
  const [doc, setDoc] = useState(null);
  const [docEntry, setDocEntry] = useState(null);
  const [page, setPage] = useState(1);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [formula, setFormula] = useState(null);
  const [crop, setCrop] = useState(null);
  const [pending, setPending] = useState(null);
  const [problems, setProblems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [detected, setDetected] = useState(null);
  const [tab, setTab] = useState(initial.length ? "form" : "pdf");
  const [showKey, setShowKey] = useState(false);
  const anySaved = useRef(false);

  const d = drafts[cur] ?? drafts[0];
  const notify = useCallback((text, bad = false) => setToast({ text, bad, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { recentDocs(profile.id).then((r) => setRecent(r ?? [])); }, [profile.id]);

  // Unsaved work is kept in this browser, so a closed tab does not lose it.
  useEffect(() => {
    const t = setTimeout(() => {
      const open = drafts.filter((x) => x.dirty);
      if (open.length) saveSession(profile.id, { drafts: open, docId: docEntry?.id ?? null });
      else clearSession(profile.id);
    }, 700);
    return () => clearTimeout(t);
  }, [drafts, docEntry, profile.id]);

  const update = (fn) => setDrafts((ds) => ds.map((x, i) => (i === cur ? { ...fn(x), dirty: true } : x)));
  const set = (field) => (v) => update((x) => ({ ...x, [field]: v }));
  // The shared text and its figures change in every question of the group.
  const setGroup = (patch) => setDrafts((ds) => ds.map((x, i) => (x.groupId && x.groupId === d.groupId ? { ...x, ...(typeof patch === "function" ? patch(x) : patch), dirty: true } : i === cur ? x : x)));
  const setOption = (i, v) => update((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? v : o)) }));
  const setOptionImage = (i, url) => update((x) => ({ ...x, optionImages: LETTERS.map((l, j) => (j === i ? url : x.optionImages?.[j] ?? null)) }));

  const figs = useMemo(() => Object.fromEntries([...(d.figures ?? []), ...(d.groupFigures ?? [])].map((f) => [f.id, f.url])), [d.figures, d.groupFigures]);
  const openFormula = useCallback((fieldApi, chip, chem = false) => setFormula({ api: fieldApi, chip, chem, tex: chip?.dataset.tex ?? "" }), []);
  const rich = useRichFields({ figs, onFormula: openFormula });

  // ---- the document --------------------------------------------------------------------------------------
  const openFiles = async (files) => {
    setBusy("Abriendo el documento…");
    try {
      const next = await openSource(files);
      doc?.close();
      setDoc(next);
      setPage(1);
      setTab("pdf");
      const id = await rememberDoc(profile.id, files, next.name);
      setDocEntry({ id, name: next.name, files });
      setRecent((await recentDocs(profile.id)) ?? []);
    } catch (e) {
      notify(e.message?.startsWith("Elige") ? e.message : "No se pudo abrir ese archivo. ¿Es un PDF o una foto?", true);
    } finally {
      setBusy("");
    }
  };
  const openRecent = async (r) => { await touchDoc(r); openFiles(r.files); };
  const forget = async (r) => { await forgetDoc(r.id); setRecent((await recentDocs(profile.id)) ?? []); };

  const targets = [
    { id: "fig", label: "Figura de la pregunta" },
    ...(d.groupId ? [{ id: "group", label: "Texto compartido" }] : []),
    ...LETTERS.map((l) => ({ id: `opt-${l}`, label: `Opción ${l}` })),
  ];
  const targetLabel = (id) => targets.find((t) => t.id === id)?.label ?? id;
  const askCrop = (id) => {
    if (!doc) { notify("Primero abre tu PDF o tus fotos a la izquierda."); setTab("pdf"); return; }
    setPending({ id, label: targetLabel(id) });
    setTab("pdf");
  };

  const onImage = (target, canvas, source) => setCrop({ target, canvas, source });
  const useImage = (url) => {
    const { target, source } = crop;
    setCrop(null);
    setPending(null);
    if (target === "fig") update((x) => ({ ...x, figures: [...(x.figures ?? []), { id: newFigId(), url }], source: x.source ?? source }));
    else if (target === "group") { const f = { id: newFigId(), url }; setGroup((x) => ({ groupFigures: [...(x.groupFigures ?? []), f] })); }
    else if (target.startsWith("opt-")) setOptionImage(LETTERS.indexOf(target.slice(4)), url);
    notify(target === "fig" ? "Figura agregada. Aparece arriba del enunciado; con «Poner en el texto» la ubicas donde quieras." : `Imagen puesta en ${targetLabel(target)}.`);
    setTab("form");
  };

  const onText = (kind, raw, source) => {
    if (kind === "copy") { navigator.clipboard?.writeText(cleanText(raw)); notify("Texto copiado."); return; }
    if (kind === "field") {
      const target = rich.ctx.active.current;
      if (!target) { notify("Haz clic primero en el campo donde va el texto."); return; }
      target.insertSource(cleanText(raw));
      update((x) => ({ ...x, source: x.source ?? source }));
      notify(`Texto puesto en ${target.name}. Revísalo con la página.`);
      return;
    }
    if (kind === "options") {
      const opts = splitOptions(cleanText(raw));
      if (!opts) { notify("No encontré opciones A., B., C., D. en el recuadro.", true); return; }
      update((x) => ({ ...x, options: LETTERS.map((l, i) => opts[l] ?? x.options[i]) }));
      notify("Opciones repartidas en A–D.");
      return;
    }
    const q = parseQuestionText(raw);
    update((x) => ({ ...x, stimulus: q.stimulus || x.stimulus, stem: q.stem, options: q.options ?? x.options, source }));
    notify(q.options ? "Pregunta leída: revisa el texto y marca la respuesta correcta." : "Leí el texto pero no encontré opciones A–D; agrégalas a mano.");
    setTab("form");
  };

  const detect = async (useOcr = false) => {
    setBusy(useOcr ? "Leyendo cada página con OCR… puede tardar un minuto" : "Buscando preguntas numeradas…");
    try {
      const found = await detectQuestions(doc, { useOcr, onProgress: (n, total) => setBusy(`${useOcr ? "OCR" : "Buscando"}: página ${n} de ${total}…`) });
      if (!found.length) {
        const scanned = !useOcr && (await doc.page(1).textLines()).length < 3;
        setDetected({ found: [], scanned });
        return;
      }
      const all = found.map((q) => q.text).join("\n");
      const key = answerKeyFrom(all, found.map((q) => q.number));
      const last = found[found.length - 1];
      const cut = last.text.search(/\n\s*(clave|respuestas|hoja de respuestas|solucionario)\b/i);
      if (cut > 0) last.text = last.text.slice(0, cut);
      setDetected({ found, key });
    } catch {
      notify("No pude leer el documento para buscar preguntas.", true);
    } finally {
      setBusy("");
    }
  };
  const addDetected = () => {
    const { found, key } = detected;
    const meta = { area: d.area, visibility: d.visibility, competencia: "", tema: "" };
    const made = found.map((q) => {
      const p = parseQuestionText(q.text);
      return withUid({ ...emptyDraft(meta), stimulus: p.stimulus, stem: p.stem, options: p.options ?? ["", "", "", ""], answer: key[q.number] ?? "", source: { page: q.page, box: q.box, number: q.number }, dirty: true });
    });
    const blank = (x) => !x.id && !x.stem.trim() && !x.stimulus.trim() && x.options.every((o) => !o.trim());
    setDrafts((ds) => [...ds.filter((x) => !blank(x)), ...made]);
    setCur(drafts.filter((x) => !blank(x)).length);
    setDetected(null);
    setTab("form");
    notify(`Agregué ${made.length} preguntas${Object.keys(key).length ? " con la respuesta de la clave del documento" : ""}. Revisa cada una, recorta sus gráficas y guarda.`);
  };

  // ---- questions and groups --------------------------------------------------------------------------------
  const add = (share = false) => {
    const base = emptyDraft({ area: d.area, visibility: d.visibility, competencia: d.competencia, tema: d.tema });
    let next = withUid({ ...base, dirty: true });
    if (share) {
      const gid = d.groupId ?? `g${uid()}`;
      if (!d.groupId) update((x) => ({ ...x, groupId: gid, groupText: x.stimulus, groupFigures: [], stimulus: "" }));
      next = { ...next, groupId: gid, groupText: d.groupId ? d.groupText : d.stimulus, groupFigures: d.groupFigures ?? [] };
    }
    setDrafts((ds) => [...ds.slice(0, cur + 1), next, ...ds.slice(cur + 1)]);
    setCur(cur + 1);
    setProblems([]);
  };
  const shareWithPrevious = () => {
    const prev = drafts[cur - 1];
    if (!prev) return;
    const gid = prev.groupId ?? `g${uid()}`;
    setDrafts((ds) => ds.map((x, i) => {
      if (i === cur - 1 && !prev.groupId) return { ...x, groupId: gid, groupText: x.stimulus, groupFigures: [], stimulus: "", dirty: true };
      if (i === cur) return { ...x, groupId: gid, groupText: prev.groupId ? prev.groupText : prev.stimulus, groupFigures: prev.groupFigures ?? [], dirty: true };
      return x;
    }));
  };
  const leaveGroup = () => update((x) => ({ ...x, groupId: null, stimulus: [x.groupText, x.stimulus].filter((t) => t.trim()).join("\n\n"), figures: [...(x.figures ?? []), ...(x.groupFigures ?? [])], groupText: "", groupFigures: [] }));
  const removeDraft = async () => {
    if (d.id && !(await confirmDialog("Esta pregunta ya está guardada. ¿Quitarla solo de esta lista? Sigue guardada en Mis preguntas.", { confirmLabel: "Quitar de la lista" }))) return;
    setDrafts((ds) => (ds.length === 1 ? [withUid(emptyDraft())] : ds.filter((_, i) => i !== cur)));
    setCur(Math.max(0, cur - 1));
  };
  const applyToAll = () => {
    setDrafts((ds) => ds.map((x) => ({ ...x, area: d.area, visibility: d.visibility, dificultad: x.dificultad || d.dificultad, competencia: x.competencia || d.competencia, tema: x.tema || d.tema, dirty: true })));
    notify("Área, visibilidad y datos aplicados a todas las preguntas de la lista.");
  };
  const removeFigure = (id, group) => {
    const drop = (t) => t.replace(new RegExp(`\\n*\\[\\[figura:${id}\\]\\]\\n*`, "g"), "\n\n").trim();
    if (group) setGroup((x) => ({ groupFigures: x.groupFigures.filter((f) => f.id !== id), groupText: drop(x.groupText) }));
    else update((x) => ({ ...x, figures: x.figures.filter((f) => f.id !== id), stem: drop(x.stem), stimulus: drop(x.stimulus) }));
  };
  const putFigure = (id) => {
    if (!placeFigure(rich.ctx.active.current, id, figs)) notify("Haz clic en el texto donde va la figura y vuelve a tocar «Poner en el texto».");
  };
  const uploadTo = async (files, target) => {
    try {
      const url = await shrinkImage(files[0], 1400, 0.86);
      if (target === "fig") update((x) => ({ ...x, figures: [...(x.figures ?? []), { id: newFigId(), url }] }));
      else if (target === "group") { const f = { id: newFigId(), url }; setGroup((x) => ({ groupFigures: [...(x.groupFigures ?? []), f] })); }
      else setOptionImage(LETTERS.indexOf(target.slice(4)), url);
    } catch {
      notify("No se pudo leer esa imagen.", true);
    }
  };

  // ---- saving ----------------------------------------------------------------------------------------------
  const saveOne = async (x) => {
    // `saver` stores the draft somewhere else (a school's version of a bank question) and returns { id }.
    const saved = saver ? await saver(x) : await api.saveTeacherQuestion(draftToRow(x, { schoolId: profile.school_id, ownerId: profile.id }), x.id ?? null);
    anySaved.current = true;
    return { ...x, id: saved?.id ?? x.id, dirty: false };
  };
  const save = async (all) => {
    const list = all ? drafts.map((x, i) => [x, i]).filter(([x]) => x.dirty) : [[d, cur]];
    const bad = list.map(([x, i]) => [i, validateDraft(x)]).filter(([, p]) => p.length);
    if (!all && bad.length) { setProblems(bad[0][1]); return; }
    setProblems([]);
    setSaving(true);
    let done = 0;
    await guard(async () => {
      for (const [x, i] of list) {
        if (validateDraft(x).length) continue;
        const savedX = await saveOne(x);
        setDrafts((ds) => ds.map((y) => (y.uid === x.uid ? { ...savedX, uid: y.uid } : y)));
        done += 1;
        if (!all) i === cur && notify("Pregunta guardada.");
      }
    });
    setSaving(false);
    if (all) {
      if (bad.length) notify(`Guardé ${done}. Faltan datos en ${bad.length}: ${bad.map(([i]) => i + 1).join(", ")} (marcadas en rojo arriba).`, true);
      else notify(done ? `Guardé ${done} pregunta${done === 1 ? "" : "s"}.` : "No hay cambios por guardar.");
    }
  };
  const dirtyCount = drafts.filter((x) => x.dirty).length;
  const close = (force = false) => {
    if (!force && dirtyCount) { setLeaving(true); return; }
    doc?.close();
    if (force) clearSession(profile.id);
    onClose(anySaved.current);
  };

  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(e.shiftKey); }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); setCur((c) => Math.min(drafts.length - 1, c + 1)); }
      if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  useEffect(() => {
    const warn = (e) => { if (dirtyCount) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyCount]);

  // ---- student view ---------------------------------------------------------------------------------------
  const previewQ = useMemo(() => {
    const q = rowToQuestion({ ...draftToRow(d, { schoolId: profile.school_id, ownerId: profile.id }), id: `preview-${d.uid}` }, cur + 1);
    if (q.group) {
      const same = drafts.map((x, i) => (x.groupId === d.groupId ? i + 1 : null)).filter(Boolean);
      q.group = { ...q.group, from: Math.min(...same), to: Math.max(...same) };
    }
    return q;
  }, [d, drafts, cur, profile]);

  const groupRange = d.groupId ? drafts.map((x, i) => (x.groupId === d.groupId ? i + 1 : null)).filter(Boolean) : [];
  const stateOf = (x) => (x.dirty ? (validateDraft(x).length ? "todo" : "dirty") : "saved");
  const field = (name) => ({ name: `${d.uid}-${name}` });

  const figureList = (list, group) => (list ?? []).length > 0 && (
    <div className="qb-figs">
      {list.map((f) => (
        <div className="qb-fig" key={f.id}>
          <img src={f.url} alt="Figura" />
          <div className="qb-figbtns">
            <button type="button" className="qb-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => putFigure(f.id)}>⤵ Poner en el texto</button>
            <button type="button" className="qb-tool danger" onClick={() => removeFigure(f.id, group)}>Quitar</button>
          </div>
        </div>
      ))}
    </div>
  );
  const allFigs = [...(d.figures ?? []), ...(d.groupFigures ?? [])];
  const figureMenu = allFigs.length > 0 && (
    <FigureMenu figs={allFigs} onPick={putFigure} />
  );

  return (
    <div className="qb-work" data-tab={tab}>
      <header className="qb-top">
        <button type="button" className="secondary" onClick={() => close()}>← Mis preguntas</button>
        <nav className="qb-strip" aria-label="Preguntas de esta sesión">
          {drafts.map((x, i) => {
            const prevSame = i > 0 && x.groupId && drafts[i - 1].groupId === x.groupId;
            const nextSame = i < drafts.length - 1 && x.groupId && drafts[i + 1].groupId === x.groupId;
            return (
              <button key={x.uid} type="button" aria-current={i === cur} title={x.groupId ? "Comparte texto" : undefined}
                className={`qb-chip ${stateOf(x)}${i === cur ? " now" : ""}${x.groupId ? " grp" : ""}${prevSame ? " join-l" : ""}${nextSame ? " join-r" : ""}`}
                onClick={() => { setCur(i); setProblems([]); }}>{i + 1}</button>
            );
          })}
          <button type="button" className="qb-chip add" onClick={() => add(false)} title="Nueva pregunta">+ Pregunta</button>
        </nav>
        <span className="qb-grow" />
        <span className="caption qb-savestate">{saving ? "Guardando…" : dirtyCount ? `${dirtyCount} sin guardar` : "Todo guardado"}</span>
        <button type="button" className="secondary" disabled={saving} onClick={() => save(false)} title="Ctrl+S">Guardar</button>
        <button type="button" className="primary" disabled={saving || !dirtyCount} onClick={() => save(true)} title="Ctrl+Shift+S">Guardar todo</button>
      </header>
      <div className="qb-tabs" role="tablist" aria-label="Paneles">
        {[["pdf", "Documento"], ["form", "Pregunta"], ["preview", "Vista del estudiante"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="qb-panes">
        <section className="qb-pane pdf" aria-label="Documento">
          <SourcePane doc={doc} page={page} setPage={setPage} anchor={d.source} recent={recent} onOpenFiles={openFiles} onOpenRecent={openRecent} onForget={forget}
            onDetect={() => detect(false)} targets={targets} activeName={rich.activeName} onImage={onImage} onText={onText} busy={busy} setBusy={setBusy} notify={notify} pendingTarget={pending} />
        </section>

        <section className="qb-pane form" aria-label="Pregunta">
          <RichCtx.Provider value={rich.ctx}>
            <Toolbar ctx={rich.ctx} code={rich.code} setCode={rich.setCode} inTable={rich.inTable} activeName={rich.activeName}
              onFormula={() => openFormula(rich.ctx.active.current, null)} onChem={() => openFormula(rich.ctx.active.current, null, true)} figureMenu={figureMenu} />
            <div className="qb-formscroll">
              <div className="qb-qhead">
                <h2>Pregunta {cur + 1}{d.id ? "" : " · nueva"}</h2>
                <span className="qb-grow" />
                {cur > 0 && !d.groupId && <button type="button" className="qb-tool" onClick={shareWithPrevious} title="Para varias preguntas sobre la misma lectura, tabla o gráfica">⛓ Mismo texto que la {cur}</button>}
                <button type="button" className="qb-tool" onClick={() => add(true)} title="Otra pregunta con este mismo texto">+ Otra con este texto</button>
                <button type="button" className="qb-tool danger" onClick={removeDraft}>Quitar de la lista</button>
              </div>

              <div className="qb-meta">
                <label className="qb-field inline"><span className="label">Área</span>
                  <Select aria-label="Área" value={d.area} onChange={set("area")}>{TEACHER_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}</Select></label>
                <label className="qb-field inline"><span className="label">Dificultad</span>
                  <Select aria-label="Dificultad" value={d.dificultad} onChange={set("dificultad")}>
                    <option value="">Sin indicar</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{n} · {DIFFICULTY_LABEL[n]}</option>)}
                  </Select></label>
                <label className="qb-field inline"><span className="label">Competencia</span>
                  <input className="qb-input" value={d.competencia} onChange={(e) => set("competencia")(e.target.value)} placeholder="Opcional" /></label>
                <label className="qb-field inline"><span className="label">Tema</span>
                  <input className="qb-input" value={d.tema} onChange={(e) => set("tema")(e.target.value)} placeholder="Opcional" /></label>
                <div className="qb-field inline"><span className="label">Quién la usa</span>
                  <Segmented label="Quién puede usarla" value={d.visibility} onChange={set("visibility")} options={[{ value: "private", label: "Solo yo" }, { value: "school", label: "Mi colegio" }]} /></div>
                {drafts.length > 1 && <button type="button" className="link" onClick={applyToAll}>Aplicar a todas</button>}
              </div>

              {d.groupId && (
                <div className="qb-group">
                  <div className="qb-row">
                    <span className="label">Texto compartido · preguntas {groupRange[0]}–{groupRange[groupRange.length - 1]}</span>
                    <span className="qb-grow" />
                    <button type="button" className="qb-tool" onClick={() => askCrop("group")}>✂ Imagen del PDF</button>
                    <FileButton className="qb-tool" accept="image/*" onFiles={(f) => uploadTo(f, "group")} label="Subir imagen del texto compartido">Subir imagen</FileButton>
                    <button type="button" className="qb-tool" onClick={leaveGroup}>Separar esta pregunta</button>
                  </div>
                  <RichField {...field("group")} key={`${d.groupId}-g`} label="Texto compartido" value={d.groupText} onChange={(v) => setGroup({ groupText: v })} placeholder="La lectura, tabla o situación que comparten estas preguntas" />
                  {figureList(d.groupFigures, true)}
                </div>
              )}

              <RichField {...field("stimulus")} key={`${d.uid}-s`} label={d.groupId ? "Texto propio de esta pregunta (opcional)" : "Texto de apoyo (opcional: lectura, situación, datos)"} value={d.stimulus} onChange={set("stimulus")} />

              <div className="qb-row">
                <span className="label">Figuras</span>
                <span className="qb-grow" />
                <button type="button" className="qb-tool" onClick={() => askCrop("fig")}>✂ Recortar del PDF</button>
                <FileButton className="qb-tool" accept="image/*" onFiles={(f) => uploadTo(f, "fig")} label="Subir imagen">Subir imagen</FileButton>
              </div>
              {figureList(d.figures, false) || <p className="caption qb-empty">Sin figuras. Recorta una gráfica, tabla escaneada o dibujo del documento, o sube una imagen.</p>}

              <RichField {...field("stem")} key={`${d.uid}-q`} label="Enunciado" value={d.stem} onChange={set("stem")} placeholder="La pregunta. Ctrl+M escribe una fórmula." />

              <div className="qb-field">
                <span className="label">Opciones · toca la letra de la correcta</span>
                {LETTERS.map((l, i) => (
                  <div key={l} className={d.answer === l ? "qb-opt right" : "qb-opt"}>
                    <button type="button" className="qb-letter" aria-pressed={d.answer === l} aria-label={`Opción ${l} es la correcta`} onClick={() => set("answer")(l)}>{l}</button>
                    {d.optionImages?.[i] ? (
                      <div className="qb-optimg"><img src={d.optionImages[i]} alt={`Opción ${l}`} /><button type="button" className="qb-tool danger" onClick={() => setOptionImage(i, null)}>Quitar imagen</button></div>
                    ) : (
                      <RichField {...field(`opt${l}`)} key={`${d.uid}-${l}`} label={`Opción ${l}`} small value={d.options[i]} onChange={(v) => setOption(i, v)} />
                    )}
                    <div className="qb-optbtns">
                      <button type="button" className="qb-tool" title={`Recortar la opción ${l} del PDF`} onClick={() => askCrop(`opt-${l}`)}>✂</button>
                      <FileButton className="qb-tool" accept="image/*" onFiles={(f) => uploadTo(f, `opt-${l}`)} label={`Imagen para la opción ${l}`}>🖼</FileButton>
                    </div>
                  </div>
                ))}
              </div>

              <RichField {...field("expl")} key={`${d.uid}-e`} label="Explicación (opcional: la ven los estudiantes al revisar)" value={d.explanation} onChange={set("explanation")} />
              <p className="caption">Usa solo material propio o que tengas derecho a usar, sin datos de estudiantes. El documento se queda en este computador; solo se guardan la pregunta y sus recortes.</p>
              {problems.length > 0 && <div role="alert" className="notice error">{problems.map((m) => <div key={m}>{m}</div>)}</div>}
              <div className="report-actions">
                {cur < drafts.length - 1 && <button type="button" className="secondary" onClick={() => setCur(cur + 1)}>Siguiente ›</button>}
                <button type="button" className="primary" disabled={saving} onClick={async () => { await save(false); }}>{saving ? "Guardando…" : "Guardar"}</button>
              </div>
            </div>
          </RichCtx.Provider>
        </section>

        <section className="qb-pane preview" aria-label="Vista del estudiante">
          <div className="qb-row">
            <span className="label">Así la verán los estudiantes</span>
            <span className="qb-grow" />
            <Segmented label="Mostrar" value={showKey ? "key" : "plain"} onChange={(v) => setShowKey(v === "key")} options={[{ value: "plain", label: "Sin respuesta" }, { value: "key", label: "Con respuesta" }]} />
          </div>
          <QuestionView question={previewQ} answer={null} figures={null} report={false} examLabel="" graded={showKey} review={showKey && d.answer ? { correctLetter: d.answer } : undefined} />
          {showKey && d.explanation.trim() && <div className="card qb-explain"><span className="label">Explicación</span><RichText html={d.explanation} className="stimulus" /></div>}
        </section>
      </div>

      {toast && <div className={toast.bad ? "qb-toast bad" : "qb-toast"} role="status">{toast.text}</div>}
      {formula && (
        <FormulaDialog initial={formula.tex} chem={formula.chem}
          onClose={() => setFormula(null)}
          onRemove={formula.chip ? () => { placeFormula(formula.api, formula.chip, ""); setFormula(null); } : null}
          onDone={(tex) => {
            if (!formula.api) notify("Haz clic primero en el campo donde va la fórmula.");
            else placeFormula(formula.api, formula.chip, tex);
            setFormula(null);
          }} />
      )}
      {crop && <CropDialog source={crop.canvas} target={targetLabel(crop.target)} onClose={() => setCrop(null)} onDone={useImage} />}
      {detected && (
        <Dialog title="Detectar preguntas" onClose={() => setDetected(null)}>
          {detected.found.length ? (
            <>
              <p>Encontré <b>{detected.found.length}</b> preguntas numeradas ({detected.found[0].number} a {detected.found[detected.found.length - 1].number}){Object.keys(detected.key).length ? <>, y la clave de respuestas de <b>{Object.keys(detected.key).length}</b>.</> : "."}</p>
              <p className="caption">Las agrego a la lista con su enunciado y opciones. Después revisa cada una con la página al lado, recorta sus gráficas y marca la respuesta si falta.</p>
              <div className="report-actions">
                <button type="button" className="secondary" onClick={() => setDetected(null)}>Cancelar</button>
                <button type="button" className="primary" onClick={addDetected}>Agregar {detected.found.length} preguntas</button>
              </div>
            </>
          ) : (
            <>
              <p>{detected.scanned ? "Este documento es escaneado (sus páginas son imágenes). Puedo leerlo con OCR, que tarda más y se equivoca más que un PDF con texto." : "No encontré preguntas numeradas (1., 2., 3. …) en el documento."}</p>
              <div className="report-actions">
                <button type="button" className="secondary" onClick={() => setDetected(null)}>Cerrar</button>
                {detected.scanned && <button type="button" className="primary" onClick={() => { setDetected(null); detect(true); }}>Leer con OCR</button>}
              </div>
            </>
          )}
        </Dialog>
      )}
      {leaving && (
        <Dialog title="Hay preguntas sin guardar" onClose={() => setLeaving(false)}>
          <p>{dirtyCount === 1 ? "Una pregunta tiene" : `${dirtyCount} preguntas tienen`} cambios sin guardar. Quedan guardados en este navegador por si vuelves.</p>
          <div className="report-actions">
            <button type="button" className="secondary" onClick={() => setLeaving(false)}>Seguir editando</button>
            <button type="button" className="secondary" onClick={() => { setLeaving(false); doc?.close(); onClose(anySaved.current); }}>Salir</button>
            <button type="button" className="primary" onClick={async () => { setLeaving(false); await save(true); }}>Guardar todo</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}


function FigureMenu({ figs, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="qb-symwrap">
      <button type="button" className="qb-tool" aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>⤵ Figura ▾</button>
      {open && (
        <span className="qb-syms figs" role="menu">
          {figs.map((f) => (
            <button key={f.id} type="button" role="menuitem" title="Poner aquí" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(f.id); setOpen(false); }}><img src={f.url} alt="Figura" /></button>
          ))}
        </span>
      )}
    </span>
  );
}
