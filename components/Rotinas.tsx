"use client";
// V24 · Painel das rotinas automáticas (só master): última execução, rodar agora e pré-visualizar os e-mails.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlarmClock, CalendarClock, Eye, Mail, RefreshCw, Send, X } from "lucide-react";

type Run = { id: string; at: string; operation: string; label: string };
type Status = { hoje: string; email: "smtp" | "resend" | null; cron: boolean; horario: string; execucoes: Run[] };
type Preview = { modo: string; email: string | null; info: Record<string, unknown>; mails: { to: string[]; name: string; subject: string; count: number; html: string }[] };
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function Rotinas() {
  const [st, setSt] = useState<Status | null>(null), [busy, setBusy] = useState(""), [msg, setMsg] = useState(""), [err, setErr] = useState(false);
  const [pv, setPv] = useState<Preview | null>(null), [pick, setPick] = useState(0);
  const load = useCallback(async () => { const r = await fetch("/api/cron/daily?status=1", { cache: "no-store" }); if (r.ok) setSt(await r.json()); }, []);
  useEffect(() => { void load(); }, [load]);
  async function call(modo: "diario" | "semanal", enviar: boolean) {
    setBusy(`${modo}-${enviar}`); setMsg("");
    try {
      const r = await fetch("/api/cron/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo, enviar }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha ao rodar a rotina.");
      if (enviar) { setErr(!!j.falhas?.length); setMsg(j.message + (j.falhas?.length ? ` — ${j.falhas[0].error}` : "")); await load(); }
      else { setPv(j); setPick(0); }
    } catch (e) { setErr(true); setMsg(e instanceof Error ? e.message : "Falha"); } finally { setBusy(""); }
  }
  const last = (k: string) => st?.execucoes.find(e => e.operation.startsWith(k));
  return <section className="v24-rot">
    <header><h2><AlarmClock size={17} /> Rotinas automáticas</h2><small>{st?.horario || "07:00 (São Paulo)"}</small></header>
    <div className="v24-rot-cfg">
      <span className={st?.cron ? "ok" : "bad"}><CalendarClock size={14} /> Agendamento {st?.cron ? "ativo" : "sem CRON_SECRET (rode o instalador V24)"}</span>
      <span className={st?.email ? "ok" : "bad"}><Mail size={14} /> E-mail {st?.email ? `configurado (${st.email.toUpperCase()})` : "não configurado — os e-mails não saem"}</span>
    </div>
    <div className="v24-rot-grid">
      {([["diario", "rotina diária", "Alertas do dia", "Seg a sex · para cada responsável: atividades vencidas ou vencendo, projetos parados, prazos de fase, próxima ação vencida ou faltando."], ["semanal", "resumo semanal", "Resumo da semana", "Segundas · masters e quem recebe escalonamento: gargalos, atacar primeiro, quem andou, vencidas por pessoa."]] as const).map(([k, op, title, text]) => { const l = last(op); return <div key={k} className="v24-rot-card">
        <b>{title}</b><p>{text}</p>
        <small>{l ? <>Última: {when(l.at)} · {l.operation.replace(op, "").replace(/[()]/g, "").trim()}<br />{l.label}</> : "Ainda não rodou."}</small>
        <div className="act">
          <button type="button" className="btn outline" disabled={!!busy} onClick={() => void call(k, false)}>{busy === `${k}-false` ? <RefreshCw className="spin" size={14} /> : <Eye size={14} />} Pré-visualizar</button>
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => void call(k, true)}>{busy === `${k}-true` ? <RefreshCw className="spin" size={14} /> : <Send size={14} />} Enviar agora</button>
        </div>
      </div>; })}
    </div>
    {msg && <div className={`v24-rot-msg ${err ? "bad" : "ok"}`}>{msg}</div>}
    {pv && createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPv(null); }}>
      <div className="v24-pv" role="dialog" aria-modal="true" aria-label="Pré-visualização dos e-mails">
        <header><b>{pv.modo === "semanal" ? "Resumo semanal" : "Alertas do dia"} · {pv.mails.length} e-mail(s){pv.email ? "" : " · e-mail não configurado"}</b><button type="button" className="p6-confirm-x" onClick={() => setPv(null)} aria-label="Fechar"><X size={17} /></button></header>
        {pv.mails.length ? <div className="v24-pv-body">
          <nav>{pv.mails.map((m, i) => <button key={i} type="button" className={i === pick ? "on" : ""} onClick={() => setPick(i)}><b>{m.name}</b><small>{m.to.join(", ")}</small><em>{m.count}</em></button>)}</nav>
          <div className="frame"><div className="subj">{pv.mails[pick].subject}</div><iframe title="E-mail" srcDoc={pv.mails[pick].html} sandbox="" /></div>
        </div> : <p className="v24-pv-empty">Nada a enviar hoje. 🎉</p>}
      </div>
    </div>, document.body)}
  </section>;
}
