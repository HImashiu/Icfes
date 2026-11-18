import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { Select, confirmDialog } from "../components/Controls.jsx";
import { areaColor } from "../lib/brand.js";
import { areaShort } from "../lib/teaching.js";
import { confetti, play } from "../lib/motion.js";
import {
  AREA_LIST, CHEERS, METRICS, SHARE_LEVELS, cheerOf, daysLeft, errorText, friendLink, friendMessage, friendsApi, plural, whatsapp,
} from "../lib/friends.js";
import { groupLink } from "../lib/growth/app.js";
import { track } from "../lib/growth/events.js";
import "./friends.css";

const TABS = [{ id: "amigos", label: "Amigos" }, { id: "parches", label: "Parches" }];
const listNames = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`);
const initial = (name) => (name || "?").trim()[0]?.toUpperCase() ?? "?";
const hue = (name) => [...(name || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

function Avatar({ name, size = 44 }) {
  return <span className="fr-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4), "--h": hue(name) }} aria-hidden="true">{initial(name)}</span>;
}

// Amigos (#amigos): friends and parches, for students. Everything is cooperative: friends cheer each other on and
// keep a streak together; a parche shares a streak, weekly missions, challenges and practice with the same questions.
// Nobody is ordered by a score (lists are A-Z) and progress is only shown when its owner chose to share it.
export default function Friends({ tab = "amigos", onTab, profileName, addCode = null, joinCode = null, groupAreas = [], pickKeys, onPracticeKeys }) {
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [openGroup, setOpenGroup] = useState(null);

  const load = useCallback(() => {
    friendsApi.myFriends().then(setData, (e) => { setData({ me: null, friends: [], incoming: [], outgoing: [], cheers: [], invites: [] }); setError(e.message === "sin_servidor" ? "Los amigos necesitan conexión." : errorText()); });
    friendsApi.groups().then(setGroups, () => setGroups([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (joinCode) onTab?.("parches"); }, [joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = (data?.incoming.length ?? 0) + (data?.invites.length ?? 0);
  return (
    <section className="fr-screen">
      <header className="screen-head"><h1>Amigos</h1></header>
      <div className="segmented sj-tabs" role="tablist" aria-label="Amigos y parches">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "seg active" : "seg"} onClick={() => { setOpenGroup(null); onTab?.(t.id); }}>
            {t.label}{t.id === "amigos" && pending > 0 ? <span className="fr-dot" aria-label={`${pending} pendientes`}>{pending}</span> : null}
          </button>
        ))}
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {data === null ? <div className="fr-skeleton card" aria-busy="true"><Mascot size={56} idle /><span className="caption">Buscando a tus amigos…</span></div>
        : tab === "parches"
          ? (openGroup
            ? <GroupDetail id={openGroup} friends={data.friends} groupAreas={groupAreas} pickKeys={pickKeys} onPracticeKeys={onPracticeKeys} onBack={() => { setOpenGroup(null); load(); }} />
            : <Parches groups={groups} invites={data.invites} me={data.me} profileName={profileName} joinCode={joinCode} onOpen={setOpenGroup} reload={load} />)
          : <FriendsTab data={data} groups={groups ?? []} addCode={addCode} reload={load} setData={setData} onOpenParches={() => onTab?.("parches")} />}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ friends tab

function FriendsTab({ data, groups, addCode, reload, setData, onOpenParches }) {
  const { me, friends, incoming, outgoing, cheers, invites } = data;
  return (
    <div className="fr-stack">
      {cheers.length > 0 && <CheersBanner cheers={cheers} onDone={() => { friendsApi.seenCheers().catch(() => null); setData({ ...data, cheers: [] }); }} />}
      {(incoming.length > 0 || invites.length > 0) && <Requests incoming={incoming} invites={invites} reload={reload} onOpenParches={onOpenParches} />}
      <div className="fr-two">
        {me && <MyCard me={me} addCode={addCode} reload={reload} />}
        {me && <Sharing me={me} onChange={(share) => setData({ ...data, me: { ...me, share } })} />}
      </div>
      <div className="section-head"><span className="label">Tus amigos</span>{friends.length > 0 && <span className="caption">{plural(friends.length, ["amigo", "amigos"])} · en orden alfabético</span>}</div>
      {friends.length === 0 ? (
        <div className="card fr-empty">
          <Mascot size={72} pose="normal" idle />
          <div><strong>Practicar con amigos es más fácil</strong><span className="caption">Comparte tu código. Cuando te acepten, se pueden animar y llevar una racha juntos.</span></div>
        </div>
      ) : (
        <ul className="fr-list">
          {friends.map((f) => <FriendCard key={f.id} f={f} me={me} groups={groups} reload={reload} />)}
        </ul>
      )}
      {outgoing.length > 0 && (
        <div className="card fr-waiting">
          <span className="caption">Esperando respuesta</span>
          <ul>{outgoing.map((o) => (
            <li key={o.id}><Avatar name={o.name} size={28} /><span>{o.name}</span>
              <button type="button" className="fr-text" onClick={async () => { await friendsApi.removeFriend(o.id).catch(() => null); reload(); }}>Cancelar</button></li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

function CheersBanner({ cheers, onDone }) {
  const ref = useRef(null);
  useEffect(() => { play?.("correct"); }, []);
  const first = cheers[0];
  return (
    <div className="card fr-cheers" ref={ref}>
      <Mascot size={72} pose="happy" />
      <div>
        <strong>{first.from} {cheerOf(first.kind).line}{first.group ? ` en «${first.group}»` : ""}</strong>
        <span className="fr-bubble">{cheerOf(first.kind).label}</span>
        {cheers.length > 1 && <span className="caption">Y {plural(cheers.length - 1, ["mensaje más", "mensajes más"])}: {cheers.slice(1, 4).map((c) => c.from).join(", ")}.</span>}
      </div>
      <button type="button" className="primary" onClick={() => { confetti(ref.current); onDone(); }}>¡Gracias!</button>
    </div>
  );
}

function Requests({ incoming, invites, reload, onOpenParches }) {
  const [busy, setBusy] = useState(null);
  const act = async (key, fn) => { setBusy(key); try { await fn(); } finally { setBusy(null); reload(); } };
  return (
    <div className="card fr-requests">
      <div className="section-head"><span className="label">Para ti</span></div>
      <ul>
        {incoming.map((r) => (
          <li key={r.id}>
            <Avatar name={r.name} size={36} />
            <span><b>{r.name}</b> quiere ser tu amigo</span>
            <span className="fr-req-actions">
              <button type="button" className="primary small" disabled={busy === r.id} onClick={() => act(r.id, () => { track("friends:accept", {}); return friendsApi.answerFriend(r.id, true); })}>Aceptar</button>
              <button type="button" className="secondary small" disabled={busy === r.id} onClick={() => act(r.id, () => friendsApi.answerFriend(r.id, false))}>Ahora no</button>
            </span>
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.group}>
            <span className="fr-avatar fr-avatar-group" aria-hidden="true"><Icon name="users" size={18} /></span>
            <span><b>{i.from}</b> te invita al parche «{i.name}» · {plural(i.members, ["persona", "personas"])}</span>
            <span className="fr-req-actions">
              <button type="button" className="primary small" disabled={busy === i.group} onClick={() => act(i.group, async () => { const r = await friendsApi.answerInvite(i.group, true); if (!r?.error) { track("parche:join", { via: "invite" }); onOpenParches(); } })}>Unirme</button>
              <button type="button" className="secondary small" disabled={busy === i.group} onClick={() => act(i.group, () => friendsApi.answerInvite(i.group, false))}>Ahora no</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyCard({ me, addCode, reload }) {
  const [code, setCode] = useState(addCode ?? "");
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const clean = code.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  useEffect(() => {
    setPreview(null);
    if (clean.length !== 6) return undefined;
    let live = true;
    friendsApi.preview(clean).then((p) => { if (live) setPreview(p ?? { missing: true }); }, () => null);
    return () => { live = false; };
  }, [clean]);
  const add = async () => {
    setMsg(null);
    try {
      const r = await friendsApi.addFriend(clean);
      if (r?.error) return setMsg({ bad: true, text: errorText(r.error) });
      track("friends:add", { s: r.status });
      setMsg({ text: r.status === "accepted" ? `¡Ahora ${preview?.name ?? "ustedes"} y tú son amigos!` : r.status === "already" ? "Ya son amigos." : `Le enviamos tu solicitud a ${preview?.name ?? "tu amigo"}.` });
      setCode("");
      if (window.location.hash.startsWith("#amigos/agregar")) history.replaceState(null, "", `${window.location.pathname}${window.location.search}#amigos`);
      reload();
    } catch { setMsg({ bad: true, text: errorText() }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(friendLink(me.code)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="card fr-me">
      <div className="fr-me-head">
        <Avatar name={me.name} size={48} />
        <div>
          <strong>{me.name}</strong>
          <span className="caption">{me.streak > 0 ? <><Icon name="flame" size={14} /> {plural(me.streak, ["día", "días"])} de racha</> : "Practica hoy para empezar tu racha"}</span>
        </div>
      </div>
      <span className="caption">Tu código de amigo</span>
      <div className="fr-code"><code aria-label={`Código ${me.code.split("").join(" ")}`}>{me.code}</code>
        <button type="button" className="secondary small" onClick={copy}>{copied ? "¡Copiado!" : "Copiar enlace"}</button>
        <a className="primary small" href={whatsapp(friendMessage(me.code, me.name))} target="_blank" rel="noreferrer" onClick={() => track("share:friend", {})}>WhatsApp</a>
      </div>
      <label className="fr-add">
        <span className="caption">Agregar con el código de tu amigo</span>
        <span className="fr-add-row">
          <input value={code} maxLength={8} placeholder="abc234" autoCapitalize="none" autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
          <button type="button" className="primary" disabled={clean.length !== 6 || preview?.me || preview?.missing} onClick={add}>Agregar</button>
        </span>
      </label>
      {clean.length === 6 && preview && !msg && (
        <span className={preview.missing || preview.me ? "caption fr-warn" : "caption"}>
          {preview.missing ? "No encontramos ese código." : preview.me ? "Ese es tu código." : `Vas a agregar a ${preview.name}.`}
        </span>
      )}
      {msg && <span className={msg.bad ? "caption fr-warn" : "caption fr-ok"} role="status">{msg.text}</span>}
    </div>
  );
}

function Sharing({ me, onChange }) {
  const [busy, setBusy] = useState(false);
  const pick = async (share) => {
    if (share === me.share || busy) return;
    setBusy(true);
    onChange(share);
    try { await friendsApi.setCard(null, share); track("friends:share", { s: share }); } catch { onChange(me.share); } finally { setBusy(false); }
  };
  return (
    <div className="card fr-share">
      <div className="section-head"><span className="label">¿Qué ven tus amigos?</span><Icon name="lock" size={16} /></div>
      <div className="fr-share-opts" role="radiogroup" aria-label="Qué ven tus amigos">
        {SHARE_LEVELS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={me.share === l.id} className={me.share === l.id ? "fr-opt on" : "fr-opt"} onClick={() => pick(l.id)}>
            <span className="fr-radio" aria-hidden="true" />
            <span><b>{l.label}</b><span className="caption">{l.hint}</span></span>
          </button>
        ))}
      </div>
      <span className="caption">Lo cambias cuando quieras. Nadie ve tu progreso si no lo compartes, y nunca hay tablas de posiciones.</span>
    </div>
  );
}

