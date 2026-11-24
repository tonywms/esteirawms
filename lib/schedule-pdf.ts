// V29 · PDF do cronograma, igual ao modelo "Escopo de implantação · 06 Planejamento · Cronograma".
// A4 paisagem, cabeçalho com a marca, faixa lateral por bloco (Formação Expert / Integração / Go live),
// linhas destacadas em rosa para atividades do cliente. Só mudam o nome do cliente, datas e responsáveis.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Client, Project, ScheduleRow } from "./types";
import { LOGO_BLUE_PNG, LOGO_BLUE_RATIO } from "./brand-logo";
import { imageInfo } from "./image-size";
import { GROUPS, TEAM_ROLES, brDate, clientDisplayName, clientNames, clientPeople, expertNames, fmtCnpj, fmtPhone, scheduleOf } from "./schedule";

const W = 841.92, H = 595.32, L = 50, R = 792;
const hex = (h: string): RGB => { const n = parseInt(h.replace("#", ""), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const C = { navy: hex("#0b1a2c"), title: hex("#0d2b4a"), cyan: hex("#1aa6d6"), gray: hex("#7d8a99"), text: hex("#3d4a59"), dark: hex("#14213d"), line: hex("#e3e8ed"), alt: hex("#f4f7fa"), pink: hex("#fdecec"), pinkLine: hex("#f6d4d4"), red: hex("#c0392b"), sub: hex("#6b7c90"), white: rgb(1, 1, 1) };
const COL = { fase: 89, ativ: 194, expC: 447, expW: 118, hrsE: 524, cli: 542, hrsC: 670, ini: 714, fim: 765 };

type F = { r: PDFFont; b: PDFFont };
function safe(f: PDFFont, t: string) { let o = ""; for (const ch of String(t ?? "")) { try { f.encodeText(ch); o += ch; } catch { o += ch === "≥" ? ">=" : ch === "≤" ? "<=" : "?"; } } return o; }
function fit(f: PDFFont, t: string, size: number, max: number) { let s = safe(f, t); if (f.widthOfTextAtSize(s, size) <= max) return s; while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > max) s = s.slice(0, -1); return s + "…"; }
function spaced(page: PDFPage, f: PDFFont, t: string, x: number, y: number, size: number, sp: number, color: RGB, align: "l" | "r" = "l") {
  const s = safe(f, t); const w = [...s].reduce((a, ch) => a + f.widthOfTextAtSize(ch, size) + sp, 0) - sp;
  let cx = align === "r" ? x - w : x; for (const ch of s) { page.drawText(ch, { x: cx, y, size, font: f, color }); cx += f.widthOfTextAtSize(ch, size) + sp; }
}
const center = (page: PDFPage, f: PDFFont, t: string, cx: number, y: number, size: number, color: RGB, max = 200) => { const s = fit(f, t, size, max); page.drawText(s, { x: cx - f.widthOfTextAtSize(s, size) / 2, y, size, font: f, color }); };

export async function buildSchedulePdf(project: Project, client: Client | undefined, opts: { ident?: boolean; consultant?: string; logo?: Uint8Array | null } = {}) {
  const doc = await PDFDocument.create();
  const fonts: F = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) };
  const logo = await doc.embedPng(Buffer.from(LOGO_BLUE_PNG, "base64"));
  const name = clientDisplayName(client);
  // V32 · logo do cliente no canto direito do título da primeira página
  const info0 = opts.logo ? imageInfo(opts.logo) : null;
  const cLogo = info0 ? await (info0.type === "png" ? doc.embedPng(opts.logo!) : doc.embedJpg(opts.logo!)).catch(() => null) : null;
  let logoDrawn = false;
  const drawClientLogo = (p: PDFPage) => {
    if (!cLogo || logoDrawn) return; logoDrawn = true;
    const maxW = 150, maxH = 50, k = Math.min(maxW / cLogo.width, maxH / cLogo.height);
    const w = cLogo.width * k, h = cLogo.height * k;
    p.drawImage(cLogo, { x: R - w, y: H - 72 - (maxH + h) / 2 - 8, width: w, height: h });
  };
  doc.setTitle(`Cronograma de implantação · ${name}`); doc.setAuthor("WMS Expert"); doc.setProducer("WMS Expert Esteira");
  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = doc.addPage([W, H]); pages.push(p);
    const lh = 21; p.drawImage(logo, { x: L, y: H - 30 - lh, width: lh * LOGO_BLUE_RATIO, height: lh });
    spaced(p, fonts.r, `ESCOPO DE IMPLANTAÇÃO · ${name.toUpperCase()}`, R, H - 47, 7.3, 2.1, C.gray, "r");
    p.drawLine({ start: { x: L, y: H - 59 }, end: { x: R, y: H - 59 }, thickness: 0.6, color: C.line });
    p.drawLine({ start: { x: L, y: 44 }, end: { x: R, y: 44 }, thickness: 0.6, color: C.line });
    p.drawText(safe(fonts.r, `WMS Expert · Escopo de implantação · ${name}`), { x: L, y: 28, size: 7.3, font: fonts.r, color: C.gray });
    return p;
  };
  const sectionHead = (p: PDFPage, eyebrow: string, title: string) => {
    spaced(p, fonts.b, eyebrow, L, H - 76, 7.3, 2.6, C.cyan);
    p.drawText(safe(fonts.b, title), { x: L, y: H - 108, size: 23, font: fonts.b, color: C.title });
    p.drawRectangle({ x: L, y: H - 133, width: 310, height: 2.4, color: C.cyan });
  };

  /* ---------- Página de identificação (opcional) ---------- */
  if (opts.ident !== false) {
    const p = newPage(); sectionHead(p, "IDENTIFICAÇÃO DO CLIENTE", "Cliente e responsáveis"); drawClientLogo(p);
    const info = client?.info || {};
    const people = clientPeople(info);
    const line = (x?: { name?: string; email?: string; phone?: string; role?: string }) => x?.name ? [x.name, x.role, x.email, fmtPhone(x.phone)].filter(Boolean).join("  ·  ") : "—";
    const rows: [string, string][] = [
      ["Razão social", info.legalName || client?.name || "—"], ["Nome fantasia", info.tradeName || "—"], ["CNPJ", fmtCnpj(info.cnpj) || "—"],
      ["Patrocinador", line(info.sponsor)],
      ...[0, 1, 2].filter(i => i === 0 || info.keyUsers?.[i]?.name).map(i => [`Key user ${i + 1}`, line(info.keyUsers?.[i])] as [string, string]),
      ...(info.itSupport?.name ? [["TI · integração", line(info.itSupport)] as [string, string]] : []),
      ...(info.itSecondary?.name ? [["TI secundário", line(info.itSecondary)] as [string, string]] : []),
      ...(info.logisticsManager?.name ? [["Gestor de logística", line(info.logisticsManager)] as [string, string]] : []),
      ["Projeto", project.name], ["Consultor WMS Expert", opts.consultant || "—"],
      ...TEAM_ROLES.filter(r => project.schedule?.team?.[r.key]).map(r => [`${r.label} (WMS Expert)`, String(project.schedule!.team![r.key])] as [string, string]), ["Data de emissão", new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ];
    let y = H - 150;
    p.drawRectangle({ x: L, y: y - 21.6, width: R - L, height: 21.6, color: C.navy });
    p.drawText("CAMPO", { x: L + 12, y: y - 14, size: 6.8, font: fonts.b, color: C.white });
    p.drawText("INFORMAÇÃO", { x: L + 170, y: y - 14, size: 6.8, font: fonts.b, color: C.white });
    y -= 21.6;
    rows.forEach(([k, v], i) => {
      const h = 19; if (i % 2) p.drawRectangle({ x: L, y: y - h, width: R - L, height: h, color: C.alt });
      p.drawLine({ start: { x: L, y: y - h }, end: { x: R, y: y - h }, thickness: 0.5, color: C.line });
      p.drawText(safe(fonts.r, k), { x: L + 12, y: y - 12.5, size: 7.6, font: fonts.r, color: C.text });
      p.drawText(fit(fonts.b, v, 7.8, R - L - 182), { x: L + 170, y: y - 12.5, size: 7.8, font: fonts.b, color: C.dark });
      y -= h;
    });
    if (people.length) p.drawText(safe(fonts.r, "Os responsáveis acima são as pessoas do cliente indicadas em cada atividade do cronograma (coluna Time cliente)."), { x: L, y: y - 18, size: 7, font: fonts.r, color: C.sub });
  }

  /* ---------- Cronograma ---------- */
  const sched = scheduleOf(project.schedule);
  const namesOf = (r: ScheduleRow) => clientNames(r, client?.info);
  const expOf = (r: ScheduleRow) => expertNames(r, sched.team, opts.consultant).join(", ");
  const heightOf = (r: ScheduleRow) => (namesOf(r).length || expOf(r) ? 21 : 15.6);
  let page = newPage(); sectionHead(page, "06  ·  PLANEJAMENTO", "Cronograma"); drawClientLogo(page);
  let y = H - 146;
  const header = () => {
    page.drawRectangle({ x: L, y: y - 21.6, width: R - L, height: 21.6, color: C.navy });
    const hy = y - 13.8, s = 6.6;
    page.drawText("FASE", { x: COL.fase + 4, y: hy, size: s, font: fonts.b, color: C.white });
    page.drawText("ATIVIDADES", { x: COL.ativ, y: hy, size: s, font: fonts.b, color: C.white });
    center(page, fonts.b, "TIME EXPERT", COL.expC, hy, s, C.white);
    center(page, fonts.b, "HRS", COL.hrsE, hy, s, C.white);
    page.drawText("TIME CLIENTE", { x: COL.cli, y: hy, size: s, font: fonts.b, color: C.white });
    center(page, fonts.b, "HRS", COL.hrsC, hy, s, C.white);
    center(page, fonts.b, "INÍCIO", COL.ini, hy, s, C.white);
    center(page, fonts.b, "FIM", COL.fim, hy, s, C.white);
    y -= 21.6;
  };
  header();
  const band = (g: string, top: number, bottom: number) => {
    const meta = GROUPS.find(x => x.key === g) || GROUPS[0];
    page.drawRectangle({ x: L, y: bottom, width: 35, height: top - bottom, color: hex(meta.color) });
    const label = meta.label.toUpperCase(), size = 7.4, sp = 3;
    const w = [...label].reduce((a, ch) => a + fonts.b.widthOfTextAtSize(ch, size) + sp, 0) - sp;
    if (w > top - bottom - 6) return;
    let cy = (top + bottom) / 2 - w / 2;
    for (const ch of label) { page.drawText(ch, { x: L + 21, y: cy, size, font: fonts.b, color: C.white, rotate: degrees(90) }); cy += fonts.b.widthOfTextAtSize(ch, size) + sp; }
  };
  let bandStart = y, bandGroup = sched.rows[0]?.group || "formacao", idx = 0;
  for (const r of sched.rows) {
    const h = heightOf(r);
    if (r.group !== bandGroup) { band(bandGroup, bandStart, y); page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1.2, color: C.white }); bandGroup = r.group; bandStart = y; idx = 0; }
    if (y - h < 52) { band(bandGroup, bandStart, y); page = newPage(); y = H - 65; header(); bandStart = y; idx = 0; }
    const pink = !!r.highlight;
    if (pink) page.drawRectangle({ x: L + 35, y: y - h, width: R - L - 35, height: h, color: C.pink });
    else if (idx % 2 === 0) page.drawRectangle({ x: L + 35, y: y - h, width: R - L - 35, height: h, color: C.alt });
    page.drawLine({ start: { x: L + 35, y: y - h }, end: { x: R, y: y - h }, thickness: 0.5, color: pink ? C.pinkLine : C.line });
    const ty = y - 10.3, s = 7.1, tc = pink ? C.red : C.text, bc = pink ? C.red : C.dark;
    page.drawText(fit(fonts.r, r.phase, s, COL.ativ - COL.fase - 10), { x: COL.fase + 4, y: ty, size: s, font: fonts.r, color: tc });
    page.drawText(fit(pink ? fonts.r : fonts.b, r.activity, s, COL.expC - COL.expW / 2 - COL.ativ - 6), { x: COL.ativ, y: ty, size: s, font: pink ? fonts.r : fonts.b, color: bc });
    center(page, fonts.r, r.expert || "", COL.expC, ty, s, tc, COL.expW + 10);
    center(page, fonts.r, r.expertHrs || "", COL.hrsE, ty, s, tc, 20);
    page.drawText(fit(fonts.r, r.client || "", s, COL.hrsC - COL.cli - 14), { x: COL.cli, y: ty, size: s, font: fonts.r, color: tc });
    center(page, fonts.r, r.clientHrs || "", COL.hrsC, ty, s, tc, 20);
    center(page, fonts.r, r.start ? brDate(r.start) : r.continuous ? "-" : "", COL.ini, ty, s, tc, 50);
    center(page, fonts.r, r.end ? brDate(r.end) : r.continuous ? "-" : "", COL.fim, ty, s, tc, 50);
    const names = namesOf(r);
    if (expOf(r)) center(page, fonts.r, expOf(r), COL.expC, ty - 8, 6, pink ? C.red : C.sub, COL.expW + 10);
    if (names.length) page.drawText(fit(fonts.r, names.join(", "), 6, COL.hrsC - COL.cli - 14), { x: COL.cli, y: ty - 8, size: 6, font: fonts.r, color: pink ? C.red : C.sub });
    y -= h; idx++;
  }
  band(bandGroup, bandStart, y);
  pages.forEach((p, i) => { const n = String(i + 1); p.drawText(n, { x: R - fonts.b.widthOfTextAtSize(n, 8), y: 28, size: 8, font: fonts.b, color: C.dark }); });
  return Buffer.from(await doc.save());
}
