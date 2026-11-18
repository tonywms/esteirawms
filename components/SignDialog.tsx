"use client";
// V13 · Enviar PDF para assinatura na ZapSign (documento da fase ou PDF de uma atividade).
// Os contatos vêm do cadastro do cliente (o recomendado já vem marcado); dá para incluir outras pessoas na hora.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare2, FileText, Info, PenLine, Plus, RefreshCw, Send, Square, Star, Trash2, Upload, X } from "lucide-react";
import type { Client, ClientSigner, TaskAttachment } from "@/lib/types";

export type SignTarget =
  | { kind: "phase"; projectId: string; phase: string; docLabel: string; client?: Client }
  | { kind: "task"; taskId: string; attachment: TaskAttachment };

type Person = { name: string; email: string; phone: string };
const blank: Person = { name: "", email: "", phone: "" };

export default function SignDialog({ target, onClose, onDone }: { target: SignTarget; onClose: () => void; onDone: (msg: string) => void | Promise<void> }) {
  const [contacts, setContacts] = useState<ClientSigner[]>(target.kind === "phase" ? target.client?.signers || [] : []);
  const [clientName, setClientName] = useState(target.kind === "phase" ? target.client?.name || "" : "");
  const [picked, setPicked] = useState<string[]>(() => (target.kind === "phase" ? (target.client?.signers || []).filter(s => s.primary).map(s => s.id) : []));
  const [extra, setExtra] = useState<Person[]>([]), [message, setMessage] = useState(""), [whatsapp, setWhatsapp] = useState(false);
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [pct, setPct] = useState(0), [error, setError] = useState("");
  const [cfg, setCfg] = useState<{ configured: boolean; sandbox: boolean } | null>(null), [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    fetch("/api/zapsign/send", { cache: "no-store" }).then(r => r.json()).then(setCfg).catch(() => setCfg({ configured: false, sandbox: false }));
    if (target.kind === "task") {
      (async () => {
        try {
          const tasks = await fetch("/api/records/tasks", { cache: "no-store" }).then(r => r.json()) as { id: string; clientId: string }[];
          const cid = tasks.find(t => t.id === target.taskId)?.clientId;
          const clients = await fetch("/api/records/clients", { cache: "no-store" }).then(r => r.json()) as Client[];
          const c = clients.find(x => x.id === cid);
          if (c) { setClientName(c.name); setContacts(c.signers || []); setPicked((c.signers || []).filter(s => s.primary).map(s => s.id)); }
        } catch { /* contatos opcionais */ }
      })();
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const people = (): Person[] => [...contacts.filter(c => picked.includes(c.id)).map(c => ({ name: c.name, email: c.email, phone: c.phone || "" })), ...extra.filter(p => p.name.trim())];
  const hasPhone = people().some(p => p.phone.replace(/\D/g, "").length >= 10);

  async function submit() {
    const signers = people();
    if (!signers.length) return setError("Escolha ao menos uma pessoa para assinar.");
    if (target.kind === "phase" && !file) return setError("Escolha o PDF que o cliente vai assinar.");
    setBusy(true); setError(""); setPct(0);
    try {
      let path = "", name = "";
      if (target.kind === "phase" && file) {
        if (file.size > 10 * 1048576) throw new Error("A ZapSign aceita PDF de até 10 MB.");
        const t = await fetch("/api/docs/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: target.projectId, phase: target.phase }) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao preparar o envio."); return j; });
        await new Promise<void>((ok, bad) => {
          const x = new XMLHttpRequest(); x.open("POST", t.uploadUrl);
          x.setRequestHeader("apikey", t.apikey); x.setRequestHeader("Authorization", `Bearer ${t.apikey}`); x.setRequestHeader("Content-Type", "application/pdf"); x.setRequestHeader("x-upsert", "false");
          x.upload.onprogress = e => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
          x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : bad(new Error(`Falha no envio do PDF (${x.status}).`))); x.onerror = () => bad(new Error("Falha de rede.")); x.send(file);
        });
        path = t.path; name = file.name;
      }
      const body = target.kind === "phase" ? { target: "phase", projectId: target.projectId, phase: target.phase, path, name, signers, message, whatsapp }
        : { target: "task", taskId: target.taskId, attachmentId: target.attachment.id, signers, message, whatsapp };
      const r = await fetch("/api/zapsign/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha no envio para a ZapSign.");
      await onDone(j.message || "Enviado para assinatura"); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no envio."); setBusy(false); }
  }

  if (!mounted) return null;
  const title = target.kind === "phase" ? target.docLabel : target.attachment.name;
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="p6-confirm v9-esc v13-sign" role="dialog" aria-modal="true" aria-labelledby="v13-sign-title">
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button>
        <header className="v9-esc-head">
          <span className="v9-esc-ico"><PenLine size={24} /></span>
          <div><small>Enviar para assinatura · ZapSign</small><h2 id="v13-sign-title">{title}</h2><p><FileText size={13} /> {clientName || "Cliente"}{cfg?.sandbox ? " · ambiente de TESTES (sem validade jurídica)" : ""}</p></div>
        </header>
        <div className="v9-esc-body">
          {target.kind === "phase" && <div className="v9-field"><span>PDF para assinar (até 10 MB)</span>
            <button type="button" className={`v11-toggle ${file ? "on" : ""}`} onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={16} /> {file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "Escolher PDF ainda sem assinatura"}</button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => setFile(e.target.files?.[0] || null)} /></div>}
          <div className="v9-field"><span>Quem assina pelo cliente</span>
            <div className="v9-people">{contacts.map(c => { const on = picked.includes(c.id); return <button type="button" key={c.id} className={on ? "on" : ""} disabled={busy} onClick={() => setPicked(v => (on ? v.filter(x => x !== c.id) : [...v, c.id]))}>
              {on ? <CheckSquare2 size={17} /> : <Square size={17} />}<div><strong>{c.name}</strong><small>{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</small></div>{c.primary && <em className="v13-rec"><Star size={10} fill="currentColor" /> recomendado</em>}</button>; })}
              {!contacts.length && <div className="v9-empty"><Info size={15} /> Este cliente ainda não tem contatos para assinatura. Cadastre em Clientes › editar, ou inclua abaixo.</div>}</div></div>
          {extra.map((p, i) => <div key={i} className="v13-extra">
            <input value={p.name} onChange={e => setExtra(x => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Nome" disabled={busy} />
            <input value={p.email} onChange={e => setExtra(x => x.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))} placeholder="e-mail" type="email" disabled={busy} />
            <input value={p.phone} onChange={e => setExtra(x => x.map((y, j) => (j === i ? { ...y, phone: e.target.value } : y)))} placeholder="Celular (DDD)" disabled={busy} />
            <button type="button" onClick={() => setExtra(x => x.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={15} /></button></div>)}
          <button type="button" className="v11-link" onClick={() => setExtra(x => [...x, { ...blank }])} disabled={busy}><Plus size={13} /> Incluir outra pessoa só neste envio</button>
          <label className="v9-field"><span>Mensagem para quem assina (opcional)</span><textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} disabled={busy} placeholder="Ex.: Segue o termo de homologação para assinatura. Qualquer dúvida, estamos à disposição." /></label>
          {hasPhone && <button type="button" className={`v11-toggle ${whatsapp ? "on" : ""}`} onClick={() => setWhatsapp(v => !v)} disabled={busy}>{whatsapp ? <CheckSquare2 size={16} /> : <Square size={16} />} Enviar também pelo WhatsApp (pode consumir créditos da ZapSign)</button>}
          {cfg && !cfg.configured && <div className="p6-confirm-warn"><Info size={15} /><span>A ZapSign ainda não foi configurada. Rode o instalador com -ConfigurarZapSign.</span></div>}
          {cfg?.configured && <div className="p6-confirm-note"><Info size={15} /><span>A ZapSign envia o pedido por e-mail. Quando todos assinarem, o PDF assinado entra sozinho no sistema{target.kind === "phase" ? " e libera o avanço da fase" : ""}.</span></div>}
          {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        </div>
        <div className="p6-confirm-actions">
          <button type="button" className="p6-confirm-cancel" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="p6-confirm-ok" onClick={() => void submit()} disabled={busy || !cfg?.configured}>{busy ? <RefreshCw className="spin" size={16} /> : <Send size={16} />}{busy ? (pct && pct < 100 ? `Enviando ${pct}%` : "Enviando...") : "Enviar para assinatura"}</button>
        </div>
      </div>
    </div>, document.body);
}
