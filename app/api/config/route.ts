// V41 · Configurações do painel (quantas semanas a TV mostra em Próximas implantações).
import { problem } from "@/lib/storage";
import { getPanelConfig, setPanelConfig } from "@/lib/avatar-store";
import { authEnabled } from "@/lib/auth";
import { currentUser } from "@/lib/master";
import { asProfile } from "@/lib/permissions";
export const runtime = "nodejs";

export async function GET() { return Response.json(await getPanelConfig().catch(() => ({})), { headers: { "Cache-Control": "no-store" } }); }
export async function POST(req: Request) {
  let who = "Equipe";
  if (authEnabled()) { const u = await currentUser(); const p = asProfile(u.profile); if (p !== "Administrador" && p !== "Gestor") return problem("Somente Administrador e Gestor alteram o painel.", 403); who = u.name || u.email; }
  const b = await req.json().catch(() => ({})) as { tvWeeks?: number };
  const cur = await getPanelConfig().catch(() => ({}));
  const tvWeeks = [1, 2, 3].includes(Number(b.tvWeeks)) ? Number(b.tvWeeks) : (cur as { tvWeeks?: number }).tvWeeks || 2;
  return Response.json(await setPanelConfig({ ...cur, tvWeeks }, who));
}
