// V29 · Baixa o cronograma do projeto em PDF (modelo do escopo) ou Excel, para enviar ao cliente.
import { loadState, problem } from "@/lib/storage";
import { buildSchedulePdf } from "@/lib/schedule-pdf";
import { buildScheduleXlsx } from "@/lib/schedule-xlsx";
import { clientDisplayName } from "@/lib/schedule";
import { phaseOwner } from "@/lib/flow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url), fmt = url.searchParams.get("formato") === "xlsx" ? "xlsx" : "pdf";
  try {
    const s = await loadState();
    const p = s.projects.find(x => x.id === id); if (!p) return problem("Projeto não encontrado.", 404);
    const c = s.clients.find(x => x.id === p.clientId);
    const consultant = p.schedule?.consultant || p.implementationOwner || phaseOwner(p);
    const safe = clientDisplayName(c).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (fmt === "xlsx") {
      const buf = buildScheduleXlsx(p, c, { consultant });
      return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Cronograma_${safe}.xlsx"`, "Cache-Control": "no-store" } });
    }
    const buf = await buildSchedulePdf(p, c, { ident: url.searchParams.get("ident") !== "0", consultant });
    const inline = url.searchParams.get("ver") === "1";
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="Cronograma_${safe}.pdf"`, "Cache-Control": "no-store" } });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao gerar o cronograma."); }
}
