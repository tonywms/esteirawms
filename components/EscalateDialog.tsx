"use client";
import { friendly } from "@/lib/friendly";
// V9 · Escalonar entrave: escolhe os responsáveis (cadastrados em Equipe), escreve o pedido,
// baixa o PDF premium do histórico e/ou envia por e-mail (registrado na linha do tempo).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckSquare2, Download, Info, Mail, Megaphone, RefreshCw, Send, Square, X } from "lucide-react";
import type { Project, State } from "@/lib/types";
import Select from "./Select";

export default function EscalateDialog({ data, project, client, onClose, onDone }: { data: State; project: Project; client: string; onClose: () => void; onDone: (msg: string) => void | Promise<void> }) {
  const people = useMemo(() => data.staff.filter(s => s.active && (s.email || "").trim()).sort((a, b) => Number(!!b.escalation) - Number(!!a.escalation) || a.name.localeCompare(b.name)), [data.staff]);
  const [sel, setSel] = useState<string[]>(() => people.filter(p => p.escalation).map(p => p.email!.toLowerCase()));
  const [extra, setExtra] = useState(""), [message, setMessage] = useState(""), [urgency, setUrgency] = useState("Alta");
  const [busy, setBusy] = useState<"" | "pdf" | "send">(""), [error, setError] = useState(""), [mounted, setMounted] = useState(false);
  const [mail, setMail] = useState<{ configured: boolean; from: string | null } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setMounted(true); fetch("/api/escalate", { cache: "no-store" }).then(r => r.json()).then(setMail).catch(() => setMail({ configured: false, from: null }));
    const t = window.setTimeout(() => ref.current?.focus(), 40);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc); return () => { window.clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  const toggle = (e: string) => setSel(s => (s.includes(e) ? s.filter(x => x !== e) : [...s, e]));
  const body = (mode: "pdf" | "send") => JSON.stringify({ projectId: project.id, to: sel, extra, message, urgency, mode });
  const total = sel.length + extra.split(/[,;\s]+/).filter(Boolean).length;

  async function downloadPdf() {
    if (message.trim().length < 10) return setError("Descreva o pedido de intervenção (mínimo 10 caracteres).");
    setBusy("pdf"); setError("");
    const w = window.open("about:blank", "_blank");
    try {
      const r = await fetch("/api/escalate", { method: "POST", headers: { "Content-Type": "application/json" }, body: body("pdf") });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Falha ao gerar o PDF."); }
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else { const a = document.createElement("a"); a.href = url; a.download = `escalonamento-${client}.pdf`; a.click(); }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { w?.close(); setError(friendly(e instanceof Error ? e.message : "Falha ao gerar o PDF.")); }
    finally { setBusy(""); }
  }
  async function send() {
    if (message.trim().length < 10) return setError("Descreva o pedido de intervenção (mínimo 10 caracteres).");
    if (!total) return setError("Selecione ao menos um destinatário.");
    setBusy("send"); setError("");
    try {
      const r = await fetch("/api/escalate", { method: "POST", headers: { "Content-Type": "application/json" }, body: body("send") });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha no envio.");
      await onDone(j.message || "Escalonamento enviado"); onClose();
    } catch (e) { setError(friendly(e instanceof Error ? e.message : "Falha no envio.")); setBusy(""); }
  }
  if (!mounted) return null;
  const blocker = (project.blocker || "").trim() && project.blocker !== "-" ? project.blocker : "";
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="p6-confirm v9-esc" role="dialog" aria-modal="true" aria-labelledby="v9-esc-title">
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={!!busy} aria-label="Fechar"><X size={17} /></button>
        <header className="v9-esc-head">
          <span className="v9-esc-ico"><Megaphone size={24} /></span>
          <div><small>Escalonar entrave</small><h2 id="v9-esc-title">{client}</h2>{blocker && <p><AlertTriangle size={13} /> {blocker}</p>}</div>
        </header>
        <div className="v9-esc-body">
          <label className="v9-field"><span>Pedido de intervenção</span>
            <textarea ref={ref} rows={4} value={message} onChange={e => setMessage(e.target.value)} disabled={!!busy} placeholder="Ex.: Cliente sem retorno há 12 dias sobre a API do ERP. Precisamos que o Comercial acione o diretor de TI do cliente até sexta." /></label>
          <div className="v9-esc-row">
            <label className="v9-field"><span>Urgência</span><Select value={urgency} onChange={e => setUrgency(e.target.value)} disabled={!!busy}><option>Crítica</option><option>Alta</option><option>Média</option></Select></label>
            <div className="v9-field"><span>Destinatários</span><div className="v9-esc-count"><Mail size={14} /> {total} selecionado(s)</div></div>
          </div>
          <div className="v9-field"><span>Responsáveis cadastrados em Equipe</span>
            <div className="v9-people">{people.map(pp => { const e = pp.email!.toLowerCase(), on = sel.includes(e); return <button type="button" key={pp.id} className={on ? "on" : ""} onClick={() => toggle(e)} disabled={!!busy}>
              {on ? <CheckSquare2 size={17} /> : <Square size={17} />}<div><strong>{pp.name}</strong><small>{pp.sector || pp.role} · {pp.email}</small></div>{pp.escalation && <em>escalonamento</em>}</button>; })}
              {!people.length && <div className="v9-empty"><Info size={15} /> Nenhum responsável com e-mail. Cadastre os e-mails em Recursos › Equipe & capacidade.</div>}</div></div>
          <label className="v9-field"><span>Outros e-mails (separe por vírgula)</span><input value={extra} onChange={e => setExtra(e.target.value)} disabled={!!busy} placeholder="ceo@wmsexpert.com.br, comercial@wmsexpert.com.br" /></label>
          {mail && !mail.configured && <div className="p6-confirm-warn"><Info size={15} /><span>O envio por e-mail ainda não foi configurado. Você já pode baixar o PDF e anexar no seu e-mail.</span></div>}
          {mail?.configured && <div className="p6-confirm-note"><Info size={15} /><span>Enviado por {mail.from}. As respostas vão para o seu e-mail. O envio fica registrado no histórico do projeto.</span></div>}
          {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        </div>
        <div className="p6-confirm-actions">
          <button type="button" className="p6-confirm-cancel" onClick={() => void downloadPdf()} disabled={!!busy}>{busy === "pdf" ? <RefreshCw className="spin" size={16} /> : <Download size={16} />} Ver / baixar PDF</button>
          <button type="button" className="p6-confirm-ok" onClick={() => void send()} disabled={!!busy || !mail?.configured}>{busy === "send" ? <RefreshCw className="spin" size={16} /> : <Send size={16} />}{busy === "send" ? "Enviando..." : "Enviar por e-mail"}</button>
        </div>
      </div>
    </div>, document.body);
}
