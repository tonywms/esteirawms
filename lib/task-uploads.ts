"use client";
// V12.1 · Envio de fotos/PDFs de atividades (navegador).
// Também guarda os arquivos escolhidos numa atividade NOVA: eles sobem logo depois do "Cadastrar".
import type { TaskAttachment } from "./types";

export const attachCall = async (body: Record<string, unknown>) => {
  const r = await fetch("/api/tasks/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha no anexo.");
  return j;
};

export async function shrinkImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("Imagem inválida.")); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error("Falha ao converter a foto."))), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}

export const fileKind = (f: File) => (f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : f.type.startsWith("image/") ? "image" : null);
export function checkFile(f: File): string | null {
  const k = fileKind(f);
  if (!k) return `${f.name}: envie foto ou PDF.`;
  if (k === "pdf" && f.size > 25 * 1048576) return `${f.name}: PDF acima de 25 MB.`;
  return null;
}

/** Sobe um arquivo para a atividade e devolve a lista atualizada de anexos. */
export async function uploadTaskFile(taskId: string, f: File, onPct?: (n: number) => void): Promise<TaskAttachment[]> {
  const isImg = fileKind(f) === "image";
  const body: Blob = isImg ? await shrinkImage(f) : f;
  const t = await attachCall({ action: "ticket", taskId, ext: isImg ? "jpg" : "pdf" });
  await new Promise<void>((ok, bad) => {
    const x = new XMLHttpRequest(); x.open("POST", t.uploadUrl);
    x.setRequestHeader("apikey", t.apikey); x.setRequestHeader("Authorization", `Bearer ${t.apikey}`);
    x.setRequestHeader("Content-Type", isImg ? "image/jpeg" : "application/pdf"); x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = e => { if (e.lengthComputable) onPct?.(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : bad(new Error(`Falha no envio (${x.status}). Confira se o SUPABASE_V12.sql foi aplicado.`)));
    x.onerror = () => bad(new Error("Falha de rede no envio.")); x.send(body);
  });
  const name = isImg ? f.name.replace(/\.[^.]+$/, "") + ".jpg" : f.name;
  const j = await attachCall({ action: "add", taskId, path: t.path, name, size: body.size, type: isImg ? "image" : "pdf" });
  return j.attachments || [];
}

/* ---------- Fila da atividade nova ---------- */
let pending: File[] = [];
export const getPending = () => pending;
export const setPending = (files: File[]) => { pending = files; };
/** Chamado depois que a atividade nova foi cadastrada: sobe os arquivos escolhidos antes do "Cadastrar". */
export async function flushTaskUploads(taskId: string): Promise<{ sent: number; failed: string[] }> {
  const files = pending; pending = [];
  const failed: string[] = []; let sent = 0;
  for (const f of files) { try { await uploadTaskFile(taskId, f); sent++; } catch (e) { failed.push(`${f.name}: ${e instanceof Error ? e.message : "falha"}`); } }
  return { sent, failed };
}
