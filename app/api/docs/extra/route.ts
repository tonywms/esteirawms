// V20 · Remove um documento avulso do projeto (o arquivo continua guardado no Storage, por segurança).
import { audit, problem, transact } from "@/lib/storage";
import { currentUser } from "@/lib/master";
import type { ExtraDoc, State } from "@/lib/types";
export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const b = await req.json().catch(() => ({})) as { projectId?: string; id?: string };
  if (!b.projectId || !b.id) return problem("Documento inválido.");
  const who = await currentUser();
  try {
    const r = await transact((s: State) => {
      const p = s.projects.find(x => x.id === b.projectId); if (!p) return "Projeto não encontrado.";
      const d = (p.extraDocs || []).find(x => x.id === b.id); if (!d) return "Documento não encontrado.";
      const now = new Date().toISOString();
      p.extraDocs = (p.extraDocs || []).filter(x => x.id !== b.id);
      p.timeline = [{ id: crypto.randomUUID(), at: now, kind: "doc", author: who.name, text: `Documento avulso “${d.title}” removido da lista${d.sign && !d.signed ? " (o pedido na ZapSign não foi cancelado)" : ""}` }, ...(p.timeline || [])];
      p.updatedAt = now;
      audit(s, "projects", "documento avulso removido", p.id, d.title);
      return "";
    });
    return r ? problem(r) : Response.json({ ok: true });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao remover."); }
}

// V25 · Anexa um documento já assinado (PDF ou fotos convertidas em PDF no navegador). Não passa pela ZapSign.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { projectId?: string; title?: string; path?: string; name?: string; size?: number; signedAt?: string | null; taskId?: string | null; note?: string; pages?: number };
  const title = (b.title || "").trim().slice(0, 140);
  if (!b.projectId || !b.path || !title) return problem("Informe o nome do documento e o arquivo.");
  if (!b.path.startsWith(`${b.projectId}/extra/`) || !b.path.endsWith(".pdf") || b.path.includes("..")) return problem("Arquivo inválido.");
  if (b.signedAt && !/^\d{4}-\d{2}-\d{2}$/.test(b.signedAt)) return problem("Data de assinatura inválida.");
  const who = await currentUser();
  try {
    const r = await transact((s: State) => {
      const p = s.projects.find(x => x.id === b.projectId); if (!p) throw new Error("Projeto não encontrado.");
      const task = b.taskId ? s.tasks.find(t => t.id === b.taskId && t.projectId === p.id) : undefined;
      if (b.taskId && !task) throw new Error("Atividade não encontrada neste projeto.");
      const now = new Date().toISOString(), name = String(b.name || "documento.pdf").slice(0, 160), size = Number(b.size) || undefined;
      const doc: ExtraDoc = { id: crypto.randomUUID(), title, name, path: b.path!, size, uploadedAt: now, uploadedBy: who.name || undefined,
        sign: null, signed: { path: b.path!, name, size, uploadedAt: now },
        manual: { by: who.name || undefined, at: now, signedAt: b.signedAt || null, taskId: task?.id || null, note: (b.note || "").trim().slice(0, 500) || undefined, pages: Number(b.pages) || undefined } };
      p.extraDocs = [doc, ...(p.extraDocs || [])];
      const date = b.signedAt ? ` (assinado em ${b.signedAt.split("-").reverse().join("/")})` : "";
      p.timeline = [{ id: crypto.randomUUID(), at: now, kind: "doc", author: who.name, text: `Documento assinado anexado: “${title}”${date}${task ? ` · atividade “${task.title}”` : ""}` }, ...(p.timeline || [])];
      p.lastMovement = now.slice(0, 10); p.updatedAt = now;
      audit(s, "projects", "documento assinado anexado", p.id, title);
      return doc;
    });
    return Response.json({ ok: true, doc: r });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao anexar o documento."); }
}
