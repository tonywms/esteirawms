// V21 · Pessoas que já assinaram/receberam documentos na ZapSign (para importar como contatos do cliente).
import { problem } from "@/lib/storage";
import { zapsignConfigured, zsPeople } from "@/lib/zapsign";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!zapsignConfigured()) return Response.json({ configured: false, people: [] });
  try {
    const force = new URL(req.url).searchParams.get("atualizar") === "1";
    const r = await zsPeople(force);
    return Response.json({ configured: true, ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao consultar a ZapSign.", 502); }
}
