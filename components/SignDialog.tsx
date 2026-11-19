"use client";
import { friendly } from "@/lib/friendly";
// V13 · Enviar PDF para assinatura na ZapSign (documento da fase ou PDF de uma atividade).
// Os contatos vêm do cadastro do cliente (o recomendado já vem marcado); dá para incluir outras pessoas na hora.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckSquare2, Cloud, FileText, Info, PenLine, Plus, RefreshCw, Search, Send, Square, Star, Trash2, Upload, UserRound, X } from "lucide-react";
import { dupText, findDup, fmtPhone, newSignerId, normEmail, normPhone, type ZsPerson } from "@/lib/contacts";
import type { Client, ClientSigner, ExtraDoc, TaskAttachment } from "@/lib/types";

export type SignTarget =
  | { kind: "phase"; projectId: string; phase: string; docLabel: string; client?: Client }
  | { kind: "task"; taskId: string; attachment: TaskAttachment }
  | { kind: "extra"; projectId: string; client?: Client; doc?: ExtraDoc }; // V20 · documento avulso (novo ou reenvio)

type Person = { name: string; email: string; phone: string; save?: boolean };
const blank: Person = { name: "", email: "", phone: "", save: true };
type Hit = { key: string; name: string; email: string; phone: string; src: "contato" | "cliente" | "zapsign"; where: string; signerId?: string };

