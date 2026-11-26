// V43 · Entregas prioritárias chamadas no painel da TV (estilo chamado de hospital).
// Cada projeto pode ter um chamado ativo (project.priorityCall). Entra na fila do dia marcado
// e fica na TV enquanto estiver "aberto" e com "Exibir na TV" ligado.
import type { PriorityCall, Project, State } from "./types";
import { isArchived } from "./flow";

export type CallItem = { p: Project; call: PriorityCall; client: string; clientId: string; queue: number; late: boolean };
export const CALL_STATUS: Record<PriorityCall["status"], string> = { aberto: "Aguardando atendimento", atendimento: "Em atendimento", concluido: "Concluído" };

export function activeCall(p: Project): PriorityCall | null {
  const c = p.priorityCall;
  if (!c || typeof c !== "object" || !c.date || c.status === "concluido") return null;
  return c;
}

/** Fila do dia: chamados abertos/em atendimento com data até hoje, na ordem em que foram abertos. */
export function callQueue(s: State, today: string): CallItem[] {
  const rows = s.projects.filter(p => !isArchived(p)).map(p => ({ p, call: activeCall(p) })).filter((x): x is { p: Project; call: PriorityCall } => !!x.call && x.call.date <= today);
  rows.sort((a, b) => a.call.date.localeCompare(b.call.date) || a.call.createdAt.localeCompare(b.call.createdAt));
  return rows.map((x, i) => ({ ...x, client: s.clients.find(c => c.id === x.p.clientId)?.name || x.p.name, clientId: x.p.clientId, queue: i + 1, late: x.call.date < today }));
}
/** O que a TV chama: só os abertos e marcados para exibir. */
export const tvCalls = (s: State, today: string) => callQueue(s, today).filter(x => x.call.tv && x.call.status === "aberto");
export const callKey = (x: CallItem) => `${x.p.id}|${x.call.createdAt}`;
