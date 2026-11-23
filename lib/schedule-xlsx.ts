// V29 · Excel do cronograma (mesmas cores e blocos do PDF) para enviar ao cliente.
import type { Client, Project } from "./types";
import { buildXlsx, colName, excelDate, type Cell, type Style } from "./xlsx";
import { GROUPS, clientDisplayName, clientNames, expertNames, fmtCnpj, fmtPhone, scheduleOf } from "./schedule";

const NAVY = "#0B1A2C", ALT = "#F4F7FA", PINK = "#FDECEC", RED = "#C0392B", TEXT = "#3D4A59", DARK = "#14213D", SUB = "#6B7C90";

export function buildScheduleXlsx(project: Project, client: Client | undefined, opts: { consultant?: string } = {}) {
  const name = clientDisplayName(client), info = client?.info || {};
  const sched = scheduleOf(project.schedule);
  const rows: (Cell | null)[][] = [], merges: string[] = [], heights: Record<number, number> = {};
  const N = 12; // A..L
  const put = (cells: (Cell | null)[]) => { rows.push(cells); return rows.length; };
  const t = (v: string | number | null, s?: Style): Cell => ({ v, s });
  const person = (x?: { name?: string; role?: string; email?: string; phone?: string }) => (x?.name ? [x.name, x.role, x.email, fmtPhone(x.phone)].filter(Boolean).join("  ·  ") : "—");

  let r = put([null, t("WMS EXPERT  ·  ESCOPO DE IMPLANTAÇÃO", { bold: true, size: 9, color: "#1AA6D6" })]);
  r = put([null, t(`Cronograma · ${name}`, { bold: true, size: 18, color: "#0D2B4A" })]); heights[r] = 28;
  put([]);
  const info2: [string, string][] = [
    ["Razão social", info.legalName || client?.name || "—"], ["Nome fantasia", info.tradeName || "—"], ["CNPJ", fmtCnpj(info.cnpj) || "—"], ["Patrocinador", person(info.sponsor)],
    ...[0, 1, 2].filter(i => i === 0 || info.keyUsers?.[i]?.name).map(i => [`Key user ${i + 1}`, person(info.keyUsers?.[i])] as [string, string]),
    ...(info.itSupport?.name ? [["Suporte TI", person(info.itSupport)] as [string, string]] : []),
    ["Projeto", project.name], ["Consultor WMS Expert", opts.consultant || "—"], ["Emitido em", new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })],
  ];
  for (const [k, v] of info2) { const rr = put([null, t(k, { size: 10, color: SUB }), t(v, { bold: true, size: 10, color: DARK })]); merges.push(`C${rr}:H${rr}`); }
  put([]);
  const HEAD = ["", "FASE", "ATIVIDADES", "TIME EXPERT", "RESP. EXPERT", "HRS", "TIME CLIENTE", "RESP. CLIENTE", "HRS", "INÍCIO", "FIM", "SITUAÇÃO"];
  const hs: Style = { bold: true, size: 9, color: "#FFFFFF", fill: NAVY, align: "center" };
  const hr = put(HEAD.map((h, i) => t(h, i === 1 || i === 2 || i === 6 || i === 7 ? { ...hs, align: "left" } : hs))); heights[hr] = 22;
  let gStart = 0, gKey = "";
  const closeBand = (end: number) => { if (!gStart) return; const g = GROUPS.find(x => x.key === gKey) || GROUPS[0]; rows[gStart - 1][0] = t(g.label.toUpperCase(), { bold: true, size: 9, color: "#FFFFFF", fill: g.color.toUpperCase(), align: "center", rotate: 90 }); for (let i = gStart + 1; i <= end; i++) rows[i - 1][0] = t(null, { fill: g.color.toUpperCase() }); if (end > gStart) merges.push(`A${gStart}:A${end}`); };
  sched.rows.forEach((x, i) => {
    if (x.group !== gKey) { closeBand(rows.length); gKey = x.group; gStart = rows.length + 1; }
    const pink = !!x.highlight, fill = pink ? PINK : i % 2 === 0 ? ALT : undefined, color = pink ? RED : TEXT;
    const base: Style = { size: 10, color, fill, border: true, valign: "center" }, cen: Style = { ...base, align: "center" };
    const names = clientNames(x, info).join(", ");
    const rr = put([
      null, t(x.phase, base), t(x.activity, { ...base, bold: !pink, color: pink ? RED : DARK }), t(x.expert, cen), t(expertNames(x, sched.team, opts.consultant).join(", "), { ...base, color: pink ? RED : SUB }),
      t(x.expertHrs ? Number(x.expertHrs) || x.expertHrs : "", cen), t(x.client, base), t(names, { ...base, color: pink ? RED : SUB }), t(x.clientHrs ? Number(x.clientHrs) || x.clientHrs : "", cen),
      x.start ? { v: excelDate(x.start), s: cen, date: true } : t(x.continuous ? "-" : "", cen), x.end ? { v: excelDate(x.end), s: cen, date: true } : t(x.continuous ? "-" : "", cen),
      t(x.done ? "Concluída" : "", { ...cen, color: "#1E7A45", bold: true }),
    ]);
    heights[rr] = 18;
  });
  closeBand(rows.length);
  put([]);
  put([null, t("Linhas em rosa: atividades sob responsabilidade do cliente. Datas no formato dd/mm/aaaa.", { italic: true, size: 9, color: SUB })]);
  void colName; void N;
  return buildXlsx([{ name: "Cronograma", cols: [6, 22, 46, 26, 20, 6, 24, 30, 6, 12, 12, 12], rows, merges, heights, freezeRow: hr, landscape: true }]);
}