export default function SignDialog({ target, onClose, onDone }: { target: SignTarget; onClose: () => void; onDone: (msg: string) => void | Promise<void> }) {
  const cl = target.kind === "phase" || target.kind === "extra" ? target.client : undefined;
  const needsFile = target.kind === "phase" || (target.kind === "extra" && !target.doc);
  const [contacts, setContacts] = useState<ClientSigner[]>(cl?.signers || []);
  const [clientName, setClientName] = useState(cl?.name || "");
  const [picked, setPicked] = useState<string[]>(() => (cl?.signers || []).filter(s => s.primary).map(s => s.id));
  const [docTitle, setDocTitle] = useState(target.kind === "extra" ? target.doc?.title || "" : "");
  // V21 · busca de contatos (este cliente, outros clientes e ZapSign), aviso de duplicado e "salvar no cadastro"
  const [clientId, setClientId] = useState(cl?.id || ""), [allClients, setAllClients] = useState<Client[] | null>(null), [zsList, setZsList] = useState<ZsPerson[] | null>(null);
  const [q, setQ] = useState(""), [searchOpen, setSearchOpen] = useState(false);
  function loadDirectory() {
    if (allClients === null) fetch("/api/records/clients", { cache: "no-store" }).then(r => (r.ok ? r.json() : [])).then(setAllClients).catch(() => setAllClients([]));
    if (zsList === null) fetch("/api/zapsign/contacts", { cache: "no-store" }).then(r => r.json()).then(j => setZsList(j.people || [])).catch(() => setZsList([]));
  }
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
          if (c) { setClientId(c.id); setClientName(c.name); setContacts(c.signers || []); setPicked((c.signers || []).filter(s => s.primary).map(s => s.id)); }
        } catch { /* contatos opcionais */ }
      })();
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = (): Client[] => { const base = (allClients || []).filter(c => c.id !== clientId); return [...base, { id: clientId || "_atual", name: clientName || "este cliente", system: "", notes: "", createdAt: "", updatedAt: "", signers: contacts }]; };
  const hits = (): Hit[] => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const m = (x: { name: string; email?: string; phone?: string }) => `${x.name} ${x.email || ""} ${x.phone || ""} ${normPhone(x.phone)}`.toLowerCase().includes(t);
    const out: Hit[] = [], seen = new Set<string>();
    const push = (h: Hit) => { const k = normEmail(h.email) || normPhone(h.phone) || h.name.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push(h); };
    contacts.filter(m).forEach(c => push({ key: `c:${c.id}`, name: c.name, email: c.email, phone: c.phone || "", src: "contato", where: clientName || "este cliente", signerId: c.id }));
    (allClients || []).filter(c => c.id !== clientId).forEach(c => (c.signers || []).filter(m).forEach(s => push({ key: `o:${c.id}:${s.id}`, name: s.name, email: s.email, phone: s.phone || "", src: "cliente", where: c.name })));
    (zsList || []).filter(m).forEach(z => push({ key: `z:${z.email || z.phone || z.name}`, name: z.name, email: z.email, phone: z.phone, src: "zapsign", where: `ZapSign · ${z.docs} doc.` }));
    return out.slice(0, 8);
  };
  function pickHit(h: Hit) {
    if (h.src === "contato" && h.signerId) setPicked(v => (v.includes(h.signerId!) ? v : [...v, h.signerId!]));
    else setExtra(x => (x.some(y => (normEmail(y.email) && normEmail(y.email) === normEmail(h.email)) || (normPhone(y.phone) && normPhone(y.phone) === normPhone(h.phone))) ? x : [...x, { name: h.name, email: h.email, phone: h.phone, save: true }]));
    setQ(""); setSearchOpen(false);
  }
  async function saveExtras() {
    const toSave = extra.filter(p => p.save && p.name.trim() && (normEmail(p.email) || normPhone(p.phone)));
    if (!toSave.length || !clientId) return 0;
    const fresh = await fetch("/api/records/clients", { cache: "no-store" }).then(r => r.json()).catch(() => []) as Client[];
    const c = fresh.find(x => x.id === clientId); if (!c) return 0;
    const list = [...(c.signers || [])]; let n = 0;
    for (const p of toSave) {
      if (findDup([{ ...c, signers: list }], p)) continue;
      list.push({ id: newSignerId(), name: p.name.trim(), email: normEmail(p.email), phone: p.phone.trim(), role: "", primary: !list.length }); n++;
    }
    if (n) await fetch(`/api/records/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signers: list }) });
    return n;
  }
  const people = (): Person[] => [...contacts.filter(c => picked.includes(c.id)).map(c => ({ name: c.name, email: c.email, phone: c.phone || "" })), ...extra.filter(p => p.name.trim())];
  const hasPhone = people().some(p => p.phone.replace(/\D/g, "").length >= 10);

  async function submit() {
    const signers = people();
    if (!signers.length) return setError("Escolha ao menos uma pessoa para assinar.");
    if (needsFile && !file) return setError("Escolha o PDF que o cliente vai assinar.");
    if (target.kind === "extra" && !target.doc && !docTitle.trim()) return setError("Dê um nome ao documento (ex.: Contrato de prestação de serviços).");
    setBusy(true); setError(""); setPct(0);
    try {
      let path = "", name = "";
      if (needsFile && file && (target.kind === "phase" || target.kind === "extra")) {
        if (file.size > 10 * 1048576) throw new Error("A ZapSign aceita PDF de até 10 MB.");
        const t = await fetch("/api/docs/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: target.projectId, phase: target.kind === "phase" ? target.phase : "extra" }) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao preparar o envio."); return j; });
        await new Promise<void>((ok, bad) => {
          const x = new XMLHttpRequest(); x.open("POST", t.uploadUrl);
          x.setRequestHeader("apikey", t.apikey); x.setRequestHeader("Authorization", `Bearer ${t.apikey}`); x.setRequestHeader("Content-Type", "application/pdf"); x.setRequestHeader("x-upsert", "false");
          x.upload.onprogress = e => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
          x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : bad(new Error(`Falha no envio do PDF (${x.status}).`))); x.onerror = () => bad(new Error("Falha de rede.")); x.send(file);
        });
        path = t.path; name = file.name;
      }
      const body = target.kind === "phase" ? { target: "phase", projectId: target.projectId, phase: target.phase, path, name, signers, message, whatsapp }
        : target.kind === "extra" ? { target: "extra", projectId: target.projectId, extraId: target.doc?.id, title: docTitle.trim(), path, name, size: file?.size, signers, message, whatsapp }
        : { target: "task", taskId: target.taskId, attachmentId: target.attachment.id, signers, message, whatsapp };
      const r = await fetch("/api/zapsign/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha no envio para a ZapSign.");
      let saved = 0; try { saved = await saveExtras(); } catch { /* o envio já foi feito; salvar contato é opcional */ }
      await onDone(`${j.message || "Enviado para assinatura"}${saved ? ` · ${saved} contato${saved > 1 ? "s" : ""} salvo${saved > 1 ? "s" : ""} no cliente` : ""}`); onClose();
    } catch (e) { setError(friendly(e instanceof Error ? e.message : "Falha no envio.")); setBusy(false); }
  }

  if (!mounted) return null;
  const title = target.kind === "phase" ? target.docLabel : target.kind === "extra" ? (target.doc ? `Reenviar · ${target.doc.title}` : "Documento avulso para o cliente assinar") : target.attachment.name;
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="p6-confirm v9-esc v13-sign" role="dialog" aria-modal="true" aria-labelledby="v13-sign-title">
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button>
        <header className="v9-esc-head">
          <span className="v9-esc-ico"><PenLine size={24} /></span>
          <div><small>Enviar para assinatura · ZapSign</small><h2 id="v13-sign-title">{title}</h2><p><FileText size={13} /> {clientName || "Cliente"}{cfg?.sandbox ? " · ambiente de TESTES (sem validade jurídica)" : ""}</p></div>
        </header>
        <div className="v9-esc-body">
          {target.kind === "extra" && !target.doc && <label className="v9-field"><span>Nome do documento</span><input value={docTitle} onChange={e => setDocTitle(e.target.value)} disabled={busy} maxLength={120} placeholder="Ex.: Contrato de prestação de serviços, Aditivo, Termo de aceite" /></label>}
          {needsFile && <div className="v9-field"><span>PDF para assinar (até 10 MB)</span>
            <button type="button" className={`v11-toggle ${file ? "on" : ""}`} onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={16} /> {file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "Escolher PDF ainda sem assinatura"}</button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && target.kind === "extra" && !docTitle.trim()) setDocTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim()); }} /></div>}
          <div className="v9-field v21-find"><span>Buscar pessoa (contatos, outros clientes e ZapSign)</span>
            <label className="v21-search"><Search size={15} /><input value={q} onFocus={() => { loadDirectory(); setSearchOpen(true); }} onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)} onChange={e => { setQ(e.target.value); setSearchOpen(true); }} placeholder="Digite nome, e-mail ou celular" disabled={busy} /></label>
            {searchOpen && q.trim().length >= 2 && <div className="v21-hits">{hits().length ? hits().map(h => <button type="button" key={h.key} onMouseDown={e => e.preventDefault()} onClick={() => pickHit(h)}>
                {h.src === "zapsign" ? <Cloud size={15} /> : <UserRound size={15} />}<span><b>{h.name}</b><small>{[h.email, fmtPhone(h.phone)].filter(Boolean).join(" · ")}</small></span><em className={`src-${h.src}`}>{h.src === "contato" ? "deste cliente" : h.where}</em></button>)
              : <div className="v21-nohit">{allClients === null || zsList === null ? <><RefreshCw size={13} className="spin" /> Procurando…</> : <>Ninguém encontrado. Use “Incluir outra pessoa” abaixo.</>}</div>}</div>}
          </div>
          <div className="v9-field"><span>Quem assina pelo cliente</span>
            <div className="v9-people">{contacts.map(c => { const on = picked.includes(c.id); return <button type="button" key={c.id} className={on ? "on" : ""} disabled={busy} onClick={() => setPicked(v => (on ? v.filter(x => x !== c.id) : [...v, c.id]))}>
              {on ? <CheckSquare2 size={17} /> : <Square size={17} />}<div><strong>{c.name}</strong><small>{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</small></div>{c.primary && <em className="v13-rec"><Star size={10} fill="currentColor" /> recomendado</em>}</button>; })}
              {!contacts.length && <div className="v9-empty"><Info size={15} /> Este cliente ainda não tem contatos para assinatura. Cadastre em Clientes › editar, ou inclua abaixo.</div>}</div></div>
          {extra.map((p, i) => { const d = (p.email || p.phone) ? findDup(pool(), p) : null, here = !!d && d.clientId === (clientId || "_atual");
            return <div key={i} className="v21-extra-wrap"><div className="v13-extra">
            <input value={p.name} onChange={e => setExtra(x => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Nome" disabled={busy} />
            <input value={p.email} onChange={e => setExtra(x => x.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))} placeholder="e-mail" type="email" disabled={busy} />
            <input value={p.phone} onChange={e => setExtra(x => x.map((y, j) => (j === i ? { ...y, phone: e.target.value } : y)))} placeholder="Celular (DDD)" disabled={busy} />
            <button type="button" onClick={() => setExtra(x => x.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={15} /></button></div>
            {d && <div className="v21-dup-msg"><AlertTriangle size={13} /> {dupText(d, clientId || "_atual")}{here ? " — marque-o na lista acima em vez de incluir de novo." : ""}</div>}
            {clientId && !here && <button type="button" className={`v21-save ${p.save ? "on" : ""}`} onClick={() => setExtra(x => x.map((y, j) => (j === i ? { ...y, save: !y.save } : y)))} disabled={busy}>{p.save ? <CheckSquare2 size={14} /> : <Square size={14} />} Salvar no cadastro de {clientName || "cliente"} para os próximos envios</button>}
          </div>; })}
          <button type="button" className="v11-link" onClick={() => setExtra(x => [...x, { ...blank }])} disabled={busy}><Plus size={13} /> Incluir outra pessoa</button>
          <label className="v9-field"><span>Mensagem para quem assina (opcional)</span><textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} disabled={busy} placeholder="Ex.: Segue o termo de homologação para assinatura. Qualquer dúvida, estamos à disposição." /></label>
          {hasPhone && <button type="button" className={`v11-toggle ${whatsapp ? "on" : ""}`} onClick={() => setWhatsapp(v => !v)} disabled={busy}>{whatsapp ? <CheckSquare2 size={16} /> : <Square size={16} />} Enviar também pelo WhatsApp (pode consumir créditos da ZapSign)</button>}
          {cfg && !cfg.configured && <div className="p6-confirm-warn"><Info size={15} /><span>A ZapSign ainda não foi configurada. Rode o instalador com -ConfigurarZapSign.</span></div>}
          {cfg?.configured && <div className="p6-confirm-note"><Info size={15} /><span>A ZapSign envia o pedido por e-mail. Quando todos assinarem, o PDF assinado entra sozinho no sistema{target.kind === "phase" ? " e libera o avanço da fase" : target.kind === "extra" ? ", em Documentos avulsos deste projeto" : ""}.</span></div>}
          {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        </div>
        <div className="p6-confirm-actions">
          <button type="button" className="p6-confirm-cancel" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="p6-confirm-ok" onClick={() => void submit()} disabled={busy || !cfg?.configured}>{busy ? <RefreshCw className="spin" size={16} /> : <Send size={16} />}{busy ? (pct && pct < 100 ? `Enviando ${pct}%` : "Enviando...") : "Enviar para assinatura"}</button>
        </div>
      </div>
    </div>, document.body);
}
