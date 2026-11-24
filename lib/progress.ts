// V34 · Avanço (%) automático do projeto.
// 1) Cronograma salvo → atividades concluídas ÷ atividades do cronograma (as contínuas, "-", não contam).
//    Atividades de um bloco cuja fase da esteira já passou contam como feitas (ex.: projeto em Homologação →
//    a integração terminou, mesmo que ninguém tenha marcado ✓).
// 2) Sem cronograma → pela fase da esteira (início da fase + meio caminho se o PDF da fase já foi anexado).
// 3) Fluxo simplificado (customização) → só Homologação e Go-live contam.
// 4) "Manual" → vale o número digitado no projeto.
import type { Project, State } from "./types";
import { docOf, isSimpleFlow, phaseIndex, phaseOf, type PhaseKey } from "./flow";
import { isDone } from "./metrics";

export type ProgressInfo = { pct: number; source: "cronograma" | "fases" | "manual" | "encerrado"; detail: string; done?: number; total?: number; implied?: number };

const FULL: Record<PhaseKey, number> = { kickoff: 5, dev: 20, homolog: 45, campo: 65, golive: 85, fim: 100 };
const SIMPLE: Record<PhaseKey, number> = { kickoff: 0, dev: 0, homolog: 10, campo: 55, golive: 60, fim: 100 };
const NEXT_FULL: Record<PhaseKey, PhaseKey> = { kickoff: "dev", dev: "homolog", homolog: "campo", campo: "golive", golive: "fim", fim: "fim" };
const NEXT_SIMPLE: Record<PhaseKey, PhaseKey> = { kickoff: "homolog", dev: "homolog", homolog: "golive", campo: "golive", golive: "fim", fim: "fim" };
/** Bloco do cronograma → fase da esteira em que ele termina. */
const GROUP_PHASE: Record<string, PhaseKey> = { formacao: "kickoff", integracao: "dev", golive: "golive" };

const scheduleSaved = (p: Project) => !!(p.schedule && Array.isArray(p.schedule.rows) && p.schedule.rows.length && p.schedule.updatedAt);

export function progressInfo(p: Project): ProgressInfo {
  const k = phaseOf(p);
  if (k === "fim" || isDone(p.status)) return { pct: 100, source: "encerrado", detail: "projeto encerrado" };
  if (p.progressMode === "manual") return { pct: clamp(p.progress), source: "manual", detail: "definido manualmente no projeto" };
  if (scheduleSaved(p)) {
    const rows = p.schedule!.rows.filter(r => !r.continuous && (r.activity || "").trim());
    if (rows.length) {
      const ki = phaseIndex(k);
      let done = 0, implied = 0;
      for (const r of rows) {
        if (r.done) { done++; continue; }
        const gp = GROUP_PHASE[r.group]; if (gp && phaseIndex(gp) < ki) implied++;
      }
      const pct = Math.min(99, Math.round(((done + implied) / rows.length) * 100));
      return { pct, source: "cronograma", detail: `${done + implied} de ${rows.length} atividades do cronograma${implied ? ` (${implied} pela fase da esteira)` : ""}`, done, total: rows.length, implied };
    }
  }
  const simple = isSimpleFlow(p), base = simple ? SIMPLE : FULL, next = (simple ? NEXT_SIMPLE : NEXT_FULL)[k];
  const half = docOf(p, k) ? (base[next] - base[k]) / 2 : 0;
  return { pct: Math.min(99, Math.round(base[k] + half)), source: "fases", detail: `pela fase da esteira${half ? " (PDF da fase anexado)" : ""}${simple ? " · fluxo simplificado" : ""}` };
}
const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/** Grava o avanço automático em todos os projetos (o que é lido por todas as telas, e-mails, TV e relatórios). */
export function applyAutoProgress(s: State) {
  for (const p of s.projects) { const v = progressInfo(p).pct; if (p.progress !== v) p.progress = v; }
  return s;
}
