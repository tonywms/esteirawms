// V12 · Fotos e PDFs anexados às atividades.
// ticket → link de envio direto ao armazenamento privado; add/remove → grava na atividade e na linha do tempo; view → link temporário.
import { audit, loadState, problem, transact } from "@/lib/storage";
import { sbFileSignedUrl, sbFileUploadTicket, supabaseConfigured } from "@/lib/supabase-store";
import { currentUser } from "@/lib/master";
import type { State, TaskAttachment } from "@/lib/types";
export const runtime = "nodejs";

type Body = { action?: "ticket" | "add" | "remove" | "view"; taskId?: string; ext?: string; path?: string; name?: string; size?: number; type?: string; id?: string; download?: boolean };
const EXT = ["pdf", "jpg", "png"];
const MAX = 15;

export async function POST(req: Request) {
  if (!supabaseConfigured()) return problem("Anexos exigem o Supabase configurado.");
  const b = await req.json().catch(() => ({})) as Body;
  if (!b.taskId || !b.action) return problem("Requisição inválida.");
  const s = await loadState();
  const t = s.tasks.find(x => x.id === b.taskId);
  if (!t) return problem("Atividade não encontrada. Salve a atividade antes de anexar.", 404);
  try {
    if (b.action === "ticket") {
      const ext = (b.ext || "").toLowerCase();
      if (!EXT.includes(ext)) return problem("Envie foto (JPG/PNG) ou PDF.");
      if ((t.attachments || []).length >= MAX) return problem(`Máximo de ${MAX} anexos por atividade.`);
      return Response.json(await sbFileUploadTicket(t.projectId, t.id, ext));
    }
    if (b.action === "view") {
      const a = (t.attachments || []).find(x => x.id === b.id);
      if (!a) return problem("Anexo não encontrado.", 404);
      return Response.json({ url: await sbFileSignedUrl(t.projectId, t.id, a.path, b.download ? a.name : undefined) });
    }
    const who = await currentUser();
    const result = await transact((st: State) => {
      const task = st.tasks.find(x => x.id === b.taskId);
      if (!task) throw new Error("Atividade não encontrada.");
      const list = [...(task.attachments || [])];
      const p = st.projects.find(x => x.id === task.projectId);
      const now = new Date().toISOString();
      let text = "";
      if (b.action === "add") {
        if (!b.path || !b.path.startsWith(`${task.projectId}/tasks/${task.id}/`) || b.path.includes("..")) throw new Error("Arquivo inválido.");
        const type: TaskAttachment["type"] = b.type === "image" ? "image" : "pdf";
        const a: TaskAttachment = { id: crypto.randomUUID(), path: b.path, name: String(b.name || (type === "image" ? "foto.jpg" : "documento.pdf")).slice(0, 160), size: Number(b.size) || undefined, type, uploadedAt: now, uploadedBy: who.name || undefined };
        list.push(a); task.attachments = list;
        text = `Atividade “${task.title}”: ${type === "image" ? "foto" : "PDF"} anexado · ${a.name}`;
      } else if (b.action === "remove") {
        const a = list.find(x => x.id === b.id);
        if (!a) throw new Error("Anexo não encontrado.");
        task.attachments = list.filter(x => x.id !== b.id);
        text = `Atividade “${task.title}”: anexo removido · ${a.name}`;
      } else throw new Error("Ação inválida.");
      task.updatedAt = now;
      if (p) { p.timeline = [{ id: `task-${task.id}:${crypto.randomUUID()}`, at: now, kind: "atividade", author: who.name || undefined, text }, ...(p.timeline || [])]; }
      audit(st, "tasks", b.action === "add" ? "anexo adicionado" : "anexo removido", task.id, task.title);
      return task.attachments;
    });
    return Response.json({ ok: true, attachments: result });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha no anexo."); }
}