function CheerButton({ to, name, cheered, group = null, onSent, compact = false }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(cheered);
  const [err, setErr] = useState("");
  const ref = useRef(null);
  useEffect(() => setSent(cheered), [cheered]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (sent) return <span className="fr-sent"><Icon name="check" size={14} /> {compact ? "Enviado" : "Ánimo enviado"}</span>;
  const send = async (kind) => {
    setOpen(false);
    try {
      const r = await friendsApi.cheer(to, kind, group);
      if (r?.error) { setErr(errorText(r.error)); if (r.error === "already_today") setSent(true); return; }
      track("friends:cheer", { k: kind, g: group ? 1 : 0 });
      play?.("correct");
      confetti(ref.current, { count: 14, spread: 0.6 });
      setSent(true);
      onSent?.();
    } catch { setErr(errorText()); }
  };
  return (
    <span className="fr-cheer" ref={ref}>
      <button type="button" className={"secondary small"} aria-expanded={open} aria-label={`Animar a ${name}`} onClick={() => setOpen(!open)}>
        <Icon name="hand" size={16} /><span className={compact ? "fr-cheer-label compact" : "fr-cheer-label"}>Animar</span>
      </button>
      {open && (
        <span className="fr-cheer-menu" role="menu">
          {CHEERS.filter((c) => c.id !== "gracias").map((c) => <button key={c.id} type="button" role="menuitem" onClick={() => send(c.id)}>{c.label}</button>)}
        </span>
      )}
      {err && <span className="caption fr-warn">{err}</span>}
    </span>
  );
}

function FriendCard({ f, me, groups, reload }) {
  const [inviting, setInviting] = useState(false);
  const [note, setNote] = useState("");
  const shares = f.share !== "nada";
  const remove = async () => {
    if (!(await confirmDialog(`¿Quitar a ${f.name} de tus amigos? Dejarán de ver lo que comparten.`, { confirmLabel: "Quitar", danger: true }))) return;
    await friendsApi.removeFriend(f.id).catch(() => null);
    reload();
  };
  const invite = async (g) => {
    setInviting(false);
    const r = await friendsApi.inviteToGroup(g.id, f.id).catch(() => ({ error: "x" }));
    setNote(r?.error ? errorText(r.error) : r?.status === "already" ? `${f.name} ya está en «${g.name}».` : `Invitaste a ${f.name} a «${g.name}».`);
  };
  return (
    <li className="card fr-friend">
      <div className="fr-friend-head">
        <Avatar name={f.name} />
        <div className="fr-friend-name">
          <strong>{f.name}</strong>
          {shares
            ? <span className={f.today ? "fr-pill ok" : "fr-pill"}>{f.today ? <><Icon name="check" size={13} /> Practicó hoy</> : "Aún no practica hoy"}</span>
            : <span className="caption">Comparte solo su nombre</span>}
        </div>
        <CheerButton to={f.id} name={f.name} cheered={f.cheered} />
      </div>
      {shares && (
        <div className="fr-stats">
          <span className="fr-stat"><Icon name="flame" size={18} /><b>{f.streak}</b><span className="caption">{f.streak === 1 ? "día de racha" : "días de racha"}</span></span>
          {f.together != null && (
            <span className={f.together > 0 ? "fr-stat fr-together" : "fr-stat"}><Icon name="users" size={18} /><b>{f.together}</b><span className="caption">racha juntos</span></span>
          )}
          <span className="fr-stat"><Icon name="clock" size={18} /><b>{f.week_days}</b><span className="caption">{f.week_days === 1 ? "día esta semana" : "días esta semana"}</span></span>
          <span className="fr-stat"><Icon name="pencil" size={18} /><b>{f.week_questions}</b><span className="caption">preguntas esta semana</span></span>
        </div>
      )}
      {f.together === 0 && shares && me?.share !== "nada" && <span className="caption">Si los dos practican hoy, empiezan una racha juntos.</span>}
      {f.together == null && shares && me?.share === "nada" && <span className="caption">Comparte tu constancia para llevar una racha juntos.</span>}
      {f.share === "completo" && f.areas?.length > 0 && (
        <div className="fr-areas" aria-label="Por área, últimos 30 días">
          {f.areas.map((a) => (
            <span key={a.area} className="fr-area" style={{ "--c": areaColor(a.area) }}>
              <i aria-hidden="true" />
              <span>{areaShort(a.area)}</span>
              <b>{a.answered}</b>
              {a.pct != null && <span className="caption">{a.pct} %</span>}
            </span>
          ))}
        </div>
      )}
      <div className="fr-friend-foot">
        {groups.length > 0 && (
          <span className="fr-invite">
            <button type="button" className="fr-text accent" onClick={() => setInviting(!inviting)} aria-expanded={inviting}><Icon name="plus" size={14} /> Invitar a un parche</button>
            {inviting && <span className="fr-cheer-menu" role="menu">{groups.map((g) => <button key={g.id} type="button" role="menuitem" onClick={() => invite(g)}>{g.name}</button>)}</span>}
          </span>
        )}
        <button type="button" className="fr-text" onClick={remove}>Quitar</button>
      </div>
      {note && <span className="caption fr-ok" role="status">{note}</span>}
    </li>
  );
}

// ------------------------------------------------------------------------------------------------ parches

function Parches({ groups, invites, me, profileName, joinCode, onOpen, reload }) {
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(300);
  const [msg, setMsg] = useState("");
  const [making, setMaking] = useState(false);
  const display = me?.name || profileName || "Yo";
  useEffect(() => { if (joinCode) friendsApi.groupPreview(joinCode).then((p) => setPreview(p ?? false), () => setPreview(false)); }, [joinCode]);
  const create = async () => {
    setMsg("");
    try {
      const r = await friendsApi.createGroup(name.trim(), goal, display);
      if (r?.error) return setMsg(errorText(r.error));
      track("parche:create", { g: goal });
      setName("");
      setMaking(false);
      reload();
      onOpen(r.id);
    } catch { setMsg(errorText()); }
  };
  const join = async () => {
    setMsg("");
    try {
      const r = await friendsApi.joinGroup(joinCode, display);
      if (r?.error) return setMsg(errorText(r.error));
      track("parche:join", {});
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}#amigos/parches`);
      reload();
      onOpen(r.id);
    } catch { setMsg(errorText()); }
  };
  if (groups === null) return <div className="fr-skeleton card" aria-busy="true"><Mascot size={56} idle /></div>;
  return (
    <div className="fr-stack">
      <p className="caption">Un parche es un grupo de hasta 12 personas con racha, misiones y retos compartidos. Aquí nadie compite: suman entre todos.</p>
      {joinCode && preview && (
        <div className="card fr-join">
          <span className="fr-avatar fr-avatar-group" aria-hidden="true"><Icon name="users" size={20} /></span>
          <div><strong>Te invitaron a «{preview.name}»</strong><span className="caption">{plural(preview.members, ["persona", "personas"])} · meta de {preview.weekly_goal} preguntas por semana</span></div>
          <button type="button" className="primary" onClick={join}>Unirme como {display}</button>
        </div>
      )}
      {joinCode && preview === false && <p className="notice">No encontramos ese parche. Pide el enlace otra vez.</p>}
      {msg && <p className="notice error" role="alert">{msg}</p>}
      {invites.length > 0 && <p className="notice">Tienes {plural(invites.length, ["invitación", "invitaciones"])} a parches en la pestaña Amigos.</p>}
      {groups.length === 0 && !making && (
        <div className="card fr-empty">
          <Mascot size={80} pose="happy" idle />
          <div><strong>Arma tu primer parche</strong><span className="caption">Racha del parche, misiones de la semana y prácticas con las mismas preguntas para todos.</span></div>
        </div>
      )}
      <ul className="fr-groups">
        {groups.map((g) => {
          const pct = Math.min(100, (100 * g.week_total) / Math.max(1, g.weekly_goal));
          const todayCount = (g.members ?? []).filter((m) => m.today).length;
          return (
            <li key={g.id}>
              <button type="button" className="card fr-group-row" onClick={() => onOpen(g.id)}>
                <span className="fr-avatar fr-avatar-group" aria-hidden="true"><Icon name="users" size={20} /></span>
                <span className="fr-group-main">
                  <strong>{g.name}</strong>
                  <span className="gr-meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  <span className="caption">{g.week_total} de {g.weekly_goal} preguntas esta semana{g.members?.length ? ` · ${todayCount} de ${g.members.length} practicaron hoy` : ""}</span>
                </span>
                <Icon name="right" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      {making ? (
        <div className="card fr-form">
          <div className="section-head"><span className="label">Nuevo parche</span></div>
          <label><span className="caption">Nombre</span><input value={name} maxLength={40} placeholder="Los de 11 B" onChange={(e) => setName(e.target.value)} /></label>
          <span className="caption">Meta semanal entre todos</span>
          <div className="fr-chips" role="radiogroup" aria-label="Meta semanal">
            {[150, 300, 500, 800].map((n) => <button key={n} type="button" role="radio" aria-checked={goal === n} className={goal === n ? "fr-chip on" : "fr-chip"} onClick={() => setGoal(n)}>{n} preguntas</button>)}
          </div>
          <div className="fr-row">
            <button type="button" className="primary" disabled={name.trim().length < 2} onClick={create}>Crear parche</button>
            <button type="button" className="secondary" onClick={() => setMaking(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="primary fr-wide" onClick={() => setMaking(true)}><Icon name="plus" size={18} /> Crear un parche</button>
      )}
    </div>
  );
}

function GroupDetail({ id, friends, groupAreas, pickKeys, onPracticeKeys, onBack }) {
  const [g, setG] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => friendsApi.overview(id).then((o) => (o?.error ? setError(errorText(o.error)) : setG(o)), () => setError(errorText())), [id]);
  useEffect(() => { load(); }, [load]);
  if (error) return <div className="fr-stack"><button type="button" className="fr-text fr-back" onClick={onBack}><Icon name="left" size={16} /> Parches</button><p className="notice error">{error}</p></div>;
  if (!g) return <div className="fr-skeleton card" aria-busy="true"><Mascot size={56} idle /><span className="caption">Abriendo el parche…</span></div>;
  const pct = Math.min(100, (100 * g.week_total) / Math.max(1, g.weekly_goal));
  const leave = async () => {
    if (!(await confirmDialog(`¿Salir de «${g.name}»?`, { confirmLabel: "Salir", danger: true }))) return;
    await friendsApi.leaveGroup(g.id).catch(() => null);
    onBack();
  };
  return (
    <div className="fr-stack">
      <div className="fr-group-head">
        <button type="button" className="fr-text fr-back" onClick={onBack}><Icon name="left" size={16} /> Parches</button>
        <h2>{g.name}</h2>
        <InviteBar g={g} friends={friends} />
      </div>
      <StreakHero g={g} reload={load} />
      <div className="card fr-goal">
        <div className="section-head"><span className="label">Meta de la semana</span><span className="caption">{g.week_total} de {g.weekly_goal} preguntas</span></div>
        <span className="fr-meter big" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        <span className="caption">{g.week_total >= g.weekly_goal ? "¡Meta cumplida entre todos!" : `Faltan ${g.weekly_goal - g.week_total} preguntas entre todos.`}</span>
      </div>
      <Missions g={g} />
      <GroupPractice g={g} groupAreas={groupAreas} pickKeys={pickKeys} onPracticeKeys={onPracticeKeys} reload={load} />
      <Challenges g={g} reload={load} />
      <Members g={g} reload={load} />
      <button type="button" className="fr-text" onClick={leave}>Salir del parche</button>
    </div>
  );
}

function InviteBar({ g, friends }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const inGroup = new Set(g.members.map((m) => m.id));
  const candidates = friends.filter((f) => !inGroup.has(f.id));
  const invite = async (f) => {
    const r = await friendsApi.inviteToGroup(g.id, f.id).catch(() => ({ error: "x" }));
    setNote(r?.error ? errorText(r.error) : `Invitaste a ${f.name}.`);
    setOpen(false);
  };
  return (
    <div className="fr-row fr-invitebar">
      <a className="secondary small" href={whatsapp(`Únete a mi parche «${g.name}» en Cóndor para practicar el ICFES juntos: ${groupLink(g.code)}`)} target="_blank" rel="noreferrer" onClick={() => track("share:parche", {})}>Invitar por WhatsApp</a>
      {candidates.length > 0 && (
        <span className="fr-invite">
          <button type="button" className="secondary small" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="plus" size={14} /> Invitar amigos</button>
          {open && <span className="fr-cheer-menu" role="menu">{candidates.map((f) => <button key={f.id} type="button" role="menuitem" onClick={() => invite(f)}>{f.name}</button>)}</span>}
        </span>
      )}
      {note && <span className="caption fr-ok" role="status">{note}</span>}
    </div>
  );
}

function StreakHero({ g, reload }) {
  const missing = g.members.filter((m) => !m.today);
  const meMissing = missing.some((m) => m.me);
  const ref = useRef(null);
  useEffect(() => {
    const key = `condor:parche-day:${g.id}`;
    const today = new Date().toISOString().slice(0, 10);
    if (g.today_done && get(key) !== today) { set(key, today); setTimeout(() => confetti(ref.current), 300); }
  }, [g.id, g.today_done]);
  return (
    <div className={g.today_done ? "card fr-streak done" : "card fr-streak"} ref={ref}>
      <div className="fr-streak-flame" aria-hidden="true"><Icon name="flame" size={40} /><b>{g.streak}</b></div>
      <div className="fr-streak-text">
        <strong>{g.streak === 0 ? "Empiecen la racha del parche" : `${plural(g.streak, ["día", "días"])} de racha del parche`}</strong>
        <span className="caption">
          {g.today_done ? "¡Hoy todos practicaron! La racha sigue."
            : meMissing ? `Te falta practicar hoy${missing.length > 1 ? ` (y a ${missing.length - 1} más)` : ""}. Un día cuenta cuando todos practican.`
              : `Hoy ${missing.length === 1 ? "falta" : "faltan"} ${listNames(missing.map((m) => m.name))}. Si todos practican hoy, la racha llega a ${g.streak + 1}.`}
        </span>
        {!g.today_done && missing.filter((m) => !m.me).length > 0 && (
          <span className="fr-row fr-nudges">
            {missing.filter((m) => !m.me).map((m) => (
              <span key={m.id} className="fr-nudge"><Avatar name={m.name} size={26} />{m.name}<CheerButton to={m.id} name={m.name} cheered={m.cheered} group={g.id} compact onSent={reload} /></span>
            ))}
          </span>
        )}
      </div>
      <Mascot size={78} pose={g.today_done ? "celebrating" : "normal"} idle={!g.today_done} />
    </div>
  );
}

function Missions({ g }) {
  const ref = useRef(null);
  const doneNow = g.missions.filter((m) => m.done).map((m) => m.id).join(",");
  useEffect(() => {
    const key = `condor:missions:${g.id}:${g.week_ends}`;
    const seen = new Set((get(key) || "").split(",").filter(Boolean));
    const fresh = doneNow.split(",").filter((x) => x && !seen.has(x));
    if (fresh.length) { set(key, doneNow); setTimeout(() => confetti(ref.current, { count: 30 }), 400); }
  }, [g.id, g.week_ends, doneNow]);
  const ends = new Date(`${g.week_ends}T12:00:00`);
  const left = Math.max(0, Math.round((ends - Date.now()) / 864e5));
  return (
    <div className="card fr-missions" ref={ref}>
      <div className="section-head"><span className="label">Misiones del parche</span><span className="caption">{left === 0 ? "Terminan hoy" : `Terminan en ${plural(left, ["día", "días"])}`}</span></div>
      <ul>
        {g.missions.map((m) => (
          <li key={m.id} className={m.done ? "done" : ""}>
            <span className="fr-mission-icon" aria-hidden="true">{m.done ? <Icon name="check" size={20} /> : <Icon name={m.id === "dias" || m.id === "juntos" ? "flame" : m.id === "cinco" ? "grid" : "bolt"} size={20} />}</span>
            <span className="fr-mission-body">
              <span>{m.title}</span>
              <span className="fr-meter" aria-hidden="true"><i style={{ width: `${(100 * m.progress) / Math.max(1, m.target)}%` }} /></span>
            </span>
            <b className="fr-mission-count">{m.progress}/{m.target}</b>
          </li>
        ))}
      </ul>
      <span className="caption"><Icon name="trophy" size={14} /> El parche ha cumplido {plural(g.missions_done, ["misión", "misiones"])} en total.</span>
    </div>
  );
}

function Challenges({ g, reload }) {
  const [making, setMaking] = useState(false);
  const [form, setForm] = useState({ title: "", area: "", metric: "preguntas", target: 60, days: 7 });
  const [msg, setMsg] = useState("");
  const save = async () => {
    setMsg("");
    try {
      const r = await friendsApi.createChallenge(g.id, form);
      if (r?.error) return setMsg(errorText(r.error));
      track("parche:challenge", { m: form.metric });
      setMaking(false);
      setForm({ title: "", area: "", metric: "preguntas", target: 60, days: 7 });
      reload();
    } catch { setMsg(errorText()); }
  };
  const remove = async (c) => {
    if (!(await confirmDialog(`¿Borrar el reto «${c.title}»?`, { confirmLabel: "Borrar", danger: true }))) return;
    await friendsApi.deleteChallenge(c.id).catch(() => null);
    reload();
  };
  const unit = (metric) => METRICS.find((x) => x.id === metric)?.unit ?? ["", ""];
  return (
    <div className="card fr-challenges">
      <div className="section-head"><span className="label">Retos del parche</span>{!making && <button type="button" className="secondary small" onClick={() => setMaking(true)}><Icon name="plus" size={14} /> Nuevo reto</button>}</div>
      {g.challenges.length === 0 && !making && <span className="caption">Propongan un reto para todos, por ejemplo «60 preguntas de Inglés antes del viernes».</span>}
      <ul>
        {g.challenges.map((c) => {
          const done = c.progress >= c.target;
          const over = new Date(c.ends_at).getTime() <= Date.now();
          return (
            <li key={c.id} className={done ? "done" : over ? "over" : ""}>
              <div className="fr-ch-head">
                <strong>{c.title}</strong>
                {c.area && <span className="fr-area-tag" style={{ "--c": areaColor(c.area) }}>{areaShort(c.area)}</span>}
              </div>
              <span className="fr-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * c.progress) / Math.max(1, c.target))}%` }} /></span>
              <span className="caption">
                {done ? `¡Logrado! ${c.progress} ${unit(c.metric)[1]} entre todos.` : `${c.progress} de ${plural(c.target, unit(c.metric))} entre todos`}
                {" · "}{over ? "Terminó" : daysLeft(c.ends_at)}{c.by ? ` · lo propuso ${c.by}` : ""}
                {c.can_delete && <> · <button type="button" className="fr-text" onClick={() => remove(c)}>Borrar</button></>}
              </span>
            </li>
          );
        })}
      </ul>
      {making && (
        <div className="fr-form">
          <label><span className="caption">Nombre del reto</span><input value={form.title} maxLength={60} placeholder="Semana de Inglés" onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <div className="fr-grid">
            <label><span className="caption">Área</span>
              <Select value={form.area} onChange={(v) => setForm({ ...form, area: v })} options={[{ value: "", label: "Todas las áreas" }, ...AREA_LIST.map((a) => ({ value: a, label: a }))]} aria-label="Área" /></label>
            <label><span className="caption">Cuenta</span>
              <Select value={form.metric} onChange={(v) => setForm({ ...form, metric: v })} options={METRICS.map((m) => ({ value: m.id, label: m.label }))} aria-label="Qué cuenta" /></label>
            <label><span className="caption">Meta entre todos</span>
              <input type="number" inputMode="numeric" min={1} max={5000} value={form.target} onChange={(e) => setForm({ ...form, target: Math.max(1, Math.min(5000, Number(e.target.value) || 1)) })} /></label>
            <label><span className="caption">Duración</span>
              <Select value={String(form.days)} onChange={(v) => setForm({ ...form, days: Number(v) })} options={[3, 7, 10, 14].map((d) => ({ value: String(d), label: `${d} días` }))} aria-label="Duración" /></label>
          </div>
          {msg && <span className="caption fr-warn">{msg}</span>}
          <div className="fr-row">
            <button type="button" className="primary" disabled={form.title.trim().length < 2} onClick={save}>Proponer reto</button>
            <button type="button" className="secondary" onClick={() => setMaking(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupPractice({ g, groupAreas, pickKeys, onPracticeKeys, reload }) {
  const [making, setMaking] = useState(false);
  const areas = groupAreas.length ? groupAreas : AREA_LIST;
  const [form, setForm] = useState({ area: areas[0] ?? "", n: 10, days: 7 });
  const [msg, setMsg] = useState("");
  const save = async () => {
    setMsg("");
    const pick = pickKeys?.(form.area, form.n);
    if (!pick?.keys?.length) return setMsg("Abre un cuadernillo en Practicar para elegir preguntas.");
    try {
      const r = await friendsApi.createActivity(g.id, { title: `${form.area} en parche`, slug: pick.slug, keys: pick.keys, area: form.area, days: form.days });
      if (r?.error) return setMsg(errorText(r.error));
      track("parche:practice", { n: pick.keys.length });
      setMaking(false);
      reload();
    } catch { setMsg(errorText()); }
  };
  return (
    <div className="card fr-practice">
      <div className="section-head"><span className="label">Práctica en parche</span>{!making && <button type="button" className="secondary small" onClick={() => setMaking(true)}><Icon name="plus" size={14} /> Nueva</button>}</div>
      {g.activities.length === 0 && !making && <span className="caption">Las mismas preguntas para todo el parche. Al terminar, ven en cuáles le fue mejor al grupo, sin nombres.</span>}
      <ul>{g.activities.map((a) => <PracticeItem key={a.id} a={a} onPracticeKeys={onPracticeKeys} reload={reload} />)}</ul>
      {making && (
        <div className="fr-form">
          <div className="fr-grid">
            <label><span className="caption">Área</span>
              <Select value={form.area} onChange={(v) => setForm({ ...form, area: v })} options={areas.map((a) => ({ value: a, label: a }))} aria-label="Área" /></label>
            <label><span className="caption">Preguntas</span>
              <Select value={String(form.n)} onChange={(v) => setForm({ ...form, n: Number(v) })} options={[5, 10, 15].map((n) => ({ value: String(n), label: `${n} preguntas` }))} aria-label="Número de preguntas" /></label>
            <label><span className="caption">Plazo</span>
              <Select value={String(form.days)} onChange={(v) => setForm({ ...form, days: Number(v) })} options={[3, 7, 14].map((d) => ({ value: String(d), label: `${d} días` }))} aria-label="Plazo" /></label>
          </div>
          <span className="caption">Las preguntas salen del cuadernillo que tienes abierto.</span>
          {msg && <span className="caption fr-warn">{msg}</span>}
          <div className="fr-row">
            <button type="button" className="primary" onClick={save}>Crear práctica</button>
            <button type="button" className="secondary" onClick={() => setMaking(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PracticeItem({ a, onPracticeKeys, reload }) {
  const mine = a.members.find((m) => m.me)?.answered ?? 0;
  const total = a.keys.length;
  const finished = mine >= total;
  const over = new Date(a.ends_at).getTime() <= Date.now();
  const doneCount = a.members.filter((m) => m.answered >= total).length;
  const remove = async () => {
    if (!(await confirmDialog(`¿Borrar «${a.title}»?`, { confirmLabel: "Borrar", danger: true }))) return;
    await friendsApi.deleteActivity(a.id).catch(() => null);
    reload();
  };
  return (
    <li className={finished ? "fr-pr done" : "fr-pr"}>
      <div className="fr-ch-head">
        <strong>{a.title}</strong>
        {a.area && <span className="fr-area-tag" style={{ "--c": areaColor(a.area) }}>{areaShort(a.area)}</span>}
        <span className="caption">{total} preguntas · {over ? "Terminó" : daysLeft(a.ends_at)}{a.by ? ` · de ${a.by}` : ""}</span>
      </div>
      <div className="fr-pr-members">
        {a.members.map((m, i) => (
          <span key={i} className={m.answered >= total ? "fr-pr-m done" : "fr-pr-m"} title={`${m.name}: ${m.answered} de ${total}`}>
            <Avatar name={m.name} size={26} />
            <span>{m.me ? "Tú" : m.name}</span>
            {m.answered >= total ? <Icon name="check" size={14} /> : <span className="caption">{m.answered}/{total}</span>}
          </span>
        ))}
      </div>
      <span className="caption">{doneCount === a.members.length ? "¡Todo el parche terminó!" : `${doneCount} de ${a.members.length} terminaron`}</span>
      {finished ? (
        <div className="fr-pr-q" aria-label="Cómo le fue al parche en cada pregunta">
          <span className="caption">Cómo le fue al parche (sin nombres)</span>
          <div className="fr-pr-bars">
            {a.questions.map((q, i) => (
              <span key={q.key} className="fr-pr-bar" title={q.pct == null ? `Pregunta ${i + 1}: sin respuestas aún` : `Pregunta ${i + 1}: ${q.pct} % de aciertos`}>
                <i style={{ height: `${Math.max(6, q.pct ?? 0)}%` }} className={q.pct == null ? "none" : q.pct >= 70 ? "hi" : q.pct >= 40 ? "mid" : "lo"} />
                <span>{i + 1}</span>
              </span>
            ))}
          </div>
          {(() => { const hard = a.questions.map((q, i) => ({ ...q, i })).filter((q) => q.pct != null && q.pct < 50); return hard.length ? <span className="caption">Repasen juntos {hard.length === 1 ? "la pregunta" : "las preguntas"} {hard.map((q) => q.i + 1).join(", ")}.</span> : null; })()}
          <button type="button" className="secondary small" onClick={() => onPracticeKeys?.(a.slug, a.keys, a.title)}>Repasar</button>
        </div>
      ) : (
        !over && <button type="button" className="primary small" onClick={() => onPracticeKeys?.(a.slug, a.keys, a.title)}>{mine > 0 ? `Seguir (${mine} de ${total})` : "Practicar"}</button>
      )}
      {a.can_delete && <button type="button" className="fr-text" onClick={remove}>Borrar</button>}
    </li>
  );
}

function Members({ g, reload }) {
  const list = useMemo(() => [...g.members].sort((a, b) => a.name.localeCompare(b.name, "es")), [g.members]);
  return (
    <div className="card fr-members">
      <div className="section-head"><span className="label">Integrantes</span><span className="caption">{plural(list.length, ["persona", "personas"])} · en orden alfabético</span></div>
      <ul>
        {list.map((m) => (
          <li key={m.id}>
            <Avatar name={m.name} size={34} />
            <span className="fr-m-name"><b>{m.name}{m.me ? " (tú)" : ""}</b><span className="caption">{plural(m.days, ["día", "días"])} esta semana</span></span>
            <span className={m.today ? "fr-pill ok" : "fr-pill"}>{m.today ? <><Icon name="check" size={13} /> Hoy</> : "Aún no hoy"}</span>
            {!m.me && <CheerButton to={m.id} name={m.name} cheered={m.cheered} group={g.id} compact onSent={reload} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Inicio card

// One line on Inicio: what friends sent (a cheer, a request, an invitation) or how the parche is doing today.
export function FriendsPulse({ onOpen }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([friendsApi.myFriends(), friendsApi.groups()])
      .then(([f, g]) => { if (live) setState({ f, g: g ?? [] }); }, () => { if (live) setState(false); });
    return () => { live = false; };
  }, []);
  if (!state) return null;
  const { f, g } = state;
  const group = g[0];
  let line; let sub; let tab = "amigos"; let pose = "normal";
  if (f.cheers.length) { const c = f.cheers[0]; line = `${c.from} ${cheerOf(c.kind).line}`; sub = cheerOf(c.kind).label; pose = "happy"; }
  else if (f.incoming.length) { line = `${f.incoming[0].name} quiere ser tu amigo`; sub = "Acepta para animarse y llevar una racha juntos."; }
  else if (f.invites.length) { line = `${f.invites[0].from} te invita a «${f.invites[0].name}»`; sub = "Un parche suma entre todos, sin competir."; }
  else if (group) {
    const members = group.members ?? [];
    const done = members.filter((m) => m.today).length;
    line = `Parche «${group.name}»: ${done} de ${members.length} practicaron hoy`;
    sub = done === members.length ? "¡Todos cumplieron hoy! La racha sigue." : "Un día cuenta para la racha cuando todos practican.";
    tab = "parches"; pose = done === members.length ? "happy" : "normal";
  } else if (!f.friends.length) { line = "Practica con tus amigos"; sub = "Agrégalos con tu código, anímense y armen un parche."; }
  else return null;
  return (
    <button type="button" className="card fr-pulse" onClick={() => onOpen(tab)}>
      <Mascot size={52} pose={pose} />
      <span><strong>{line}</strong><span className="caption">{sub}</span></span>
      <Icon name="right" size={18} />
    </button>
  );
}
