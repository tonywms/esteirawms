// V30 · Baixa o "Escopo de implantação" completo do projeto em Word (.docx), no modelo oficial.
import { loadState, problem } from "@/lib/storage";
import { buildEscopoDocx } from "@/lib/escopo-docx";
import { clientDisplayName } from "@/lib/schedule";
import { phaseOwner } from "@/lib/flow";
import { logoBytes } from "@/lib/avatar-store"; // V32: logo do cliente no documento
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const s = await loadState();
    const p = s.projects.find(x => x.id === id); if (!p) return problem("Projeto não encontrado.", 404);
    const c = s.clients.find(x => x.id === p.clientId);
    const consultant = p.schedule?.consultant || p.implementationOwner || phaseOwner(p);
    const safe = clientDisplayName(c).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const buf = buildEscopoDocx(p, c, { consultant, logo: await logoBytes(c?.id) });
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="Escopo_de_implantacao_${safe}_WMSExpert.docx"`, "Cache-Control": "no-store" } });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao gerar o escopo."); }
}
