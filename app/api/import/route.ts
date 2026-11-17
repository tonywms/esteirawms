import { replaceState, problem } from "@/lib/storage";
import type { State } from "@/lib/types";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (text.length > 15_000_000) return problem("Arquivo muito grande.");
    const data = JSON.parse(text) as State;
    if (!data || !Array.isArray(data.clients) || !Array.isArray(data.projects)) return problem("Arquivo nao e um backup da Esteira.");
    return Response.json(await replaceState(data));
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao importar."); }
}
