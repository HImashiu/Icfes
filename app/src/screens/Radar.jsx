import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "../lib/data.js";
import { bluesky, mastodon, merge, reddit } from "../../radar/index.js";

// #admin/posts: new public posts about the ICFES / Saber 11 from any account, newest first, with link and thumbnail,
// so the founder can open each one and comment by hand. The radar worker (radar/index.js) collects them every 30
// minutes; the site's worker serves them to admins only (/app/api/radar). Nothing here posts or comments anywhere.
// What the founder marks («Ya comenté», «Ocultar») stays in this browser (localStorage).

export const NETS = {
  reddit: { label: "Reddit", color: "#ff4500" },
  bluesky: { label: "Bluesky", color: "#1185fe" },
  mastodon: { label: "Mastodon", color: "#6364ff" },
  youtube: { label: "YouTube", color: "#ff0033" },
  news: { label: "Noticias", color: "#5f6b7a" },
};
// Networks without a free public search API: only a link to their own search, opened in the founder's browser.
export const NO_API = [
  ["TikTok", "https://www.tiktok.com/search/video?q=icfes", "Su API de investigación es solo para universidades aprobadas; no hay búsqueda pública para apps."],
  ["Instagram", "https://www.instagram.com/explore/search/keyword/?q=icfes", "La búsqueda por hashtag exige una cuenta de empresa, una app de Meta revisada y da máximo 30 hashtags por semana."],
  ["Facebook", "https://www.facebook.com/search/posts?q=icfes", "Meta cerró la búsqueda de publicaciones y grupos a las apps desde 2018."],
  ["X (Twitter)", "https://x.com/search?q=icfes&f=live", "Su API de búsqueda es de pago (desde unos 200 USD al mes)."],
  ["Threads", "https://www.threads.com/search?q=icfes&serp_type=recent", "La búsqueda por palabra existe, pero pide una app de Meta revisada por ellos."],
  ["WhatsApp", null, "Los grupos y estados son privados: no se pueden rastrear."],
];
const MARKS_KEY = "condor:radar-marks";
const SEEN_KEY = "condor:radar-last-visit";

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

