// V30 · Gera o "Escopo de implantação" completo (DOCX) para qualquer cliente, a partir do modelo oficial.
// Muda só o que é do cliente: nome (capa, cabeçalho, rodapé), consultor, data de emissão, unidade,
// organograma (patrocinador, especialistas/key users, suporte TI e equipe WMS Expert) e o cronograma
// (atividades, datas e responsáveis). Todo o resto do texto permanece igual ao modelo.
import type { Client, Project, ScheduleRow } from "./types";
import { ESCOPO_DOCX } from "./templates/escopo-docx";
import { unzip } from "./unzip";
import { zip } from "./xlsx";
import { GROUPS, brDate, clientDisplayName, clientNames, expertNames, scheduleOf } from "./schedule";

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const TBL = /<w:tbl>[\s\S]*?<\/w:tbl>/g, TR = /<w:tr[ >][\s\S]*?<\/w:tr>/g, TC = /<w:tc>[\s\S]*?<\/w:tc>/g;
const textOf = (x: string) => [...x.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");

/** Troca o texto de um <w:t> exato (primeira ocorrência). */
function replaceT(xml: string, from: string, to: string) {
  const re = new RegExp(`(<w:t(?: [^>]*)?>)${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(</w:t>)`);
  return xml.replace(re, (_m, a, b) => `${a}${esc(to)}${b}`);
}
/** Acrescenta uma linha menor (nome da pessoa) dentro da caixa do organograma. */
function addNameToBox(tbl: string, label: string, lines: string[]) {
  if (!lines.length) return tbl;
  return tbl.replace(new RegExp(`(<w:t(?: [^>]*)?>${label}</w:t></w:r>)`), (m) => m + lines.map((l, i) => `<w:r><w:rPr><w:color w:val="${i === 0 ? "BFE9F7" : "8FB8CC"}"/><w:sz w:val="${i === 0 ? 16 : 13}"/><w:szCs w:val="${i === 0 ? 16 : 13}"/></w:rPr><w:br/><w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join(""));
}
const personLines = (p?: { name?: string; role?: string; email?: string }) => (p?.name ? [p.name, ...(p.role ? [p.role] : [])] : []);

/* ---------- Cronograma ---------- */
function cellParts(tc: string) {
  const tcPr = (tc.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];
  const pPr = (tc.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
  const rPr = (tc.match(/<w:r>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/) || ["", '<w:rPr><w:sz w:val="15"/><w:szCs w:val="15"/></w:rPr>'])[1];
  return { tcPr, pPr, rPr };
}
function buildCell(proto: string, text: string, sub?: string, fill?: string) {
  const { tcPr, pPr, rPr } = cellParts(proto);
  const pr = fill ? tcPr.replace(/w:fill="[0-9A-Fa-f]+"/, `w:fill="${fill}"`) : tcPr;
  const subR = sub ? `<w:r><w:rPr><w:color w:val="6B7C90"/><w:sz w:val="12"/><w:szCs w:val="12"/></w:rPr><w:br/><w:t xml:space="preserve">${esc(sub)}</w:t></w:r>` : "";
  return `<w:tc>${pr}<w:p>${pPr}${text ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : ""}${subR}</w:p></w:tc>`;
}
function buildSchedule(tbl: string, rows: ScheduleRow[], name: (r: ScheduleRow) => { exp: string; cli: string }) {
  const trs = (tbl.match(TR) || []) as string[]; if (trs.length < 10) return tbl;
  const head = trs[0]!;
  const cellsOf = (tr?: string): string[] => (tr ? (tr.match(TC) as string[] | null) || [] : []);
  const isRestart = (tr: string) => /<w:vMerge w:val="restart"\/>/.test(cellsOf(tr)[0] || "");
  const restarts = trs.map((t, i) => (isRestart(t) ? i : -1)).filter(i => i >= 0);
  const bandProto = (g: number) => cellsOf(trs[restarts[Math.min(g, restarts.length - 1)]])[0] || "";
  const contProto = cellsOf(trs[(restarts[0] ?? 1) + 1])[0] || "";
  const normal: string = trs.find((t, i) => i > 0 && !/C0392B/.test(t) && /<w:b\/>/.test(cellsOf(t)[2] || "") && /w:fill="FFFFFF"/.test(cellsOf(t)[1] || "")) || trs[1];
  const pink: string = trs.find(t => /FDF0EE/.test(t)) || normal;
  const trOpen = (head.match(/^<w:tr[^>]*>/) || ["<w:tr>"])[0].replace(/ w14:paraId="[^"]*"| w14:textId="[^"]*"/g, "");
  const trPr = (normal.match(/<w:trPr>[\s\S]*?<\/w:trPr>/) || ["<w:trPr><w:cantSplit/></w:trPr>"])[0];
  const out: string[] = [head];
  GROUPS.forEach((g, gi) => {
    const list = rows.filter(r => r.group === g.key); if (!list.length) return;
    list.forEach((r, i) => {
      const proto = r.highlight ? pink : normal, pc = cellsOf(proto);
      const fill = r.highlight ? undefined : i % 2 === 0 ? "FFFFFF" : "F5F8FB";
      const band = i === 0 ? bandProto(gi).replace(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/, `<w:t>${esc(g.label.toUpperCase())}</w:t>`) : contProto;
      const n = name(r);
      const dt = (v?: string | null) => (v ? brDate(v) : r.continuous ? "-" : "");
      out.push(`${trOpen}${trPr}${band}${buildCell(pc[1], r.phase, undefined, fill)}${buildCell(pc[2], r.activity, undefined, fill)}${buildCell(pc[3], r.expert, n.exp || undefined, fill)}${buildCell(pc[4], r.expertHrs || "", undefined, fill)}${buildCell(pc[5], r.client, n.cli || undefined, fill)}${buildCell(pc[6], r.clientHrs || "", undefined, fill)}${buildCell(pc[7], dt(r.start), undefined, fill)}${buildCell(pc[8], dt(r.end), undefined, fill)}</w:tr>`);
    });
  });
  const start = tbl.indexOf(trs[0]), end = tbl.lastIndexOf(trs[trs.length - 1]) + trs[trs.length - 1].length;
  return tbl.slice(0, start) + out.join("") + tbl.slice(end);
}

export function buildEscopoDocx(project: Project, client: Client | undefined, opts: { consultant?: string } = {}) {
  const files = unzip(Buffer.from(ESCOPO_DOCX, "base64"));
  const name = clientDisplayName(client), info = client?.info || {};
  const sched = scheduleOf(project.schedule), team = sched.team || {};
  const consultant = team.gestor || opts.consultant || "";
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const swapName = (xml: string) => xml
    .replace(/(<w:t(?: [^>]*)?>)([^<]*?)Via Sul([^<]*<\/w:t>)/g, (_m, a, b, c) => `${a}${b}${esc(name)}${c}`)
    .replace(/(<w:t(?: [^>]*)?>)([^<]*?)VIA SUL([^<]*<\/w:t>)/g, (_m, a, b, c) => `${a}${b}${esc(name.toUpperCase())}${c}`);
  for (const f of files) {
    if (!/^word\/(document|header\d+|footer\d+)\.xml$/.test(f.name)) continue;
    let x = swapName(f.data.toString("utf8"));
    if (f.name === "word/document.xml") {
      let ti = 0;
      x = x.replace(TBL, tbl => {
        const i = ti++, txt = textOf(tbl);
        if (i === 0 && txt.includes("CONSULTOR")) {
          let t = tbl; const vals = [...tbl.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]);
          const after = (label: string) => vals[vals.indexOf(label) + 1];
          if (consultant && after("CONSULTOR")) t = replaceT(t, after("CONSULTOR"), consultant);
          if (after("DATA DE EMISSÃO")) t = replaceT(t, after("DATA DE EMISSÃO"), today);
          if (team.unidade && after("UNIDADE WMS EXPERT")) t = replaceT(t, after("UNIDADE WMS EXPERT"), team.unidade);
          return t;
        }
        if (/^Patrocinador$/.test(txt.trim())) return addNameToBox(tbl, "Patrocinador", personLines(info.sponsor));
        if (txt.includes("Especialista 1") && txt.includes("Suporte TI")) {
          let t = addNameToBox(tbl, "Especialista 1", personLines(info.keyUsers?.[0]));
          const k2 = [...personLines(info.keyUsers?.[1]), ...(info.keyUsers?.[2]?.name ? [info.keyUsers[2].name] : [])];
          t = addNameToBox(t, "Especialista 2", k2);
          return addNameToBox(t, "Suporte TI", personLines(info.itSupport));
        }
        if (/^Gestor de Implantação$/.test(txt.trim())) return addNameToBox(tbl, "Gestor de Implantação", team.gestor || consultant ? [team.gestor || consultant] : []);
        if (txt.replace(/\s+/g, "") === "InstrutorQualidade") {
          const t = addNameToBox(tbl, "Instrutor", team.instrutor ? [team.instrutor] : []);
          return addNameToBox(t, "Qualidade", team.qualidade ? [team.qualidade] : []);
        }
        if (txt.includes("FASE") && txt.includes("ATIVIDADES") && txt.includes("TIME CLIENTE")) {
          return buildSchedule(tbl, sched.rows, r => ({ exp: expertNames(r, team, consultant).join(", "), cli: clientNames(r, info).join(", ") }));
        }
        return tbl;
      });
    }
    f.data = Buffer.from(x, "utf8");
  }
  const core = files.find(f => f.name === "docProps/core.xml");
  if (core) core.data = Buffer.from(core.data.toString("utf8").replace(/<dc:title>[^<]*<\/dc:title>/, `<dc:title>Escopo de implantação · ${esc(name)}</dc:title>`), "utf8");
  return zip(files.map(f => ({ name: f.name, data: f.data })));
}
