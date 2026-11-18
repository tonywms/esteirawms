// V13 · "Atualizar status" manual: confere na ZapSign e traz o PDF assinado se já estiver pronto.
import { loadState, problem } from "@/lib/storage";
import { currentUser } from "@/lib/master";
import { syncZapsignDoc } from "@/lib/zapsign";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { projectId?: string; phase?: string; taskId?: string; attachmentId?: string };
  const s = await loadState();
  const token = b.taskId ? s.tasks.find(t => t.id === b.taskId)?.attachments?.find(a => a.id === b.attachmentId)?.sign?.docToken : s.projects.find(p => p.id === b.projectId)?.phases?.[b.phase || ""]?.sign?.docToken;
  if (!token) return problem("Nenhum envio para a ZapSign encontrado.");
  try { const who = await currentUser(); return Response.json(await syncZapsignDoc(token, who.name || "ZapSign")); }
  catch (e) { return problem(e instanceof Error ? e.message : "Falha ao consultar a ZapSign.", 502); }
}
