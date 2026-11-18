"use client";
// V11 · Status report para o cliente: mensagem, período, tipos de registro, revisão item a item,
// PDFs assinados como anexos, baixar ou enviar por e-mail (fica registrado na linha do tempo).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare2, Download, FileText, Info, Paperclip, RefreshCw, Send, Square, X } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { DEFAULT_REPORT_KINDS, REPORT_KINDS, clientText, reportEvents } from "@/lib/status-report";
import { PHASES } from "@/lib/flow";

export default function ReportDialog({ data, project, client, onClose, onDone }: { data: State; project: Project; client: string; onClose: () => void; onDone: (msg: string) => void | Promise<void> }) {
  const [summary, setSummary] = useState(""), [kinds, setKinds] = useState<string[]>(DEFAULT_REPORT_KINDS), [since, setSince] = useState("");
  const [exclude, setExclude] = useState<string[]>([]), [annex, setAnnex] = useState(true), [to, setTo] = useState(""), [cc, setCc] = useState("");
  const [busy, setBusy] = useState<"" | "pdf" | "send">(""), [error, setError] = useState(""), [mounted, setMounted] = useState(false), [review, setReview] = useState(false);
  const [mail, setMail] = useState<{ configured: boolean; from: string | null } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const events = useMemo(() => reportEvents(project, { kinds, since: since || null }), [project, kinds, since]);
  const included = events.filter(e => !exclude.includes(e.id));
  const signed = PHASES.filter(ph => ph.doc && project.phases?.[ph.key]?.doc);
  useEffect(() => {
    setMounted(true); fetch("/api/escalate", { cache: "no-store" }).then(r => r.json()).then(setMail).catch(() => setMail({ configured: false, from: null }));
    const t = window.setTimeout(() => ref.current?.focus(), 40);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc); return () => { window.clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  const payload = (mode: "pdf" | "send") => JSON.stringify({ projectId: project.id, mode, summary, kinds, since: since || null, exclude, annex, to, cc });

  async function download() {
    setBusy("pdf"); setError("");
    const w = window.open("about:blank", "_blank");
    try {
      const r = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload("pdf") });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha ao gerar o relatório.");
      const base = Uint8Array.from(atob(j.pdf), c => c.charCodeAt(0));
      const files = await Promise.all((j.annexes as (string | null)[]).map(async u => { if (!u) return null; try { const x = await fetch(u); return x.ok ? new Uint8Array(await x.arrayBuffer()) : null; } catch { return null; } }));
      const { assembleReport } = await import("@/lib/status-report");
      const out = await assembleReport(base, files.length, files, j.footer);
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }));
      if (w) w.location.href = url; else { const a = document.createElement("a"); a.href = url; a.download = j.filename; a.click(); }
      window.setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) { w?.close(); setError(e instanceof Error ? e.message : "Falha ao gerar o relatório."); }
    finally { setBusy(""); }
  }
  async function send() {
    if (!to.trim()) return setError("Informe o e-mail do cliente.");
    setBusy("send"); setError("");
    try {
      const r = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload("send") });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha no envio.");
      await onDone(j.message || "Status report enviado"); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no envio."); setBusy(""); }
  }
  if (!mounted) return null;
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="p6-confirm v9-esc v11-report" role="dialog" aria-modal="true" aria-labelledby="v11-rep-title">
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={!!busy} aria-label="Fechar"><X size={17} /></button>
        <header className="v9-esc-head">
          <span className="v9-esc-ico"><FileText size={24} /></span>
          <div><small>Status report para o cliente</small><h2 id="v11-rep-title">{client}</h2><p><Paperclip size={13} /> {signed.length} documento(s) assinado(s) · {included.length} registro(s) no histórico</p></div>
        </header>
        <div className="v9-esc-body">
          <label className="v9-field"><span>Mensagem ao cliente (abre o relatório e o e-mail)</span>
            <textarea ref={ref} rows={3} value={summary} onChange={e => setSummary(e.target.value)} disabled={!!busy} placeholder="Ex.: Concluímos a integração e a homologação. Na próxima semana iniciamos a implantação no CD. Precisamos da assinatura do termo de homologação." /></label>
          <div className="v9-field"><span>O que entra no histórico</span>
            <div className="v11-kinds">{REPORT_KINDS.map(k => { const on = kinds.includes(k.key); return <button type="button" key={k.key} className={on ? "on" : ""} disabled={!!busy} onClick={() => setKinds(v => (on ? v.filter(x => x !== k.key) : [...v, k.key]))}>{on ? <CheckSquare2 size={15} /> : <Square size={15} />}{k.label}</button>; })}</div>
            <small className="v11-hint">Escalonamentos e liberações master nunca vão para o cliente. Notas internas ficam de fora por padrão.</small></div>
          <div className="v9-esc-row">
            <label className="v9-field"><span>Histórico a partir de</span><input type="date" value={since} onChange={e => setSince(e.target.value)} disabled={!!busy} /></label>
            <div className="v9-field"><span>Documentos assinados</span>
              <button type="button" className={`v11-toggle ${annex ? "on" : ""}`} onClick={() => setAnnex(v => !v)} disabled={!!busy}>{annex ? <CheckSquare2 size={16} /> : <Square size={16} />} Anexar PDFs assinados ({signed.length})</button></div>
          </div>
          <div className="v9-field"><span>Revisar registros ({included.length} de {events.length}) <button type="button" className="v11-link" onClick={() => setReview(v => !v)}>{review ? "ocultar" : "revisar item a item"}</button></span>
            {review && <div className="v11-events">{events.map(e => { const on = !exclude.includes(e.id); return <button type="button" key={e.id} className={on ? "on" : ""} onClick={() => setExclude(x => (on ? [...x, e.id] : x.filter(i => i !== e.id)))}>{on ? <CheckSquare2 size={15} /> : <Square size={15} />}<time>{new Date(e.at).toLocaleDateString("pt-BR")}</time><span>{clientText(e.text)}</span></button>; })}
              {!events.length && <div className="v9-empty"><Info size={15} /> Nenhum registro com os filtros escolhidos.</div>}</div>}</div>
          <div className="v9-esc-row">
            <label className="v9-field"><span>E-mail do cliente</span><input value={to} onChange={e => setTo(e.target.value)} disabled={!!busy} placeholder="ti@cliente.com.br, gerente@cliente.com.br" /></label>
            <label className="v9-field"><span>Cópia interna (opcional)</span><input value={cc} onChange={e => setCc(e.target.value)} disabled={!!busy} placeholder="comercial@wmsexpert.com.br" /></label>
          </div>
          {mail && !mail.configured && <div className="p6-confirm-warn"><Info size={15} /><span>O envio por e-mail ainda não foi configurado. Baixe o PDF e envie pelo seu e-mail.</span></div>}
          {mail?.configured && <div className="p6-confirm-note"><Info size={15} /><span>Sai por {mail.from}; as respostas do cliente vão para o seu e-mail. Confira o PDF antes de enviar.</span></div>}
          {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        </div>
        <div className="p6-confirm-actions">
          <button type="button" className="p6-confirm-cancel" onClick={() => void download()} disabled={!!busy}>{busy === "pdf" ? <RefreshCw className="spin" size={16} /> : <Download size={16} />} Ver / baixar PDF</button>
          <button type="button" className="p6-confirm-ok" onClick={() => void send()} disabled={!!busy || !mail?.configured}>{busy === "send" ? <RefreshCw className="spin" size={16} /> : <Send size={16} />}{busy === "send" ? "Enviando..." : "Enviar ao cliente"}</button>
        </div>
      </div>
    </div>, document.body);
}
