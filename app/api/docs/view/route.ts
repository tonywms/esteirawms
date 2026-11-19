// V8 · Link temporário (2 min) para abrir/baixar o PDF anexado a uma fase.
import { problem } from "@/lib/storage";
import { sbDocSignedUrl, supabaseConfigured } from "@/lib/supabase-store";
export const runtime = "nodejs";
const PHASES = ["kickoff", "dev", "homolog", "campo", "golive", "extra"]; // V20: "extra" = documentos avulsos
export async function POST(req: Request) {
  if (!supabaseConfigured()) return problem("Anexos exigem o Supabase configurado.");
  const b = await req.json().catch(() => ({})) as { projectId?: string; phase?: string; path?: string; name?: string; download?: boolean };
  if (!b.projectId || !b.phase || !PHASES.includes(b.phase) || !b.path) return problem("Documento inválido.");
  try { return Response.json({ url: await sbDocSignedUrl(b.projectId, b.phase, b.path, b.download ? b.name : undefined) }); }
  catch (e) { return problem(e instanceof Error ? e.message : "Falha ao abrir o documento."); }
}
