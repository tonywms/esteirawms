// V11 · PDF do status report para o cliente (marca WMS Expert, sem informações internas).
// Gera o relatório-base e, no fim, uma capa por anexo (os PDFs assinados entram depois, em assembleReport).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Project, State } from "./types";
import { LOGO_BLUE_PNG, LOGO_BLUE_RATIO } from "./brand-logo";
import { clean, wrap } from "./escalation-pdf";
import { PHASES, ballOf, docStates, phaseIndex, phaseOf, phaseOwner, type DocState } from "./flow";
import { clientText, eventKind, reportEvents, type ReportOptions } from "./status-report";

export type ReportInput = ReportOptions & { summary: string; annex: boolean; requester: string };
export type ReportAnnex = { phase: string; label: string; doc: string; path: string; name: string; at: string };

const C = {
  navy: rgb(0.043, 0.122, 0.2), cyan: rgb(0.063, 0.757, 0.988), teal: rgb(0.043, 0.596, 0.71), ink: rgb(0.09, 0.15, 0.22), ink2: rgb(0.27, 0.35, 0.43), ink3: rgb(0.47, 0.55, 0.62),
  line: rgb(0.86, 0.9, 0.93), soft: rgb(0.955, 0.97, 0.98), green: rgb(0.06, 0.6, 0.41), greenSoft: rgb(0.9, 0.97, 0.94), amber: rgb(0.85, 0.55, 0.07), amberSoft: rgb(1, 0.97, 0.9),
  violet: rgb(0.43, 0.33, 0.85), violetSoft: rgb(0.95, 0.93, 1), white: rgb(1, 1, 1), blue: rgb(0.18, 0.49, 0.88),
};
const W = 595.28, H = 841.89, M = 42, FOOT = 52;
const fmt = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const blank = (v?: string | null) => { const s = (v || "").trim(); return !s || s === "-" || s === "—"; };
const LETTERS = "ABCDEFGHIJ";

export function reportAnnexes(p: Project): ReportAnnex[] {
  return PHASES.filter(ph => ph.doc && p.phases?.[ph.key]?.doc).map(ph => {
    const d = p.phases![ph.key]!.doc!;
    return { phase: ph.key, label: ph.label, doc: ph.doc, path: d.path, name: d.name, at: d.uploadedAt };
  });
}

