import { useEffect, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { inviteLink, inviteMessage, myReferralCode, myReferrals, whatsapp } from "../../lib/growth/app.js";
import { track } from "../../lib/growth/events.js";
import { DEFAULT_RULES, friendStatus, passDate, rewardLevels, rulesLine, simulacroLine } from "../../lib/growth/rewards.js";
import "./growth.css";

// «Invita y estudia más» (migration 0053): the student's link, their level, what each friend still needs, and the
// rules. On Perfil and on its own page (#invitar). `demo` shows sample data without an account.
export default function InvitePanel({ profile, onBack = null, demo = null }) {
  const firstName = String(profile?.full_name ?? "").split(" ")[0];
  const [code, setCode] = useState(demo?.code ?? null);
  const [refs, setRefs] = useState(demo ?? null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (demo || !profile) return;
    myReferralCode().then((c) => { setCode(c); return myReferrals(); }).then(setRefs).catch(() => setFailed(true));
  }, [profile, demo]);

  const rules = { ...DEFAULT_RULES, ...(refs?.rules ?? {}) };
  const reward = refs?.reward ?? { points: 0, level: 0 };
  const { levels, next, need } = rewardLevels(rules, reward.points ?? 0);
  const pass = reward.pass_until ? passDate(reward.pass_until) : null;
  const link = code ? inviteLink(code) : "";
  const share = (via) => { try { localStorage.setItem("condor:invited", "1"); } catch { /* blocked */ } track(`share:${via}`, {}); };
  const copy = () => navigator.clipboard?.writeText(link).then(() => { setCopied(true); share("copiar"); setTimeout(() => setCopied(false), 2000); });
  const friends = refs?.friends ?? [];
  const pct = Math.min(100, Math.round(((reward.points ?? 0) / rules.l3) * 100));

  return (
    <div className="card sp-card gr-invite gr-rewards">
      <div className="section-head">
        <span className="label">Invita y estudia más</span>
        {onBack && <button type="button" className="link" onClick={onBack}>Volver</button>}
      </div>
      {pass
        ? <p className="gr-rw-lead"><b>Tienes el Pase total</b> hasta el {pass}: preguntas y simulacros sin límite.</p>
        : <p className="gr-rw-lead">{next && need > 0 ? <>Te {need === 1 ? "falta" : "faltan"} <b>{need === 1 ? "1 amigo" : `${need} amigos`}</b> para {next.perk.charAt(0).toLowerCase() + next.perk.slice(1)}.</> : "Invita a tus amigos y sube de nivel."}</p>}

      <div className="gr-rw-track" aria-label={`${reward.points ?? 0} de ${rules.l3} amigos`}>
        <span className="gr-meter"><i style={{ width: `${pct}%` }} /></span>
        <ol>
          {levels.map((l) => (
            <li key={l.level} className={l.reached ? "done" : ""}>
              <span className="gr-tick">{l.reached ? <Icon name="check" /> : l.points}</span>
              <span><b>{l.title}</b><span className="caption">{l.perk}</span></span>
            </li>
          ))}
        </ol>
      </div>
      <p className="caption">Además, cada amigo que cuenta te da <b>{rules.sim_friend} simulacros completos</b> más. Tu amigo recibe {rules.base + rules.welcome} preguntas al día su primera semana y un simulacro completo extra.</p>

      {code && (
        <>
          <div className="gr-code"><code>{link.replace(/^https?:\/\//, "")}</code><button type="button" className="secondary small" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button></div>
          <div className="gr-row">
            <a className="primary" href={whatsapp(inviteMessage(code, firstName))} target="_blank" rel="noreferrer" onClick={() => share("whatsapp-app")}>Invitar por WhatsApp</a>
            <a className="secondary" href={`../cartel/?ref=${code}&de=${encodeURIComponent(firstName)}`} target="_blank" rel="noreferrer" onClick={() => share("cartel")}>Cartel con mi QR</a>
          </div>
        </>
      )}
      {failed && !code && <p className="caption">No pudimos cargar tu enlace ahora. Intenta en un momento.</p>}

      {refs && (
        <div className="gr-kpis">
          <span><b>{reward.points ?? 0}</b><span className="caption">{(reward.points ?? 0) === 1 ? "amigo cuenta" : "amigos cuentan"}</span></span>
          <span><b>{pass ? "Sin límite" : refs.reward?.questions ?? rules.base}</b><span className="caption">preguntas al día</span></span>
          {refs.simulacros && <span><b>{refs.simulacros.unlimited ? "Sin límite" : refs.simulacros.remaining}</b><span className="caption">{simulacroLine(refs.simulacros)?.split(":")[0]}</span></span>}
        </div>
      )}

      {friends.length > 0 && (
        <ul className="gr-rw-friends">
          {friends.map((f, i) => {
            const s = friendStatus(f, rules);
            return <li key={i}><span>{f.name}{f.teacher ? " (profe)" : ""}</span><span className={`gr-rw-state ${s.tone}`}>{s.text}</span></li>;
          })}
        </ul>
      )}
      {refs?.invited_by && <span className="caption">Llegaste invitado por {refs.invited_by}.</span>}
      <p className="caption gr-rw-rules">{rulesLine(rules)}</p>
    </div>
  );
}

// The line shown when today's questions or this month's simulacros run out.
export function InviteNudge({ text, onInvite }) {
  return (
    <span className="gr-nudge">
      <span>{text}</span>
      {onInvite && <button type="button" className="secondary small" onClick={onInvite}>Invita amigos y estudia más</button>}
    </span>
  );
}
