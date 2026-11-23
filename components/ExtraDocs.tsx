"use client";
// V20 · Documentos avulsos do projeto (contrato, aditivo, termo de aceite...) enviados ao cliente
// para assinar na ZapSign. O PDF assinado volta sozinho e fica guardado aqui.
import { useState } from "react";
import { CheckCircle2, Copy, Download, Eye, FileCheck2, FilePlus2, FileSignature, PenLine, RefreshCw, Trash2, XCircle } from "lucide-react";
import type { Client, ExtraDoc, Project, Task } from "@/lib/types";
import SignedDocUpload from "./SignedDocUpload";
import type { SignTarget } from "./SignDialog";
import ConfirmDialog, { type ConfirmBox } from "./ConfirmDialog";

const ST: Record<string, string> = { new: "aguardando", "link-opened": "abriu o link", signed: "assinou", refused: "recusou" };
const fmtSize = (n?: number) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const dt = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "");

export default function ExtraDocs({ project: p, client, onRefresh, flash, onSign, canWrite = true, tasks = [] }: { tasks?: Task[]; project: Project; client?: Client; onRefresh: () => Promise<void> | void; flash: (m: string, err?: boolean) => void; onSign: (t: SignTarget) => void; canWrite?: boolean }) {
  const [busy, setBusy] = useState(""), [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null), [upload, setUpload] = useState(false); // V25
  const docs = p.extraDocs || [];
  const pending = docs.filter(d => d.sign && !d.signed && d.sign.status !== "refused").length;

  async function view(path: string, name: string, download = false) {
    const w = download ? null : window.open("about:blank", "_blank");
    try {
      const r = await fetch("/api/docs/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id, phase: "extra", path, name, download }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao abrir o documento.");
      if (w) w.location.href = j.url; else window.location.href = j.url;
    } catch (e) { w?.close(); flash(e instanceof Error ? e.message : "Falha ao abrir.", true); }
  }
  async function sync(d: ExtraDoc) {
    setBusy(d.id);
    try {
      const r = await fetch("/api/zapsign/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id, extraId: d.id }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao consultar a ZapSign.");
      await onRefresh(); flash(j.message || "Status atualizado");
    } catch (e) { flash(e instanceof Error ? e.message : "Falha ao consultar.", true); } finally { setBusy(""); }
  }
  function remove(d: ExtraDoc) {
    setConfirmBox({
      icon: "trash", title: "Remover este documento da lista?",
      message: d.sign && !d.signed ? "O pedido de assinatura continua aberto na ZapSign — cancele por lá se o cliente não deve mais assinar. O arquivo segue guardado por segurança." : "O documento sai da lista do projeto. O arquivo segue guardado por segurança.",
      details: [{ label: "Documento", value: d.title }, { label: "Situação", value: d.signed ? "Assinado" : d.sign ? (d.sign.status === "refused" ? "Recusado" : "Aguardando assinatura") : "Não enviado" }],
      confirmLabel: "Remover",
      onConfirm: async () => {
        const r = await fetch("/api/docs/extra", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id, id: d.id }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao remover.");
        await onRefresh(); flash("Documento removido");
      },
    });
  }

  return <section className="v7-box v20-extra">
    <h3><FileSignature size={15} /> Documentos avulsos e assinados <em>{docs.length ? `${docs.filter(d => d.signed).length}/${docs.length} assinados` : "nenhum"}</em></h3>
    <p className="v20-hint">Termos, atas, aceites e qualquer documento fora das fases: anexe o que o cliente já assinou (PDF ou foto do papel) ou envie um PDF para ele assinar pela ZapSign.{pending ? ` ${pending} aguardando assinatura.` : ""}</p>
    {canWrite && <div className="v25-new-row"><button type="button" className="v20-new v25-signed" onClick={() => setUpload(true)}><FileCheck2 size={17} /><span><b>Anexar documento já assinado</b><small>PDF, foto do papel assinado ou print · várias fotos viram um PDF</small></span></button><button type="button" className="v20-new" onClick={() => onSign({ kind: "extra", projectId: p.id, client })}><FilePlus2 size={17} /><span><b>Novo documento para assinar</b><small>Escolha o PDF, os signatários do cliente e envie pela ZapSign</small></span></button></div>}
    {docs.map(d => { const sg = d.sign, n = sg ? sg.signers.filter(x => x.status === "signed").length : 0;
      const manual = d.manual; const tk = manual?.taskId ? tasks.find(t => t.id === manual.taskId) : undefined;
      const state = d.signed ? "ok" : !sg ? "draft" : sg.status === "refused" ? "refused" : "pending";
      return <div key={d.id} className={`v20-doc s-${state}`}>
        <div className="v20-doc-head">
          <span className="v20-ico">{state === "ok" ? <CheckCircle2 size={18} /> : state === "refused" ? <XCircle size={18} /> : <PenLine size={18} />}</span>
          <div className="v20-txt"><strong>{d.title}</strong><small>{d.name}{d.size ? ` · ${fmtSize(d.size)}` : ""} · {dt(d.uploadedAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</small></div>
          <span className={`v20-badge s-${state}`}>{state === "ok" ? (manual ? "Assinado · anexado" : "Assinado") : state === "refused" ? "Recusado" : state === "pending" ? `Aguardando ${n}/${sg!.signers.length}` : "Não enviado"}</span>
        </div>
        {manual && <div className="v13-sign-panel done v25-manual"><CheckCircle2 size={14} /><span>{manual.signedAt ? `Assinado em ${manual.signedAt.split("-").reverse().join("/")}` : "Assinado"} · anexado por {manual.by || "—"} em {dt(manual.at)}{manual.pages ? ` · ${manual.pages} página(s)` : ""}{tk ? ` · atividade “${tk.title}”` : ""}{manual.note ? ` · ${manual.note}` : ""}</span></div>}
        {d.signed && sg && <div className="v13-sign-panel done"><CheckCircle2 size={14} /><span>Assinado via ZapSign{sg.completedAt ? ` em ${dt(sg.completedAt)}` : ""} por {sg.signers.filter(x => x.status === "signed").map(x => x.name).join(", ")}</span></div>}
        {sg && !d.signed && <ul className="v20-signers">{sg.signers.map((x, i) => <li key={i} className={`st-${x.status}`}><i />{x.name}{x.email ? <span>{x.email}</span> : null}<b>{ST[x.status] || x.status}{x.signedAt ? ` · ${dt(x.signedAt)}` : ""}</b>
          {x.signUrl && x.status !== "signed" && <button type="button" onClick={() => { void navigator.clipboard?.writeText(x.signUrl!); flash(`Link de assinatura de ${x.name.split(" ")[0]} copiado`); }} title="Copiar o link para enviar por outro canal"><Copy size={12} /> Copiar link</button>}</li>)}</ul>}
        <div className="v20-act">
          {d.signed ? <>
            <button type="button" className="v7-mini-btn primary" onClick={() => void view(d.signed!.path, d.signed!.name)}><Eye size={14} /> Ver assinado</button>
            <button type="button" className="v7-mini-btn" onClick={() => void view(d.signed!.path, d.signed!.name, true)}><Download size={14} /> Baixar</button>
          </> : <button type="button" className="v7-mini-btn" onClick={() => void view(d.path, d.name)}><Eye size={14} /> Ver PDF enviado</button>}
          {sg && !d.signed && <button type="button" className="v7-mini-btn zs" disabled={!!busy} onClick={() => void sync(d)}><RefreshCw size={14} className={busy === d.id ? "spin" : ""} /> Atualizar status</button>}
          {canWrite && !d.signed && (!sg || sg.status === "refused") && <button type="button" className="v7-mini-btn zs" onClick={() => onSign({ kind: "extra", projectId: p.id, client, doc: d })}><PenLine size={14} /> {sg ? "Reenviar" : "Enviar"}</button>}
          {canWrite && <button type="button" className="v7-mini-btn danger" onClick={() => remove(d)} aria-label={`Remover ${d.title}`}><Trash2 size={14} /></button>}
        </div>
      </div>; })}
    {confirmBox && <ConfirmDialog box={confirmBox} onClose={() => setConfirmBox(null)} />}
    {upload && <SignedDocUpload project={p} tasks={tasks} onClose={() => setUpload(false)} onDone={async m => { await onRefresh(); flash(m); }} />}
  </section>;
}
