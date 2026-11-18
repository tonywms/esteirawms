"use client";
// V12 · Fotos e PDFs da atividade (dentro do modal "Editar atividade").
// Fotos são reduzidas no navegador (até 1600 px, JPEG) antes de subir; tudo vai direto ao armazenamento privado.
// Os anexos aparecem no status report do cliente: fotos dentro do PDF, PDFs como anexos.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Eye, FileText, ImagePlus, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import type { TaskAttachment } from "@/lib/types";
import ConfirmDialog, { type ConfirmBox } from "./ConfirmDialog";

const call = async (body: Record<string, unknown>) => {
  const r = await fetch("/api/tasks/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha no anexo.");
  return j;
};

async function shrinkImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("Imagem inválida.")); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error("Falha ao converter a foto."))), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}

export default function TaskAttachments({ taskId, initial }: { taskId: string; initial?: TaskAttachment[] }) {
  const [items, setItems] = useState<TaskAttachment[]>(initial || []), [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(""), [pct, setPct] = useState(0), [msg, setMsg] = useState(""), [err, setErr] = useState(false), [confirm, setConfirm] = useState<ConfirmBox | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const flash = (m: string, e = false) => { setMsg(m); setErr(e); window.setTimeout(() => setMsg(""), 4500); };

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
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name), isImg = f.type.startsWith("image/");
      if (!isPdf && !isImg) { flash(`${f.name}: envie foto ou PDF.`, true); continue; }
      if (isPdf && f.size > 25 * 1048576) { flash(`${f.name}: PDF acima de 25 MB.`, true); continue; }
      setBusy("up"); setPct(0);
      try {
        const body: Blob = isImg ? await shrinkImage(f) : f;
        const ext = isImg ? "jpg" : "pdf", name = isImg ? f.name.replace(/\.[^.]+$/, "") + ".jpg" : f.name;
        const t = await call({ action: "ticket", taskId, ext });
        await new Promise<void>((ok, bad) => {
          const x = new XMLHttpRequest(); x.open("POST", t.uploadUrl);
          x.setRequestHeader("apikey", t.apikey); x.setRequestHeader("Authorization", `Bearer ${t.apikey}`);
          x.setRequestHeader("Content-Type", isImg ? "image/jpeg" : "application/pdf"); x.setRequestHeader("x-upsert", "false");
          x.upload.onprogress = e => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
          x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : bad(new Error(`Falha no envio (${x.status}). Confira se o SUPABASE_V12.sql foi aplicado.`)));
          x.onerror = () => bad(new Error("Falha de rede no envio.")); x.send(body);
        });
        const j = await call({ action: "add", taskId, path: t.path, name, size: body.size, type: isImg ? "image" : "pdf" });
        setItems(j.attachments || []); flash(`${isImg ? "Foto" : "PDF"} anexado`);
      } catch (e) { flash(e instanceof Error ? e.message : "Falha no anexo.", true); }
      finally { setBusy(""); }
    }
    if (input.current) input.current.value = "";
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

  if (!taskId) return <div className="v12-att span2"><div className="v12-att-head"><Paperclip size={14} /> Fotos e documentos</div><div className="v12-att-empty"><Camera size={16} /> Salve a atividade para anexar fotos ou PDFs.</div></div>;
  return <div className="v12-att span2">
    <div className="v12-att-head"><Paperclip size={14} /> Fotos e documentos <em>{items.length}</em><small>Vão no status report do cliente: fotos dentro do PDF, PDFs como anexo.</small></div>
    <div className="v12-att-grid">
      {items.map(a => <div key={a.id} className={`v12-att-item ${a.type}`}>
        {a.type === "image" ? <button type="button" className="v12-thumb" onClick={() => void view(a)} style={thumbs[a.id] ? { backgroundImage: `url("${thumbs[a.id]}")` } : undefined} aria-label={`Abrir ${a.name}`}>{!thumbs[a.id] && <Camera size={18} />}</button>
          : <button type="button" className="v12-thumb pdf" onClick={() => void view(a)} aria-label={`Abrir ${a.name}`}><FileText size={22} /><span>PDF</span></button>}
        <div className="v12-att-meta"><strong title={a.name}>{a.name}</strong><small>{new Date(a.uploadedAt).toLocaleDateString("pt-BR")}{a.uploadedBy ? ` · ${a.uploadedBy}` : ""}</small></div>
        <div className="v12-att-act"><button type="button" onClick={() => void view(a)} title="Abrir"><Eye size={14} /></button><button type="button" className="danger" onClick={() => remove(a)} title="Remover"><Trash2 size={14} /></button></div>
      </div>)}
      <button type="button" className="v12-add" onClick={() => input.current?.click()} disabled={!!busy}>{busy ? <><RefreshCw className="spin" size={18} /><span>{pct}%</span></> : <><ImagePlus size={20} /><span>Anexar foto ou PDF</span></>}</button>
    </div>
    <input ref={input} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={e => void upload(e.target.files)} />
    {msg && <div className={`v12-att-msg ${err ? "err" : ""}`}>{msg}</div>}
    {confirm && <ConfirmDialog box={confirm} onClose={() => setConfirm(null)} />}
  </div>;
}
