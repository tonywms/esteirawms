// V11 · Status report para o cliente: regras compartilhadas (navegador e servidor).
// - quais registros da linha do tempo podem ir ao cliente (nunca escalonamentos, liberações master ou relatórios)
// - montagem final do PDF: relatório + PDFs assinados de cada fase como anexos + rodapé numerado
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Project, TimelineEvent } from "./types";

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
export async function assembleReport(base: Uint8Array, annexCount: number, annexes: (Uint8Array | null)[], footer: string): Promise<Uint8Array> {
  const src = await PDFDocument.load(base);
  const out = await PDFDocument.create();
  out.setTitle(src.getTitle() || "Status report"); out.setAuthor("WMS Expert"); out.setCreator("Esteira de Entregas WMS Expert");
  const total = src.getPageCount(), mainCount = total - annexCount;
  const own: number[] = [];
  const main = await out.copyPages(src, [...Array(mainCount).keys()]);
  main.forEach(pg => { out.addPage(pg); own.push(out.getPageCount() - 1); });
  const font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < annexCount; i++) {
    const [sep] = await out.copyPages(src, [mainCount + i]);
    out.addPage(sep); own.push(out.getPageCount() - 1);
    const bytes = annexes[i];
    let ok = false;
    if (bytes) {
      try {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(doc, doc.getPageIndices());
        pages.forEach(pg => out.addPage(pg)); ok = pages.length > 0;
      } catch { ok = false; }
    }
    if (!ok) sep.drawText("O arquivo deste documento não pôde ser incorporado. Solicite a cópia à WMS Expert.", { x: 42, y: 120, size: 10, font: bold, color: rgb(0.78, 0.2, 0.3) });
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
