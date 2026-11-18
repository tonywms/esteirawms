// V9 · PDF de escalonamento (histórico do projeto com a marca WMS Expert).
// Gerado no servidor com pdf-lib: funciona na Vercel, sem navegador e sem arquivos externos.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Project, State } from "./types";
import { LOGO_BLUE_PNG, LOGO_BLUE_RATIO } from "./brand-logo";
import { PHASES, ballOf, docStates, healthLabel, healthOf, phaseIndex, phaseOf, phaseOwner, type DocState } from "./flow";

export type EscalationInput = { message: string; urgency: string; requester: string; requesterEmail?: string; recipients: { name: string; email: string; sector?: string }[] };

const C = {
  navy: rgb(0.043, 0.122, 0.2), navy2: rgb(0.067, 0.18, 0.29), cyan: rgb(0.063, 0.757, 0.988), teal: rgb(0.043, 0.596, 0.71),
  ink: rgb(0.09, 0.15, 0.22), ink2: rgb(0.27, 0.35, 0.43), ink3: rgb(0.47, 0.55, 0.62), line: rgb(0.86, 0.9, 0.93), soft: rgb(0.955, 0.97, 0.98),
  red: rgb(0.878, 0.278, 0.373), redSoft: rgb(1, 0.94, 0.95), amber: rgb(0.85, 0.55, 0.07), amberSoft: rgb(1, 0.97, 0.9),
  green: rgb(0.06, 0.6, 0.41), greenSoft: rgb(0.9, 0.97, 0.94), violet: rgb(0.43, 0.33, 0.85), white: rgb(1, 1, 1), grey: rgb(0.7, 0.75, 0.8),
};
const W = 595.28, H = 841.89, M = 42, FOOT = 46;

// WinAnsi (fontes padrão do PDF): troca símbolos que não existem nela.
const MAP: Record<string, string> = { "→": "->", "←": "<-", "✓": "OK", "✕": "X", "≥": ">=", "≤": "<=", "…": "...", " ": " ", "\t": " " };
const WIN = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const clean = (v: unknown) => [...String(v ?? "")].map(ch => MAP[ch] ?? ch).join("").split("").filter(ch => { const c = ch.charCodeAt(0); return ch === "\n" || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN.has(ch); }).join("");
const fmt = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtDT = (d?: string | null) => { if (!d) return "—"; const x = new Date(d); return Number.isNaN(x.getTime()) ? fmt(d) : x.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= max) { line = tryLine; continue; }
      if (line) out.push(line);
      let w = word;
      while (font.widthOfTextAtSize(w, size) > max) { let i = w.length; while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > max) i--; out.push(w.slice(0, i)); w = w.slice(i); }
      line = w;
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

