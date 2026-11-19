// V20 · Remove um documento avulso do projeto (o arquivo continua guardado no Storage, por segurança).
import { audit, problem, transact } from "@/lib/storage";
import { currentUser } from "@/lib/master";
import type { State } from "@/lib/types";
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