export function agoText(iso, now = Date.now()) {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

// The link Juan pastes in his comment: the visit lands in site_visitors.source as comentario-<red>.
export const shareLink = (net) => `https://condoricfes.com/?fuente=comentario-${net}`;

export function filterPosts(posts, { net = "", view = "pendientes", q = "", marks = {} } = {}) {
  const needle = q.trim().toLowerCase();
  return posts.filter((p) => {
    if (net && p.net !== net) return false;
    const mark = marks[p.id];
    if (view === "pendientes" && mark) return false;
    if (view === "comentados" && mark !== "done") return false;
    if (view === "ocultos" && mark !== "hidden") return false;
    if (needle && !`${p.title} ${p.text} ${p.author} ${p.where}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export default function Radar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [net, setNet] = useState("");
  const [view, setView] = useState("pendientes");
  const [q, setQ] = useState("");
  const [marks, setMarks] = useState(() => read(MARKS_KEY, {}));
  const [lastVisit] = useState(() => read(SEEN_KEY, null));
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/radar`, { headers: await authHeaders(), cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error === "not_admin" ? "Tu cuenta no está en app_admins." : body.error === "sign_in_required" ? "Inicia sesión de nuevo." : `Error ${res.status}`);
      setData(body);
      // Reddit and Bluesky refuse the radar worker (Cloudflare addresses), so this browser asks them too, read-only.
      const live = { reddit, bluesky, mastodon };
      const got = await Promise.allSettled(Object.values(live).map((fn) => fn({})));
      const fresh = [];
      const browserStatus = {};
      Object.keys(live).forEach((k, i) => {
        const r = got[i];
        if (r.status === "fulfilled") { fresh.push(...r.value); browserStatus[k] = { ok: true, found: r.value.length, browser: true }; }
        else browserStatus[k] = { ok: false, error: String(r.reason?.message ?? r.reason).slice(0, 120), browser: true };
      });
      setData((d) => ({
        ...d,
        posts: merge(d?.posts ?? [], fresh).list,
        state: { ...(d?.state ?? {}), status: { ...(d?.state?.status ?? {}), ...Object.fromEntries(Object.entries(browserStatus).filter(([k, v]) => v.ok || !d?.state?.status?.[k]?.ok)) } },
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Remember this visit when leaving, so the next one marks what is new since now.
  useEffect(() => () => write(SEEN_KEY, new Date().toISOString()), []);

  const mark = (id, value) => setMarks((m) => {
    const next = { ...m };
    if (value) next[id] = value; else delete next[id];
    write(MARKS_KEY, next);
    return next;
  });
  const copy = async (p) => {
    try { await navigator.clipboard.writeText(shareLink(p.net)); setCopied(p.id); setTimeout(() => setCopied(null), 1800); } catch { /* no clipboard */ }
  };

  const posts = data?.posts ?? [];
  const counts = useMemo(() => {
    const c = {};
    for (const p of filterPosts(posts, { view, q, marks })) c[p.net] = (c[p.net] ?? 0) + 1;
    return c;
  }, [posts, view, q, marks]);
  const shown = useMemo(() => filterPosts(posts, { net, view, q, marks }), [posts, net, view, q, marks]);
  const status = data?.state?.status ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="fd-body rd">
      <section className="card fd-card">
        <div className="fd-card-head rd-head">
          <div>
            <h2>Posts nuevos sobre el ICFES</h2>
            <span className="caption">
              {data?.state?.at ? `Revisado ${agoText(data.state.at)} · se revisa cada 30 min · ` : "Aún no hay una revisión · "}
              Ábrelos y comenta tú: aquí nada se publica solo.
            </span>
          </div>
          <button type="button" className="secondary" onClick={load} disabled={loading}>{loading ? "Cargando…" : "Recargar"}</button>
        </div>
        {Object.keys(status).length > 0 && (
          <ul className="rd-sources" aria-label="Fuentes">
            {Object.entries(NETS).map(([k, n]) => {
              const s = status[k];
              if (!s) return null;
              const txt = s.ok ? `${s.found} encontrados${s.browser ? " (desde tu navegador)" : ""}` : s.skipped ? `apagado: ${s.skipped}` : `falló: ${s.error}`;
              return <li key={k} className={s.ok ? "ok" : "off"} title={txt} aria-label={`${n.label}: ${txt}`}><b>{n.label}</b> {s.ok ? "✓" : s.skipped ? "—" : "✕"} <span>{txt}</span></li>;
            })}
          </ul>
        )}
      </section>

      <section className="fd-filters rd-filters" aria-label="Filtros">
        <div className="segmented fd-period" role="radiogroup" aria-label="Estado">
          {[["pendientes", "Por comentar"], ["comentados", "Ya comenté"], ["ocultos", "Ocultos"], ["todos", "Todos"]].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "seg active" : "seg"} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <input type="search" className="rd-search" placeholder="Buscar en los posts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      </section>
      <div className="rd-nets" role="group" aria-label="Red">
        <button type="button" className={net === "" ? "rd-chip on" : "rd-chip"} aria-pressed={net === ""} onClick={() => setNet("")}>Todas <span>{total}</span></button>
        {Object.entries(NETS).map(([k, n]) => (
          <button key={k} type="button" className={net === k ? "rd-chip on" : "rd-chip"} aria-pressed={net === k} onClick={() => setNet(net === k ? "" : k)}>
            <i style={{ background: n.color }} />{n.label} <span>{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <p className="notice error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Cargando…</p>}
      {data && shown.length === 0 && (
        <p className="muted rd-empty">{posts.length === 0 ? "El radar todavía no ha guardado posts. La primera revisión llega en máximo 30 minutos después de activarlo." : "Nada con estos filtros."}</p>
      )}

      <ul className="rd-list">
        {shown.map((p) => {
          const n = NETS[p.net] ?? { label: p.net, color: "#888" };
          const isNew = lastVisit && p.seen && p.seen > lastVisit;
          return (
            <li key={p.id} className="card rd-post">
              <a className="rd-thumb" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir en ${n.label}`} style={{ "--net": n.color }}>
                {p.thumb ? <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.remove(); }} /> : null}
                <span className="rd-thumb-net">{n.label}</span>
              </a>
              <div className="rd-main">
                <div className="rd-meta">
                  <span className="rd-net" style={{ "--net": n.color }}>{n.label}</span>
                  <span className="rd-who">{p.author}{p.where && p.where !== p.author ? ` · ${p.where}` : ""}</span>
                  <span className="caption">{agoText(p.at)}{p.comments != null ? ` · ${p.comments} coment.` : ""}</span>
                  {isNew && <span className="rd-new">Nuevo</span>}
                  {marks[p.id] === "done" && <span className="rd-done">Comentado</span>}
                </div>
                {p.title && <a className="rd-title" href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a>}
                {p.text && <p className="rd-text">{p.text}</p>}
                <div className="rd-actions">
                  <a className="primary rd-open" href={p.url} target="_blank" rel="noopener noreferrer">Abrir post</a>
                  <button type="button" className="secondary" onClick={() => copy(p)}>{copied === p.id ? "Copiado" : "Copiar enlace"}</button>
                  {marks[p.id] === "done"
                    ? <button type="button" className="fd-link" onClick={() => mark(p.id, null)}>Desmarcar</button>
                    : <button type="button" className="fd-link" onClick={() => mark(p.id, "done")}>Ya comenté</button>}
                  {marks[p.id] === "hidden"
                    ? <button type="button" className="fd-link" onClick={() => mark(p.id, null)}>Mostrar</button>
                    : <button type="button" className="fd-link" onClick={() => mark(p.id, "hidden")}>Ocultar</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="card fd-card">
        <h2>Redes que no se pueden rastrear</h2>
        <span className="caption">No tienen una forma permitida y gratuita de buscar posts desde un programa. Estos enlaces abren su buscador en tu navegador, con lo más reciente.</span>
        <ul className="rd-noapi">
          {NO_API.map(([name, url, why]) => (
            <li key={name}>
              {url ? <a href={url} target="_blank" rel="noopener noreferrer"><b>{name}</b> ↗</a> : <b>{name}</b>}
              <span className="caption">{why}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