export async function buildEscalationPdf(s: State, p: Project, input: EscalationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
  doc.setTitle(`Escalonamento - ${client}`); doc.setAuthor("WMS Expert"); doc.setSubject("Histórico do projeto e entrave atual"); doc.setCreator("Esteira de Entregas WMS Expert");
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(LOGO_BLUE_PNG, "base64"));
  const h = healthOf(p, undefined, s.tasks), k = phaseOf(p), idx = phaseIndex(k), docs = docStates(p);
  const generated = fmtDT(new Date().toISOString());

  let page!: PDFPage, y = 0;
  const text = (t: string, x: number, yy: number, size = 10, f: PDFFont = font, color: RGB = C.ink) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const newPage = (first = false) => {
    page = doc.addPage([W, H]);
    if (first) return;
    page.drawImage(logo, { x: M, y: H - 40, width: 18 * LOGO_BLUE_RATIO, height: 18 });
    text(`Escalonamento · ${client}`, W - M - bold.widthOfTextAtSize(clean(`Escalonamento · ${client}`), 9), H - 34, 9, bold, C.ink3);
    page.drawLine({ start: { x: M, y: H - 50 }, end: { x: W - M, y: H - 50 }, thickness: 0.6, color: C.line });
    y = H - 72;
  };
  const need = (hgt: number) => { if (y - hgt < FOOT + 10) newPage(); };
  const section = (title: string, sub?: string) => {
    need(46); y -= 8;
    page.drawRectangle({ x: M, y: y - 3, width: 3, height: 14, color: C.cyan });
    text(title.toUpperCase(), M + 10, y, 10.5, bold, C.navy);
    if (sub) text(sub, M + 12 + bold.widthOfTextAtSize(clean(title.toUpperCase()), 10.5) + 8, y + 0.5, 8.5, font, C.ink3);
    y -= 18;
  };
  const para = (t: string, size = 9.5, f = font, color = C.ink2, x = M, max = W - 2 * M, lead = 13.5) => {
    for (const l of wrap(t, f, size, max)) { need(lead); text(l, x, y, size, f, color); y -= lead; }
  };
  const pill = (label: string, x: number, yy: number, bg: RGB, fg: RGB, size = 8) => {
    const tw = bold.widthOfTextAtSize(clean(label), size), w = tw + 14;
    page.drawRectangle({ x, y: yy - 4, width: w, height: size + 8, color: bg, borderColor: bg, borderWidth: 0 });
    text(label, x + 7, yy, size, bold, fg); return w;
  };

  // ---------- Capa / cabeçalho ----------
  newPage(true);
  page.drawImage(logo, { x: M, y: H - 66, width: 30 * LOGO_BLUE_RATIO, height: 30 });
  const lab = "RELATÓRIO DE ESCALONAMENTO";
  text(lab, W - M - bold.widthOfTextAtSize(clean(lab), 9), H - 46, 9, bold, C.teal);
  const gen = `Gerado em ${generated}`;
  text(gen, W - M - font.widthOfTextAtSize(clean(gen), 8.5), H - 60, 8.5, font, C.ink3);

  const bandTop = H - 92, bandH = 112;
  page.drawRectangle({ x: M, y: bandTop - bandH, width: W - 2 * M, height: bandH, color: C.navy });
  page.drawRectangle({ x: W - M - 150, y: bandTop - bandH, width: 150, height: bandH, color: C.navy2 });
  page.drawRectangle({ x: M, y: bandTop - bandH, width: W - 2 * M, height: 4, color: C.cyan });
  text("CLIENTE", M + 22, bandTop - 26, 8, bold, C.cyan);
  const cname = wrap(client, bold, 24, W - 2 * M - 200)[0];
  text(cname, M + 22, bandTop - 54, 24, bold, C.white);
  text(`${p.system || "—"}  ·  ${p.wave || "Sem onda"}  ·  Fase: ${PHASES[idx].label}`, M + 22, bandTop - 74, 9.5, font, rgb(0.75, 0.86, 0.93));
  const hc = h.health === "red" ? C.red : h.health === "amber" ? C.amber : h.health === "green" ? C.green : C.grey;
  let px = M + 22; px += pill(healthLabel[h.health].toUpperCase(), px, bandTop - 96, hc, C.white) + 6;
  px += pill(`URGÊNCIA ${clean(input.urgency || "Alta").toUpperCase()}`, px, bandTop - 96, input.urgency === "Alta" || input.urgency === "Crítica" ? C.red : C.amber, C.white) + 6;
  pill(`BOLA COM ${ballOf(p).toUpperCase()}`, px, bandTop - 96, rgb(0.16, 0.3, 0.43), C.white);
  const kx = W - M - 128;
  text("DIAS NA FASE", kx, bandTop - 26, 7.5, bold, C.cyan); text(String(h.inPhase ?? "—"), kx, bandTop - 52, 22, bold, C.white);
  text("SEM MOVIMENTO", kx, bandTop - 70, 7.5, bold, C.cyan); text(`${h.idle ?? "—"} dias`, kx, bandTop - 92, 15, bold, C.white);
  y = bandTop - bandH - 26;

  // ---------- Pedido ----------
  section("Pedido de intervenção", `por ${input.requester}${input.requesterEmail ? ` <${input.requesterEmail}>` : ""}`);
  {
    const lines = wrap(input.message || "—", font, 10.5, W - 2 * M - 30);
    const bh = lines.length * 15 + 20; need(bh);
    page.drawRectangle({ x: M, y: y - bh + 12, width: W - 2 * M, height: bh, color: C.soft, borderColor: C.line, borderWidth: 0.6 });
    page.drawRectangle({ x: M, y: y - bh + 12, width: 4, height: bh, color: C.cyan });
    let yy = y - 4; for (const l of lines) { text(l, M + 18, yy, 10.5, font, C.ink); yy -= 15; }
    y -= bh + 8;
  }

  // ---------- Entrave ----------
  section("Entrave atual");
  {
    const rows: [string, string][] = [
      ["Empecilho", (p.blocker || "").trim() && p.blocker !== "-" ? p.blocker : "Não informado"],
      ["Com quem está a bola", ballOf(p)],
      ["Dono da fase", phaseOwner(p)],
      ["Próxima ação", p.nextAction ? `${p.nextAction}${p.nextActionOwner ? ` · ${p.nextActionOwner}` : ""}${p.nextActionDue ? ` · até ${fmt(p.nextActionDue)}` : ""}` : "Sem próxima ação definida"],
      ["Status", p.status || "—"],
    ];
    const reasons = h.reasons.filter(r => !r.startsWith("Empecilho"));
    const lineSets = rows.map(([, v]) => wrap(v, font, 9.5, W - 2 * M - 170));
    const bh = lineSets.reduce((n, l) => n + l.length * 13 + 8, 0) + (reasons.length ? reasons.length * 13 + 4 : 0) + 14;
    need(bh);
    page.drawRectangle({ x: M, y: y - bh + 12, width: W - 2 * M, height: bh, color: C.redSoft, borderColor: rgb(0.97, 0.8, 0.84), borderWidth: 0.6 });
    let yy = y - 4;
    rows.forEach(([l], i) => {
      text(l.toUpperCase(), M + 16, yy, 7.5, bold, C.red);
      for (const ln of lineSets[i]) { text(ln, M + 150, yy, 9.5, i === 0 ? bold : font, C.ink); yy -= 13; }
      yy -= 8;
    });
    if (reasons.length) { text("SINAIS DO SEMÁFORO", M + 16, yy, 7.5, bold, C.red); for (const r of reasons) { text(`•  ${r}`, M + 150, yy, 9, font, C.ink2); yy -= 13; } }
    y -= bh + 8;
  }

  // ---------- Esteira e documentos ----------
  section("Esteira e documentos", "PDF assinado exigido para avançar cada fase");
  {
    need(92);
    const steps = PHASES.filter(x => x.key !== "fim"), n = steps.length, gap = (W - 2 * M) / n, cy = y - 14;
    page.drawLine({ start: { x: M + gap / 2, y: cy }, end: { x: M + gap * (n - 0.5), y: cy }, thickness: 2, color: C.line });
    const doneW = Math.min(idx, n - 1); if (doneW > 0) page.drawLine({ start: { x: M + gap / 2, y: cy }, end: { x: M + gap * (doneW + 0.5), y: cy }, thickness: 2, color: C.cyan });
    const DS: Record<DocState, [string, RGB, RGB]> = { ok: ["PDF OK", C.greenSoft, C.green], waived: ["LIBERADO", rgb(0.94, 0.92, 1), C.violet], sent: ["ASSINATURA", C.amberSoft, C.amber], pending: ["FALTA PDF", C.redSoft, C.red], missing: ["FALTA PDF", C.redSoft, C.red], skipped: ["NÃO USADA", C.soft, C.ink3], future: ["—", C.soft, C.ink3] };
    steps.forEach((st, i) => {
      const cx = M + gap * (i + 0.5), past = i < idx, now = i === idx;
      page.drawCircle({ x: cx, y: cy, size: 11, color: past ? C.cyan : now ? C.navy : C.white, borderColor: past || now ? C.navy : C.line, borderWidth: 1.4 });
      const num = String(i + 1); text(num, cx - bold.widthOfTextAtSize(num, 9) / 2, cy - 3.2, 9, bold, past || now ? C.white : C.ink3);
      const lbl = wrap(st.short, bold, 8.5, gap - 8); lbl.forEach((l, j) => text(l, cx - bold.widthOfTextAtSize(l, 8.5) / 2, cy - 26 - j * 10, 8.5, bold, now ? C.navy : C.ink2));
      const d = docs.find(x => x.key === st.key); const [dl, bg, fg] = DS[d?.state || "future"];
      const tw = bold.widthOfTextAtSize(dl, 7) + 12; const by = cy - 34 - lbl.length * 10;
      page.drawRectangle({ x: cx - tw / 2, y: by - 4, width: tw, height: 13, color: bg });
      text(dl, cx - tw / 2 + 6, by, 7, bold, fg);
      if (st.optional) text("opcional", cx - font.widthOfTextAtSize("opcional", 7) / 2, by - 13, 7, font, C.ink3);
    });
    y -= 92;
    const waived = docs.filter(d => d.state === "waived");
    for (const d of waived) { const w = p.phases?.[d.key]?.docWaived; if (w) para(`${d.doc}: liberado sem PDF por ${w.by} em ${fmt(w.at)} · ${w.reason}`, 8.5, font, C.violet); }
  }

  // ---------- Datas ----------
  section("Datas-chave");
  {
    const dates: [string, string][] = [["Marco inicial", fmt(p.initialMilestone)], ["Entrega da integração", fmt(p.integrationDelivery)], ["Homologação", fmt(p.homologationDate)], ["Início da implantação", fmt(p.implementationStart)], ["Go-live previsto", fmt(p.goLiveDate)], ["Última movimentação", fmt(p.lastMovement)]];
    const cw = (W - 2 * M) / 3; need(70);
    dates.forEach(([l, v], i) => {
      const x = M + (i % 3) * cw, yy = y - Math.floor(i / 3) * 34;
      page.drawRectangle({ x, y: yy - 20, width: cw - 8, height: 30, color: C.soft, borderColor: C.line, borderWidth: 0.5 });
      text(l.toUpperCase(), x + 9, yy, 6.8, bold, C.ink3); text(v, x + 9, yy - 13, 10.5, bold, C.ink);
    });
    y -= 76;
  }

  // ---------- Linha do tempo ----------
  const tl = [...(p.timeline || [])].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 400);
  section("Histórico do projeto", `${tl.length} registro(s), do mais recente ao mais antigo`);
  if (!tl.length) para("Sem registros na linha do tempo.", 9.5, font, C.ink3);
  for (const e of tl) {
    const lines = wrap(e.text, font, 9.2, W - 2 * M - 128);
    need(lines.length * 12.5 + 10);
    const top = y;
    page.drawCircle({ x: M + 4, y: top + 3, size: 2.6, color: e.kind === "master" ? C.violet : e.kind === "escalonamento" ? C.red : e.kind === "doc" ? C.green : e.kind === "atividade" ? rgb(0.18, 0.49, 0.88) : e.kind === "agenda" ? C.teal : e.kind === "fase" ? C.navy : C.grey });
    text(fmtDT(e.at), M + 14, top, 8.2, bold, C.ink2);
    if (e.author) text(wrap(e.author, font, 7.5, 100)[0], M + 14, top - 10, 7.5, font, C.ink3);
    lines.forEach((l, i) => text(l, M + 128, top - i * 12.5, 9.2, font, C.ink));
    y = top - Math.max(lines.length * 12.5, e.author ? 20 : 12.5) - 6;
    page.drawLine({ start: { x: M + 128, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.4, color: C.line });
    y -= 4;
  }

  // ---------- Atividades e agenda ----------
  const tasks = s.tasks.filter(t => t.projectId === p.id && !/conclu|cancel/i.test(t.status));
  if (tasks.length) {
    section("Atividades abertas", `${tasks.length}`);
    for (const t of tasks.slice(0, 25)) para(`•  ${t.title} — ${t.owner || "sem responsável"} · prazo ${fmt(t.dueDate)} · ${t.status}${t.blocker && t.blocker !== "-" ? ` · empecilho: ${t.blocker}` : ""}`, 9, font, C.ink2);
  }
  const apps = s.appointments.filter(a => a.projectId === p.id && a.status !== "Cancelado").sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);
  if (apps.length) {
    section("Agenda de consultores", "últimas e próximas visitas");
    for (const a of apps) para(`•  ${fmt(a.date)} · ${a.shift} · ${a.consultant} — ${a.title} (${a.status})`, 9, font, C.ink2);
  }

  // ---------- Destinatários ----------
  if (input.recipients.length) {
    section("Enviado para");
    para(input.recipients.map(r => `${r.name}${r.sector ? ` (${r.sector})` : ""} <${r.email}>`).join("   ·   "), 9, font, C.ink2);
  }

  // ---------- Rodapé ----------
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: FOOT - 6 }, end: { x: W - M, y: FOOT - 6 }, thickness: 0.6, color: C.line });
    pg.drawText(clean(`WMS Expert · Esteira de Entregas · Documento interno gerado em ${generated} por ${input.requester}`), { x: M, y: FOOT - 20, size: 7.5, font, color: C.ink3 });
    const pn = `Página ${i + 1} de ${pages.length}`;
    pg.drawText(clean(pn), { x: W - M - bold.widthOfTextAtSize(clean(pn), 7.5), y: FOOT - 20, size: 7.5, font: bold, color: C.ink2 });
  });
  return doc.save();
}
