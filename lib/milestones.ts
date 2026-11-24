// V35 · Situação de cada marco da "Jornada do projeto": feito (verde), pendente (laranja), atrasado/impedido (vermelho).
import type { Project } from "./types";
import { phaseIndex, phaseOf, type PhaseKey } from "./flow";
import { isBlocked, todayISO } from "./metrics";

const MS: Record<string, { phase: PhaseKey; reached: "start" | "done" }> = {
  "Marco inicial": { phase: "kickoff", reached: "start" },
  "Entrega integração": { phase: "dev", reached: "done" },
  "Início implantação": { phase: "campo", reached: "start" },
  "Homologação": { phase: "homolog", reached: "done" },
  "Go-live": { phase: "golive", reached: "start" },
};
export type MsState = "ok" | "pend" | "late" | "none";
export function milestoneState(p: Project, label: string | null, date?: string | null, today = todayISO()): { state: MsState; hint: string } {
  const m = MS[label || ""]; const d = date ? String(date).slice(0, 10) : "";
  if (!m) return { state: d ? "pend" : "none", hint: "" };
  const ci = phaseIndex(phaseOf(p)), mi = phaseIndex(m.phase);
  const reached = m.reached === "start" ? ci >= mi : ci > mi;
  if (reached) return { state: "ok", hint: "Concluído pela esteira" };
  const blocked = isBlocked(p.status) || /[a-z0-9]/i.test(p.blocker || "");
  if (d && d < today) return { state: "late", hint: "Data passou e a etapa ainda não foi concluída" };
  if (blocked && ci === mi - (m.reached === "start" ? 1 : 0)) return { state: "late", hint: "Etapa com impedimento" };
  return { state: d ? "pend" : "none", hint: d ? "Pendente (data prevista)" : "Pendente · data não informada" };
}
