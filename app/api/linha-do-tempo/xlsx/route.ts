// V31 · Excel da linha do tempo (por consultor ou por projeto) — pronto para enviar ao cliente.
import { loadState, problem } from "@/lib/storage";
import { buildTimeline, br, STATUS_LABEL, phaseShort } from "@/lib/timeline";
import { buildXlsx, excelDate, type Cell, type Style } from "@/lib/xlsx";
import { todayISO } from "@/lib/metrics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAVY = "#0B1A2C", SUB = "#6B7C90", DARK = "#14213D";
const PH: Record<string, string> = { kickoff: "#EDE7FE", dev: "#E3EEFF", homolog: "#DFF6FB", campo: "#FDEBDC", golive: "#DDF5E8", none: "#EEF2F6" };

export async function GET(req: Request) {
  const u = new URL(req.url), today = todayISO();
  const from = u.searchParams.get("de") || today, to = u.searchParams.get("ate") || today;
  const mode = u.searchParams.get("modo") === "projeto" ? "projeto" : "consultor";
  try {
    const s = await loadState();
    const groups = buildTimeline(s, from, to, { mode, person: u.searchParams.get("pessoa") || undefined, projectId: u.searchParams.get("projeto") || undefined, today });
    const rows: (Cell | null)[][] = [], merges: string[] = [], heights: Record<number, number> = {};
    const t = (v: string | number | null, st?: Style): Cell => ({ v, s: st });
    const put = (r: (Cell | null)[]) => { rows.push(r); return rows.length; };
    const single = mode === "projeto" && groups.length === 1 ? groups[0].person : "";
    put([t("WMS EXPERT  ·  LINHA DO TEMPO", { bold: true, size: 9, color: "#1AA6D6" })]);
    const tr = put([t(single ? `Linha do tempo · ${single}` : mode === "consultor" ? "Linha do tempo por consultor" : "Linha do tempo por projeto", { bold: true, size: 18, color: "#0D2B4A" })]); heights[tr] = 28;
    put([t(`Período: ${br(from)} a ${br(to)}  ·  emitido em ${br(today)}`, { size: 10, color: SUB })]);
    put([]);
    const HEAD = [mode === "consultor" ? "CONSULTOR" : "PESSOA / FRENTE", mode === "consultor" ? "CLIENTE" : "PROJETO", "TIPO", "ETAPA / O QUE FOI FEITO", "INÍCIO", "FIM", "TERMO / SITUAÇÃO", "MOTIVO / OBJEÇÃO", "TRAVOU POR"];
    const hs: Style = { bold: true, size: 9, color: "#FFFFFF", fill: NAVY, align: "left" };
    const hr = put(HEAD.map(h => t(h, hs))); heights[hr] = 22;
    for (const g of groups) {
      const gr = put([t(g.person, { bold: true, size: 12, color: "#FFFFFF", fill: "#1D6AA0" }), ...Array(8).fill(t(null, { fill: "#1D6AA0" }))]); merges.push(`A${gr}:I${gr}`); heights[gr] = 20;
      for (const l of g.lanes) {
        const who = mode === "consultor" ? g.person : l.person, cli = mode === "consultor" ? l.client : g.person;
        for (const sg of l.segs) {
          const fill = PH[sg.phase || "none"], base: Style = { size: 10, color: DARK, fill, border: true };
          put([t(who, base), t(cli, { ...base, bold: true }), t(sg.kind === "fase" ? "Fase da esteira" : sg.kind === "agenda" ? "Agenda" : "Cronograma", { ...base, color: SUB }), t(`${sg.label}${sg.kind === "crono" && sg.detail ? ` (${sg.detail})` : ""}`, { ...base, bold: sg.kind !== "crono" }),
            { v: excelDate(sg.start), s: { ...base, align: "center" }, date: true }, { v: excelDate(sg.end), s: { ...base, align: "center" }, date: true },
            t(sg.termo === "ok" ? (sg.kind === "crono" ? "Concluída" : "Termo final entregue") : sg.termo === "pendente" ? "Termo pendente" : sg.phase ? phaseShort(sg.phase) : "", { ...base, bold: true, color: sg.termo === "ok" ? "#1E7A45" : sg.termo === "pendente" ? "#B45309" : SUB }), t("", base), t("", base)]);
        }
        for (const e of l.entries) {
          const bad = e.status !== "ok", base: Style = { size: 10, color: bad ? "#C0392B" : DARK, fill: bad ? "#FDECEC" : undefined, border: true };
          put([t(who, base), t(cli, base), t("Diário", { ...base, color: bad ? "#C0392B" : SUB }), t(e.text, base), { v: excelDate(e.date), s: { ...base, align: "center" }, date: true }, t("", base),
            t(STATUS_LABEL[e.status], { ...base, bold: true, color: e.status === "ok" ? "#1E7A45" : e.status === "parcial" ? "#B45309" : "#C0392B" }), t(e.reason || "", base), t(e.blockedBy || "", base)]);
        }
        if (l.blocker && mode === "consultor") put([t(who, { size: 10, border: true }), t(cli, { size: 10, border: true }), t("Empecilho", { size: 10, color: "#C0392B", border: true }), t(l.blocker, { size: 10, color: "#C0392B", border: true }), t("", { border: true }), t("", { border: true }), t("Aberto", { size: 10, bold: true, color: "#C0392B", border: true }), t("", { border: true }), t("", { border: true })]);
      }
    }
    put([]); put([t("Tipos: Fase da esteira (dono da fase e datas), Agenda (visitas/compromissos), Cronograma (atividades do cronograma de implantação), Diário (o que foi feito no dia).", { italic: true, size: 9, color: SUB })]);
    const buf = buildXlsx([{ name: "Linha do tempo", cols: [22, 24, 16, 54, 12, 12, 20, 42, 16], rows, merges, heights, freezeRow: hr, landscape: true }]);
    const safe = (single || (mode === "consultor" ? u.searchParams.get("pessoa") || "consultores" : "projetos")).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_");
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Linha_do_tempo_${safe}_${from}_a_${to}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao gerar o Excel."); }
}
