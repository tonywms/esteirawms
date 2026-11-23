"use client";
// V25 · Anexar documento já assinado pelo cliente (PDF, fotos do papel assinado, prints).
// Várias fotos/PDFs viram um único PDF, guardado nos documentos avulsos do projeto.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, FileCheck2, FileText, ImageIcon, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import type { Project, Task } from "@/lib/types";
import { filesToPdf, okFile, uploadProjectPdf } from "@/lib/pdf-compose";
import { todayISO } from "@/lib/metrics";
import DateField from "./DateField";
import Select from "./Select";

const SUGGEST = ["Termo de aceite assinado", "Ata de reunião assinada", "Checklist de implantação assinado", "Aprovação do cliente", "Termo de homologação assinado"];
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function SignedDocUpload({ project, tasks, onClose, onDone }: { project: Project; tasks: Task[]; onClose: () => void; onDone: (msg: string) => void | Promise<void> }) {
  const [title, setTitle] = useState(""), [files, setFiles] = useState<File[]>([]), [signedAt, setSignedAt] = useState(todayISO());
  const [taskId, setTaskId] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(""), [pct, setPct] = useState(0), [error, setError] = useState(""), [mounted, setMounted] = useState(false), [drag, setDrag] = useState(false);
  const pick = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setMounted(true);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);
  function add(list: FileList | File[] | null) {
    const arr = Array.from(list || []); const bad = arr.filter(f => !okFile(f));
    if (bad.length) setError(`${bad.map(f => f.name).join(", ")}: envie PDF ou foto.`); else setError("");
    setFiles(f => [...f, ...arr.filter(okFile)].slice(0, 30));
  }
  const move = (i: number, d: number) => setFiles(f => { const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (title.trim().length < 3) return setError("Dê um nome ao documento (ex.: Termo de aceite assinado).");
    if (!files.length) return setError("Escolha o PDF ou tire/selecione as fotos do documento assinado.");
    setError("");
    try {
      setBusy(files.length > 1 || !/pdf/i.test(files[0].type + files[0].name) ? "Montando o PDF…" : "Preparando…");
      const pdf = await filesToPdf(files, title);
      setBusy("Enviando…"); setPct(0);
      const path = await uploadProjectPdf(project.id, "extra", pdf.blob, setPct);
      setBusy("Registrando…");
      const r = await fetch("/api/docs/extra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, title: title.trim(), path, name: pdf.name, size: pdf.blob.size, signedAt: signedAt || null, taskId: taskId || null, note, pages: pdf.pages || undefined }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao registrar o documento.");
      await onDone(`“${title.trim()}” anexado como assinado`);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao anexar."); setBusy(""); }
  }
  if (!mounted) return null;
  const openTasks = tasks.filter(t => t.projectId === project.id);
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="v25-up" role="dialog" aria-modal="true" aria-labelledby="v25-up-title" onSubmit={e => void submit(e)}>
        <header><span className="ico"><FileCheck2 size={20} /></span><div><h2 id="v25-up-title">Anexar documento já assinado</h2><p>PDF, foto do papel assinado ou print. Várias fotos viram um PDF só, na ordem abaixo.</p></div>
          <button type="button" className="p6-confirm-x" onClick={onClose} disabled={!!busy} aria-label="Fechar"><X size={17} /></button></header>
        <div className="body">
          <label className="fld"><span>Nome do documento</span><input value={title} onChange={e => setTitle(e.target.value)} disabled={!!busy} placeholder="Ex.: Termo de aceite assinado" autoFocus /></label>
          <div className="chips">{SUGGEST.map(s => <button key={s} type="button" onClick={() => setTitle(s)} disabled={!!busy}>{s}</button>)}</div>
          <div className={`drop ${drag ? "on" : ""}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
            <Upload size={22} /><b>Arraste aqui o PDF ou as fotos</b><small>ou</small>
            <div className="btns">
              <button type="button" className="btn outline" onClick={() => pick.current?.click()} disabled={!!busy}><Plus size={15} /> Escolher arquivos</button>
              <button type="button" className="btn outline" onClick={() => cam.current?.click()} disabled={!!busy}><Camera size={15} /> Tirar foto</button>
            </div>
            <input ref={pick} type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={e => { add(e.target.files); e.target.value = ""; }} />
            <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { add(e.target.files); e.target.value = ""; }} />
          </div>
          {files.length > 0 && <ol className="files">{files.map((f, i) => <li key={`${f.name}-${i}`}>
            <span className="k">{/pdf/i.test(f.type + f.name) ? <FileText size={16} /> : <ImageIcon size={16} />}</span><span className="n">{f.name}<small>{kb(f.size)}</small></span>
            {files.length > 1 && <span className="ord"><button type="button" onClick={() => move(i, -1)} disabled={!!busy || i === 0} aria-label="Subir">▲</button><button type="button" onClick={() => move(i, 1)} disabled={!!busy || i === files.length - 1} aria-label="Descer">▼</button></span>}
            <button type="button" className="rm" onClick={() => setFiles(x => x.filter((_, k) => k !== i))} disabled={!!busy} aria-label={`Remover ${f.name}`}><Trash2 size={14} /></button>
          </li>)}</ol>}
          <div className="grid">
            <label className="fld"><span>Assinado em</span><DateField value={signedAt} onChange={v => setSignedAt(v)} aria-label="Assinado em" /></label>
            <label className="fld"><span>Atividade relacionada (opcional)</span><Select value={taskId} onChange={e => setTaskId(e.target.value)} disabled={!!busy}><option value="">Nenhuma</option>{openTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></label>
          </div>
          <label className="fld"><span>Observação (opcional)</span><input value={note} onChange={e => setNote(e.target.value)} disabled={!!busy} placeholder="Ex.: assinado na visita por Gabriel (gerente de operações)" /></label>
          {busy && <div className="v7-upload"><span>{busy}{busy.startsWith("Enviando") ? ` ${pct}%` : ""}</span><i><b style={{ width: `${busy.startsWith("Enviando") ? pct : 35}%` }} /></i></div>}
          {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        </div>
        <footer>
          <button type="button" className="btn outline" onClick={onClose} disabled={!!busy}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={!!busy}>{busy ? <RefreshCw className="spin" size={15} /> : <FileCheck2 size={15} />} Anexar como assinado</button>
        </footer>
      </form>
    </div>, document.body);
}
