import { loadState } from "@/lib/storage";
import { reconstruct, dayRange } from "@/lib/evolucao";
import { loadSnapshots, recordSnapshot, todaySP } from "@/lib/evolucao-store";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

// V18 · Série histórica para os gráficos de evolução. Grava a foto de hoje e devolve as fotos
// reais dos últimos dias; antes da primeira foto real, completa com uma estimativa (linha tracejada).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const span = Math.max(7, Math.min(365, Number(url.searchParams.get("dias")) || 120));
    const state = await loadState();
    const today = todaySP();
    try { await recordSnapshot(state, true); } catch (e) { console.error("[esteira] foto do dia", e); }
    const since = new Date(new Date(today + "T12:00:00").getTime() - span * 864e5).toISOString().slice(0, 10);
    const real = await loadSnapshots(since);
    const firstReal = real.map(r => r.day).sort()[0] || today;
    // estimativa só desde a importação da base (antes disso não há dado nenhum)
    const born = state.projects.map(p => String(p.createdAt || "").slice(0, 10)).filter(Boolean).sort()[0] || firstReal;
    const estStart = born > since ? born : since;
    const estDays = estStart < firstReal ? dayRange(estStart, firstReal).slice(0, -1) : [];
    const est = reconstruct(state, estDays);
    return Response.json({ today, since: estDays[0] || firstReal, firstReal, rows: [...est, ...real] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao carregar a evolução." }, { status: 500 });
  }
}
