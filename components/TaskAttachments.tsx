"use client";
// V12 · Fotos e PDFs da atividade (dentro do modal "Editar atividade").
// Fotos são reduzidas no navegador (até 1600 px, JPEG) antes de subir; tudo vai direto ao armazenamento privado.
// Os anexos aparecem no status report do cliente: fotos dentro do PDF, PDFs como anexos.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock3, Eye, FileText, ImagePlus, Paperclip, PenLine, RefreshCw, Trash2, X } from "lucide-react";
import SignDialog from "./SignDialog";
import type { TaskAttachment } from "@/lib/types";
import ConfirmDialog, { type ConfirmBox } from "./ConfirmDialog";
import { friendly } from "@/lib/friendly";
import { attachCall, checkFile, fileKind, setPending, uploadTaskFile } from "@/lib/task-uploads";

const call = attachCall;

export default function TaskAttachments({ taskId, initial }: { taskId: string; initial?: TaskAttachment[] }) {
  const [items, setItems] = useState<TaskAttachment[]>(initial || []), [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(""), [pct, setPct] = useState(0), [msg, setMsg] = useState(""), [err, setErr] = useState(false), [confirm, setConfirm] = useState<ConfirmBox | null>(null), [signAtt, setSignAtt] = useState<TaskAttachment | null>(null);
  const input = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>(() => { if (!taskId) setPending([]); return []; });
  const setQueueFiles = (files: File[]) => { setQueue(files); setPending(files); };
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => { const urls = queue.map(f => (fileKind(f) === "image" ? URL.createObjectURL(f) : "")); setPreviews(urls); return () => urls.forEach(u => u && URL.revokeObjectURL(u)); }, [queue]);
  const flash = (m: string, e = false) => { setMsg(e ? friendly(m) : m); setErr(e); window.setTimeout(() => setMsg(""), 4500); };

  const loadThumbs = useCallback(async (list: TaskAttachment[]) => {
    const imgs = list.filter(a => a.type === "image" && !thumbs[a.id]);
    const got = await Promise.all(imgs.map(a => call({ action: "view", taskId, id: a.id }).then(j => [a.id, j.url as string] as const).catch(() => null)));
    const add = Object.fromEntries(got.filter(Boolean) as [string, string][]);
    if (Object.keys(add).length) setThumbs(t => ({ ...t, ...add }));
  }, [taskId, thumbs]);
  useEffect(() => { void loadThumbs(items); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const bad = checkFile(f); if (bad) { flash(bad, true); continue; }
      setBusy("up"); setPct(0);
      try { setItems(await uploadTaskFile(taskId, f, setPct)); flash(`${fileKind(f) === "image" ? "Foto" : "PDF"} anexado`); }
      catch (e) { flash(e instanceof Error ? e.message : "Falha no anexo.", true); }
      finally { setBusy(""); }
    }
    if (input.current) input.current.value = "";
  }
  async function reload() {
    try { const tasks = await fetch("/api/records/tasks", { cache: "no-store" }).then(r => r.json()) as { id: string; attachments?: TaskAttachment[] }[]; const t = tasks.find(x => x.id === taskId); if (t) setItems(t.attachments || []); } catch { /* mantém a lista */ }
  }
  async function syncSign(a: TaskAttachment) {
    setBusy("sync");
    try { const r = await fetch("/api/zapsign/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, attachmentId: a.id }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao consultar a ZapSign."); await reload(); flash(j.message || "Status atualizado"); }
    catch (e) { flash(e instanceof Error ? e.message : "Falha ao consultar a ZapSign.", true); } finally { setBusy(""); }
  }
  async function view(a: TaskAttachment) {
    const w = window.open("about:blank", "_blank");
    try { const j = await call({ action: "view", taskId, id: a.id }); if (w) w.location.href = j.url; } catch (e) { w?.close(); flash(e instanceof Error ? e.message : "Falha ao abrir.", true); }
  }
  function remove(a: TaskAttachment) {
    setConfirm({ icon: "trash", title: "Remover este anexo?", message: "O arquivo deixa de aparecer na atividade e nos próximos status reports. A remoção fica registrada na linha do tempo.",
      details: [{ label: "Arquivo", value: a.name }, { label: "Anexado em", value: new Date(a.uploadedAt).toLocaleString("pt-BR") }], confirmLabel: "Sim, remover anexo", cancelLabel: "Manter",
      onConfirm: async () => { const j = await call({ action: "remove", taskId, id: a.id }); setItems(j.attachments || []); flash("Anexo removido"); } } as ConfirmBox);
  }

  if (!taskId) return <div className="v12-att span2">
    <div className="v12-att-head"><Paperclip size={14} /> Fotos e documentos <em>{queue.length}</em><small>Os arquivos sobem assim que você clicar em Cadastrar. Vão no status report do cliente.</small></div>
    <div className="v12-att-grid">
      {queue.map((f, i) => <div key={`${f.name}-${i}`} className={`v12-att-item ${fileKind(f)} pending`}>
        {fileKind(f) === "image" ? <div className="v12-thumb" style={previews[i] ? { backgroundImage: `url("${previews[i]}")` } : undefined} /> : <div className="v12-thumb pdf"><FileText size={22} /><span>PDF</span></div>}
        <div className="v12-att-meta"><strong title={f.name}>{f.name}</strong><small><Clock3 size={10} /> envia ao cadastrar</small></div>
        <div className="v12-att-act"><button type="button" className="danger" onClick={() => setQueueFiles(queue.filter((_, j) => j !== i))} title="Tirar da lista"><X size={14} /></button></div>
      </div>)}
      <button type="button" className="v12-add" onClick={() => input.current?.click()}><ImagePlus size={20} /><span>Anexar foto ou PDF</span></button>
      <button type="button" className="v12-add v16-cam" onClick={() => cam.current?.click()}><Camera size={20} /><span>Tirar foto</span></button>
    </div>
    <input ref={input} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={e => { const ok: File[] = []; for (const f of Array.from(e.target.files || [])) { const bad = checkFile(f); if (bad) flash(bad, true); else ok.push(f); } setQueueFiles([...queue, ...ok].slice(0, 15)); if (input.current) input.current.value = ""; }} />
    <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setQueueFiles([...queue, f].slice(0, 15)); if (cam.current) cam.current.value = ""; }} />
    {msg && <div className={`v12-att-msg ${err ? "err" : ""}`}>{msg}</div>}
  </div>;
  return <div className="v12-att span2">
    <div className="v12-att-head"><Paperclip size={14} /> Fotos e documentos <em>{items.length}</em><small>Vão no status report do cliente: fotos dentro do PDF, PDFs como anexo.</small></div>
    <div className="v12-att-grid">
      {items.map(a => <div key={a.id} className={`v12-att-item ${a.type}`}>
        {a.type === "image" ? <button type="button" className="v12-thumb" onClick={() => void view(a)} style={thumbs[a.id] ? { backgroundImage: `url("${thumbs[a.id]}")` } : undefined} aria-label={`Abrir ${a.name}`}>{!thumbs[a.id] && <Camera size={18} />}</button>
          : <button type="button" className="v12-thumb pdf" onClick={() => void view(a)} aria-label={`Abrir ${a.name}`}><FileText size={22} /><span>PDF</span></button>}
        <div className="v12-att-meta"><strong title={a.name}>{a.name}</strong><small>{new Date(a.uploadedAt).toLocaleDateString("pt-BR")}{a.uploadedBy ? ` · ${a.uploadedBy}` : ""}</small>
          {a.signedFrom && <em className="v13-zs s-signed"><CheckCircle2 size={11} /> assinado na ZapSign</em>}
          {a.sign && <em className={`v13-zs s-${a.sign.status}`}><PenLine size={11} /> {a.sign.status === "signed" ? "assinado" : a.sign.status === "refused" ? "recusado" : `${a.sign.signers.filter(x => x.status === "signed").length}/${a.sign.signers.length} assinaram`}</em>}
          {a.type === "pdf" && !a.signedFrom && (a.sign?.status === "pending" ? <button type="button" className="v13-att-sign" onClick={() => void syncSign(a)} disabled={!!busy}><RefreshCw size={12} /> Atualizar</button> : a.sign?.status !== "signed" && <button type="button" className="v13-att-sign" onClick={() => setSignAtt(a)} disabled={!!busy}><PenLine size={12} /> Assinar (ZapSign)</button>)}</div>
        <div className="v12-att-act"><button type="button" onClick={() => void view(a)} title="Abrir"><Eye size={14} /></button><button type="button" className="danger" onClick={() => remove(a)} title="Remover"><Trash2 size={14} /></button></div>
      </div>)}
      <button type="button" className="v12-add" onClick={() => input.current?.click()} disabled={!!busy}>{busy ? <><RefreshCw className="spin" size={18} /><span>{pct}%</span></> : <><ImagePlus size={20} /><span>Anexar foto ou PDF</span></>}</button>
      <button type="button" className="v12-add v16-cam" onClick={() => cam.current?.click()} disabled={!!busy}><Camera size={20} /><span>Tirar foto</span></button>
    </div>
    <input ref={input} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={e => void upload(e.target.files)} />
    <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { void upload(e.target.files); if (cam.current) cam.current.value = ""; }} />
    {msg && <div className={`v12-att-msg ${err ? "err" : ""}`}>{msg}</div>}
    {confirm && <ConfirmDialog box={confirm} onClose={() => setConfirm(null)} />}
    {signAtt && <SignDialog target={{ kind: "task", taskId, attachment: signAtt }} onClose={() => setSignAtt(null)} onDone={async msg => { await reload(); flash(msg); }} />}
  </div>;
}
