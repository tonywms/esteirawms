// V11 · Status report para o cliente: regras compartilhadas (navegador e servidor).
// - quais registros da linha do tempo podem ir ao cliente (nunca escalonamentos, liberações master ou relatórios)
// - montagem final do PDF: relatório + PDFs assinados de cada fase como anexos + rodapé numerado
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Project, Task, TaskAttachment, TimelineEvent } from "./types";

export const REPORT_KINDS = [
  { key: "fase", label: "Fases" },
  { key: "doc", label: "Documentos" },
  { key: "atividade", label: "Atividades" },
  { key: "agenda", label: "Agenda" },
  { key: "nota", label: "Notas" },
] as const;
export const DEFAULT_REPORT_KINDS = ["fase", "doc", "atividade", "agenda"];
const NEVER = new Set(["escalonamento", "master", "report"]);
const kindOf = (k?: string) => (k && REPORT_KINDS.some(x => x.key === k) ? k : NEVER.has(k || "") ? k! : "nota");

/** Texto do registro pronto para o cliente (sem marcações internas). */
export const clientText = (t: string) => t.replace(/\s*\((registrado pela auditoria|registro histórico)\)/g, "").replace(/\s{2,}/g, " ").trim();

export type ReportOptions = { kinds?: string[]; since?: string | null; exclude?: string[] };
export function reportEvents(p: Project, o: ReportOptions = {}): TimelineEvent[] {
  const kinds = new Set(o.kinds?.length ? o.kinds : DEFAULT_REPORT_KINDS), ex = new Set(o.exclude || []);
  return [...(p.timeline || [])]
    .filter(e => !NEVER.has(kindOf(e.kind)) && kinds.has(kindOf(e.kind)) && !ex.has(e.id) && (!o.since || String(e.at).slice(0, 10) >= o.since))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
export const eventKind = kindOf;

/**
 * Junta o relatório-base (que termina com uma página de capa por anexo) com os PDFs assinados.
 * Resultado: páginas do relatório → [capa do anexo A + PDF A] → [capa B + PDF B] ... com rodapé numerado
 * nas páginas do relatório e nas capas (os PDFs assinados ficam intactos).
 */
/** Anexos das atividades do projeto (fotos e PDFs), com o nome da atividade para a legenda. */
export type ProjectFile = TaskAttachment & { taskId: string; taskTitle: string };
export const projectFiles = (p: Project, tasks: Task[]): ProjectFile[] =>
  tasks.filter(t => t.projectId === p.id).flatMap(t => (t.attachments || []).map(a => ({ ...a, taskId: t.id, taskTitle: t.title })))
    .sort((a, b) => String(a.uploadedAt).localeCompare(String(b.uploadedAt)));
export type ReportPhoto = { bytes: Uint8Array | null; caption: string };
const WIN = /[^\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ\n]/g;
const safe = (t: string) => t.replace(/→/g, "->").replace(WIN, "");

export async function assembleReport(base: Uint8Array, annexCount: number, annexes: (Uint8Array | null)[], footer: string, photos: ReportPhoto[] = [], photoTitle = "Registros fotográficos"): Promise<Uint8Array> {
  const src = await PDFDocument.load(base);
  const out = await PDFDocument.create();
  out.setTitle(src.getTitle() || "Status report"); out.setAuthor("WMS Expert"); out.setCreator("Esteira de Entregas WMS Expert");
  const total = src.getPageCount(), mainCount = total - annexCount;
  const own: number[] = [];
  const main = await out.copyPages(src, [...Array(mainCount).keys()]);
  main.forEach(pg => { out.addPage(pg); own.push(out.getPageCount() - 1); });
  const font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold);
  // Fotos: 2 por página, com legenda (atividade · data · arquivo)
  const ok = photos.filter(f => f.bytes);
  for (let i = 0; i < ok.length; i += 2) {
    const pg = out.addPage([595.28, 841.89]); own.push(out.getPageCount() - 1);
    pg.drawRectangle({ x: 42, y: 785, width: 3, height: 14, color: rgb(0.063, 0.757, 0.988) });
    pg.drawText(safe(`${photoTitle.toUpperCase()}${ok.length > 2 ? ` (${Math.floor(i / 2) + 1}/${Math.ceil(ok.length / 2)})` : ""}`), { x: 52, y: 788, size: 10.5, font: bold, color: rgb(0.043, 0.122, 0.2) });
    for (let j = 0; j < 2 && i + j < ok.length; j++) {
      const f = ok[i + j], top = 765 - j * 360, boxW = 511, boxH = 300;
      pg.drawRectangle({ x: 42, y: top - boxH, width: boxW, height: boxH, color: rgb(0.955, 0.97, 0.98), borderColor: rgb(0.86, 0.9, 0.93), borderWidth: 0.6 });
      try {
        const b = f.bytes!, png = b[0] === 0x89 && b[1] === 0x50;
        const img = png ? await out.embedPng(b) : await out.embedJpg(b);
        const k = Math.min((boxW - 16) / img.width, (boxH - 16) / img.height);
        const w = img.width * k, h = img.height * k;
        pg.drawImage(img, { x: 42 + (boxW - w) / 2, y: top - boxH + (boxH - h) / 2, width: w, height: h });
      } catch { pg.drawText("Foto indisponível", { x: 60, y: top - boxH / 2, size: 10, font: bold, color: rgb(0.78, 0.2, 0.3) }); }
      pg.drawText(safe(f.caption).slice(0, 110), { x: 42, y: top - boxH - 16, size: 9, font, color: rgb(0.27, 0.35, 0.43) });
    }
  }
  for (let i = 0; i < annexCount; i++) {
    const [sep] = await out.copyPages(src, [mainCount + i]);
    out.addPage(sep); own.push(out.getPageCount() - 1);
    const bytes = annexes[i];
    let done = false;
    if (bytes) {
      try {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(doc, doc.getPageIndices());
        pages.forEach(pg => out.addPage(pg)); done = pages.length > 0;
      } catch { done = false; }
    }
    if (!done) sep.drawText("O arquivo deste documento não pôde ser incorporado. Solicite a cópia à WMS Expert.", { x: 42, y: 120, size: 10, font: bold, color: rgb(0.78, 0.2, 0.3) });
  }
  const n = out.getPageCount();
  for (const idx of own) {
    const pg = out.getPage(idx), { width } = pg.getSize();
    pg.drawLine({ start: { x: 42, y: 40 }, end: { x: width - 42, y: 40 }, thickness: 0.6, color: rgb(0.86, 0.9, 0.93) });
    pg.drawText(footer, { x: 42, y: 26, size: 7.5, font, color: rgb(0.47, 0.55, 0.62) });
    const t = `Página ${idx + 1} de ${n}`;
    pg.drawText(t, { x: width - 42 - bold.widthOfTextAtSize(t, 7.5), y: 26, size: 7.5, font: bold, color: rgb(0.27, 0.35, 0.43) });
  }
  return out.save();
}