export async function buildStatusReportBase(s: State, p: Project, input: ReportInput): Promise<{ bytes: Uint8Array; annexes: ReportAnnex[] }> {
  const doc = await PDFDocument.create();
  const client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
  doc.setTitle(`Status report - ${client}`); doc.setAuthor("WMS Expert"); doc.setSubject("Andamento do projeto"); doc.setCreator("Esteira de Entregas WMS Expert");
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(LOGO_BLUE_PNG, "base64"));
  const k = phaseOf(p), idx = phaseIndex(k), docs = docStates(p);
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const annexes = input.annex ? reportAnnexes(p) : [];

  let page!: PDFPage, y = 0;
  const text = (t: string, x: number, yy: number, size = 10, f: PDFFont = font, color: RGB = C.ink) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawImage(logo, { x: M, y: H - 40, width: 18 * LOGO_BLUE_RATIO, height: 18 });
    const t = clean(`Status report · ${client}`); text(t, W - M - bold.widthOfTextAtSize(t, 9), H - 34, 9, bold, C.ink3);
    page.drawLine({ start: { x: M, y: H - 50 }, end: { x: W - M, y: H - 50 }, thickness: 0.6, color: C.line });
    y = H - 74;
  };
  const need = (h: number) => { if (y - h < FOOT + 10) newPage(); };
  const section = (title: string, sub?: string) => {
    need(50); y -= 8;
    page.drawRectangle({ x: M, y: y - 3, width: 3, height: 14, color: C.cyan });
    text(title.toUpperCase(), M + 10, y, 10.5, bold, C.navy);
    if (sub) text(sub, M + 14 + bold.widthOfTextAtSize(clean(title.toUpperCase()), 10.5) + 6, y + 0.5, 8.5, font, C.ink3);
    y -= 20;
  };
  const para = (t: string, size = 9.5, f = font, color = C.ink2, x = M, max = W - 2 * M, lead = 13.5) => { for (const l of wrap(t, f, size, max)) { need(lead); text(l, x, y, size, f, color); y -= lead; } };
  const bullet = (t: string, color = C.cyan) => {
    const lines = wrap(t, font, 9.5, W - 2 * M - 16); need(lines.length * 13.5 + 2);
    page.drawCircle({ x: M + 4, y: y + 3, size: 2.2, color });
    lines.forEach((l, i) => text(l, M + 14, y - i * 13.5, 9.5, font, C.ink2)); y -= lines.length * 13.5 + 3;
  };

  // ---------- Capa ----------
  page = doc.addPage([W, H]);
  page.drawImage(logo, { x: M, y: H - 66, width: 30 * LOGO_BLUE_RATIO, height: 30 });
  const lab = "STATUS REPORT DO PROJETO"; text(lab, W - M - bold.widthOfTextAtSize(lab, 9), H - 46, 9, bold, C.teal);
  const dt = `Emitido em ${today}`; text(dt, W - M - font.widthOfTextAtSize(dt, 8.5), H - 60, 8.5, font, C.ink3);
  const top = H - 92, bh = 118;
  page.drawRectangle({ x: M, y: top - bh, width: W - 2 * M, height: bh, color: C.navy });
  page.drawRectangle({ x: M, y: top - bh, width: W - 2 * M, height: 4, color: C.cyan });
  text("CLIENTE", M + 22, top - 26, 8, bold, C.cyan);
  text(wrap(client, bold, 24, W - 2 * M - 44)[0], M + 22, top - 54, 24, bold, C.white);
  text(`${p.system || "—"}  ·  Etapa atual: ${PHASES[idx].label}`, M + 22, top - 74, 9.5, font, rgb(0.75, 0.86, 0.93));
  const prog = Math.max(0, Math.min(100, k === "fim" ? 100 : p.progress || [5, 25, 50, 70, 90, 100][idx] || 0));
  const bx = M + 22, bw = W - 2 * M - 44 - 60, by = top - 98;
  page.drawRectangle({ x: bx, y: by, width: bw, height: 7, color: rgb(0.16, 0.3, 0.43) });
  page.drawRectangle({ x: bx, y: by, width: (bw * prog) / 100, height: 7, color: C.cyan });
  text(`${prog}%`, bx + bw + 12, by - 1, 12, bold, C.white);
  y = top - bh - 28;

  if (!blank(input.summary)) {
    section("Mensagem da equipe WMS Expert");
    const lines = wrap(input.summary, font, 10.5, W - 2 * M - 30), h = lines.length * 15 + 20; need(h);
    page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: C.soft, borderColor: C.line, borderWidth: 0.6 });
    page.drawRectangle({ x: M, y: y - h + 12, width: 4, height: h, color: C.cyan });
    let yy = y - 4; for (const l of lines) { text(l, M + 18, yy, 10.5, font, C.ink); yy -= 15; }
    y -= h + 8;
  }

  // ---------- Andamento por fase ----------
  section("Andamento por etapa", "documento assinado exigido para concluir cada etapa");
  {
    const cols = [M, M + 150, M + 270, M + 340, M + 410], rowH = 26;
    need(rowH * 6 + 20);
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 18, color: C.soft });
    ["ETAPA", "RESPONSÁVEL", "INÍCIO", "CONCLUSÃO", "DOCUMENTO"].forEach((h, i) => text(h, cols[i] + 8, y, 7.2, bold, C.ink3));
    y -= 22;
    const DS: Record<DocState, [string, RGB, RGB]> = { ok: ["Assinado", C.greenSoft, C.green], waived: ["Dispensado", C.violetSoft, C.violet], sent: ["Aguardando assinatura", C.amberSoft, C.amber], pending: ["Em andamento", C.amberSoft, C.amber], missing: ["Pendente", C.amberSoft, C.amber], skipped: ["Não se aplica", C.soft, C.ink3], future: ["—", C.soft, C.ink3] };
    PHASES.filter(ph => ph.key !== "fim").forEach((ph, i) => {
      const info = p.phases?.[ph.key], d = docs.find(x => x.key === ph.key), st = d?.state || "future";
      const past = i < idx, now = i === idx;
      page.drawCircle({ x: cols[0] + 12, y: y + 3, size: 6, color: past ? C.green : now ? C.cyan : C.white, borderColor: past ? C.green : now ? C.cyan : C.line, borderWidth: 1.2 });
      text(ph.short, cols[0] + 24, y, 9.5, now ? bold : font, now ? C.navy : C.ink);
      if (ph.optional) text("opcional", cols[0] + 24, y - 10, 7, font, C.ink3);
      text(i <= idx ? wrap(phaseOwner(p, ph.key), font, 9, 112)[0] : "—", cols[1] + 8, y, 9, font, C.ink2);
      text(fmt(info?.start), cols[2] + 8, y, 9, font, C.ink2);
      text(past ? fmt(info?.done || p.phases?.[PHASES[i + 1]?.key]?.start) : now ? "em andamento" : "—", cols[3] + 8, y, 9, font, now ? C.teal : C.ink2);
      let [lbl, bg, fg] = DS[st];
      if (st === "ok" && info?.doc) lbl = `Assinado · ${fmt(info.doc.uploadedAt)}`;
      const tw = bold.widthOfTextAtSize(clean(lbl), 7.5) + 12;
      page.drawRectangle({ x: cols[4] + 8, y: y - 4, width: tw, height: 14, color: bg });
      text(lbl, cols[4] + 14, y, 7.5, bold, fg);
      page.drawLine({ start: { x: M, y: y - 10 }, end: { x: W - M, y: y - 10 }, thickness: 0.4, color: C.line });
      y -= rowH;
    });
    y -= 4;
  }

  // ---------- Próximos passos e pendências ----------
  const open = s.tasks.filter(t => t.projectId === p.id && !/conclu|finaliz|cancel/i.test(t.status || ""));
  const isClient = (o?: string) => /cliente/i.test(o || "");
  const ours = open.filter(t => !isClient(t.owner)), theirs = open.filter(t => isClient(t.owner));
  section("Próximos passos");
  if (!blank(p.nextAction)) bullet(`${p.nextAction}${p.nextActionDue ? ` · até ${fmt(p.nextActionDue)}` : ""}`, C.teal);
  ours.slice(0, 10).forEach(t => bullet(`${t.title}${t.owner ? ` · ${t.owner}` : ""}${t.dueDate ? ` · previsão ${fmt(t.dueDate)}` : ""}`));
  if (blank(p.nextAction) && !ours.length) para("Sem próximos passos registrados.", 9.5, font, C.ink3);
  const sent = docs.filter(d => d.state === "sent");
  const clientBlock = ballOf(p) === "Cliente" && !blank(p.blocker);
  if (theirs.length || sent.length || clientBlock) {
    section("O que depende do cliente");
    if (clientBlock) bullet(p.blocker, C.amber);
    sent.forEach(d => bullet(`Assinatura do ${d.doc.toLowerCase()}${p.phases?.[d.key]?.docSentAt ? ` (enviado em ${fmt(p.phases[d.key]!.docSentAt)})` : ""}`, C.amber));
    theirs.slice(0, 10).forEach(t => bullet(`${t.title}${t.dueDate ? ` · até ${fmt(t.dueDate)}` : ""}${blank(t.blocker) ? "" : ` · ${t.blocker}`}`, C.amber));
  }

  // ---------- Datas ----------
  section("Datas-chave");
  {
    const dates: [string, string][] = [["Marco inicial", fmt(p.initialMilestone)], ["Entrega da integração", fmt(p.integrationDelivery)], ["Homologação", fmt(p.homologationDate)], ["Início da implantação", fmt(p.implementationStart)], ["Go-live", fmt(p.goLiveDate)], ["Última atualização", fmt(p.lastMovement || p.updatedAt)]];
    const cw = (W - 2 * M) / 3; need(72);
    dates.forEach(([l, v], i) => {
      const x = M + (i % 3) * cw, yy = y - Math.floor(i / 3) * 34;
      page.drawRectangle({ x, y: yy - 20, width: cw - 8, height: 30, color: C.soft, borderColor: C.line, borderWidth: 0.5 });
      text(l.toUpperCase(), x + 9, yy, 6.8, bold, C.ink3); text(v, x + 9, yy - 13, 10.5, bold, C.ink);
    });
    y -= 76;
  }

  // ---------- Histórico ----------
  const evs = reportEvents(p, input);
  section("Histórico do projeto", `${evs.length} registro(s)${input.since ? ` desde ${fmt(input.since)}` : ""}`);
  if (!evs.length) para("Sem registros no período selecionado.", 9.5, font, C.ink3);
  const KC: Record<string, RGB> = { fase: C.navy, doc: C.green, atividade: C.blue, agenda: C.teal, nota: C.ink3 };
  for (const e of evs) {
    const lines = wrap(clientText(e.text), font, 9.2, W - 2 * M - 92);
    need(lines.length * 12.5 + 8);
    page.drawCircle({ x: M + 4, y: y + 3, size: 2.6, color: KC[eventKind(e.kind)] || C.ink3 });
    text(new Date(e.at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), M + 14, y, 8.2, bold, C.ink2);
    lines.forEach((l, i) => text(l, M + 92, y - i * 12.5, 9.2, font, C.ink));
    y -= lines.length * 12.5 + 6;
  }

  // ---------- Índice de anexos ----------
  if (input.annex) {
    section("Documentos assinados anexados", annexes.length ? `${annexes.length} documento(s) a seguir` : "nenhum documento anexado até o momento");
    annexes.forEach((a, i) => bullet(`Anexo ${LETTERS[i]} — ${a.doc} (${a.label}) · ${a.name} · anexado em ${fmt(a.at)}`, C.green));
    const waived = docs.filter(d => d.state === "waived");
    waived.forEach(d => bullet(`${d.doc}: dispensado (${p.phases?.[d.key]?.docWaived?.reason || "etapa validada sem documento"})`, C.violet));
  }

  // ---------- Capas dos anexos ----------
  annexes.forEach((a, i) => {
    page = doc.addPage([W, H]);
    page.drawImage(logo, { x: M, y: H - 66, width: 30 * LOGO_BLUE_RATIO, height: 30 });
    page.drawRectangle({ x: M, y: H / 2 - 70, width: W - 2 * M, height: 150, color: C.navy });
    page.drawRectangle({ x: M, y: H / 2 - 70, width: W - 2 * M, height: 4, color: C.cyan });
    text(`ANEXO ${LETTERS[i]}`, M + 26, H / 2 + 46, 10, bold, C.cyan);
    text(a.doc, M + 26, H / 2 + 14, 22, bold, C.white);
    text(`Etapa: ${a.label}  ·  ${client}`, M + 26, H / 2 - 12, 10, font, rgb(0.75, 0.86, 0.93));
    text(`Arquivo: ${a.name}  ·  anexado em ${fmt(a.at)}`, M + 26, H / 2 - 34, 9, font, rgb(0.75, 0.86, 0.93));
    text("O documento assinado segue nas próximas páginas.", M, H / 2 - 110, 10, font, C.ink2);
  });
  return { bytes: await doc.save(), annexes };
}
