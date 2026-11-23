"use client";
import { friendly } from "@/lib/friendly";
// V9 · Liberação master: avançar sem PDF, dispensar um PDF, encerrar ou cancelar o projeto.
// Pede e-mail + senha do usuário master a cada liberação e registra o motivo na linha do tempo.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, CheckCircle2, FastForward, FileCheck2, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldCheck, X } from "lucide-react";
import Select from "./Select";
import DateField from "./DateField";
import { plusBusinessDays } from "./NextActionDialog";

export type MasterAction = "advance" | "waive" | "close" | "cancel";
export type MasterBox = {
  action: MasterAction;
  projectId: string;
  client: string;
  current: string;
  phase?: string;            // waive: fase do PDF dispensado
  phaseLabel?: string;
  options?: { key: string; label: string }[]; // advance: fases possíveis
  defaultEmail?: string;
  trusted?: { name: string; email: string } | null; // V22.3: usuário logado já autorizado (sem pedir senha)
  owners?: string[]; // V24: responsáveis possíveis para a próxima ação
  next?: { nextAction: string; nextActionOwner: string; nextActionDue: string | null }; // V24: próxima ação da fase nova
};

const META: Record<MasterAction, { title: string; text: string; ok: string; Icon: typeof ShieldCheck }> = {
  advance: { title: "Liberar avanço sem PDF", text: "O card avança mesmo sem o PDF assinado. A liberação fica registrada com o seu nome e o motivo.", ok: "Liberar e avançar", Icon: FastForward },
  waive: { title: "Dispensar este PDF", text: "O documento deixa de ser cobrado nesta fase. O registro mostra quem liberou e por quê.", ok: "Dispensar PDF", Icon: FileCheck2 },
  close: { title: "Encerrar projeto", text: "O projeto vai para Encerrado agora, sem exigir os PDFs pendentes. Sai do painel de TV.", ok: "Encerrar projeto", Icon: CheckCircle2 },
  cancel: { title: "Cancelar projeto", text: "O projeto fica como Cancelado e sai da esteira e do painel de TV. Continua na base e no histórico.", ok: "Cancelar projeto", Icon: Ban },
};

export default function MasterDialog({ box, onClose, onDone }: { box: MasterBox; onClose: () => void; onDone: (message: string) => void | Promise<void> }) {
  const phaseOnly = box.action === "advance" || box.action === "waive"; // V22.2: liberadores de fase também podem
  const m = META[box.action];
  const [to, setTo] = useState(box.options?.[0]?.key || ""), [reason, setReason] = useState("");
  const [email, setEmail] = useState(box.defaultEmail || ""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [mounted, setMounted] = useState(false);
  const [na, setNa] = useState(""), [naOwner, setNaOwner] = useState(box.owners?.[0] || ""), [naDue, setNaDue] = useState(plusBusinessDays(3)); // V24
  const askNext = box.action === "advance" && !box.next && to !== "fim";
  const first = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => first.current?.focus(), 40);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [busy, onClose]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (reason.trim().length < 5) return setError("Descreva o motivo da liberação.");
    if (!box.trusted && (!email.trim() || !password)) return setError(phaseOnly ? "Informe o e-mail e a senha de quem libera a fase." : "Informe o e-mail e a senha do usuário master.");
    if (askNext && (na.trim().length < 4 || !naOwner.trim())) return setError("Informe a próxima ação da nova fase e o responsável.");
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/flow/override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: box.projectId, action: box.action, to, phase: box.phase, reason, ...(box.next || (askNext ? { nextAction: na.trim(), nextActionOwner: naOwner.trim(), nextActionDue: naDue || null } : {})), ...(box.trusted ? { trusted: true } : { email, password }) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Liberação recusada.");
      await onDone(j.message || "Liberado");
      onClose();
    } catch (err) { setError(friendly(err instanceof Error ? err.message : "Falha na liberação.")); setPassword(""); setBusy(false); }
  }
  if (!mounted) return null;
  const danger = box.action === "cancel";
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className={`p6-confirm v9-master ${danger ? "danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="v9-master-title" onSubmit={e => void submit(e)}>
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button>
        <div className="p6-confirm-icon" aria-hidden="true"><span><m.Icon size={30} strokeWidth={1.9} /></span></div>
        <span className="v9-master-tag"><ShieldCheck size={13} /> {phaseOnly ? "Liberação de fase" : "Liberação master"}</span>
        <h2 id="v9-master-title">{m.title}</h2>
        <p>{m.text}</p>
        <dl className="p6-confirm-details">
          <div><dt>Cliente</dt><dd>{box.client}</dd></div>
          <div><dt>Fase atual</dt><dd>{box.current}</dd></div>
          {box.action === "waive" && <div><dt>PDF dispensado</dt><dd>{box.phaseLabel}</dd></div>}
          {box.next && <div><dt>Próxima ação</dt><dd>{box.next.nextAction}{box.next.nextActionOwner ? ` · ${box.next.nextActionOwner}` : ""}</dd></div>}
        </dl>
        <div className="v9-master-fields">
          {box.action === "advance" && (box.options?.length || 0) > 1 && <label><span>Avançar para</span><Select value={to} onChange={e => setTo(e.target.value)} disabled={busy}>{box.options!.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</Select></label>}
          {box.action === "advance" && (box.options?.length || 0) === 1 && <div className="v9-master-to">Próxima fase: <b>{box.options![0].label}</b></div>}
          {askNext && <div className="v24-inline-next"><label><span>Próxima ação da nova fase</span><input value={na} onChange={e => setNa(e.target.value)} disabled={busy} placeholder="Ex.: agendar a homologação com o cliente" /></label>
            <div className="v7-grid2"><label><span>Responsável</span><input list="v24-owners" value={naOwner} onChange={e => setNaOwner(e.target.value)} disabled={busy} /><datalist id="v24-owners">{(box.owners || []).map(o => <option key={o} value={o} />)}</datalist></label>
            <label><span>Até quando</span><DateField value={naDue} onChange={v => setNaDue(v)} aria-label="Até quando" /></label></div></div>}
          <label><span>Motivo (fica registrado)</span><textarea ref={first} rows={2} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} placeholder={box.action === "cancel" ? "Ex.: cliente desistiu do projeto em 10/11" : "Ex.: etapa já realizada; documento assinado em papel com o cliente"} /></label>
          {box.trusted ? <div className="v22-trusted"><ShieldCheck size={15} /> Liberando como <b>{box.trusted.name || box.trusted.email}</b> — você já tem permissão; não precisa digitar a senha.</div> : <div className="v9-master-cred">
            <label><span><Mail size={13} /> {phaseOnly ? "E-mail de quem libera" : "E-mail do master"}</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} placeholder="master@empresa.com" /></label>
            <label><span><KeyRound size={13} /> Senha</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} placeholder="••••••" /></label>
          </div>}
        </div>
        {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        <div className="p6-confirm-actions">
          <button type="button" className="p6-confirm-cancel" onClick={onClose} disabled={busy}>Voltar</button>
          <button type="submit" className="p6-confirm-ok" disabled={busy}>{busy ? <RefreshCw className="spin" size={16} /> : <LockKeyhole size={16} />}{busy ? "Conferindo..." : m.ok}</button>
        </div>
      </form>
    </div>, document.body);
}
