// V8 · Gera URL temporária (15 min) para enviar o PDF da fase direto ao Storage privado.
import { problem } from "@/lib/storage";
import { sbDocUploadTicket, supabaseConfigured } from "@/lib/supabase-store";
export const runtime = "nodejs";
const PHASES = ["kickoff", "dev", "homolog", "campo", "golive", "extra"]; // V20: "extra" = documentos avulsos
export async function POST(req: Request) {
  if (!supabaseConfigured()) return problem("Anexos exigem o Supabase configurado.");
  const b = await req.json().catch(() => ({})) as { projectId?: string; phase?: string };
  if (!b.projectId || !b.phase || !PHASES.includes(b.phase)) return problem("Projeto ou fase inválidos.");
  try { return Response.json(await sbDocUploadTicket(b.projectId, b.phase)); }
  catch (e) { return problem(e instanceof Error ? e.message : "Falha ao preparar o envio."); }
}
