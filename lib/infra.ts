// V28 · Checklist de infraestrutura: status de cada item, pendência (o quê, quem, até quando) e validação.
// Os 4 itens básicos continuam em `readiness` ("Sim" | "Pendente" | "Não" | "Não Aplica") — o painel usa;
// os detalhes e os itens extras ficam em `infra`.
import type { InfraItem, Project } from "./types";

export const BASE_ITEMS = [
  { id: "connectivity", label: "Conectividade", hint: "Internet/rede no CD, acesso ao servidor" },
  { id: "collectors", label: "Coletores", hint: "Coletores comprados, configurados e com o app" },
  { id: "testBase", label: "Base de testes", hint: "Ambiente de homologação disponível" },
  { id: "keyUser", label: "Usuário-chave", hint: "Pessoa do cliente definida e treinada" },
] as const;
export const STATUS = [
  { v: "Sim", label: "OK", tone: "ok" },
  { v: "Pendente", label: "Pendente", tone: "pend" },
  { v: "Não", label: "Não tem", tone: "no" },
  { v: "Não Aplica", label: "Não se aplica", tone: "na" },
] as const;
export const KINDS = ["Compra", "Configuração", "Instalação", "Teste", "Cliente providenciar", "Liberação de acesso"];

export type Row = InfraItem & { base: boolean; status: string };
export function infraRows(p: Project): Row[] {
  const r = (p.readiness || {}) as unknown as Record<string, string>, det = p.infra?.items || {};
  const base = BASE_ITEMS.map(b => ({ ...(det[b.id] || {}), id: b.id, label: b.label, status: r[b.id] || "", base: true }));
  const extra = (p.infra?.extra || []).map(x => ({ ...x, status: x.status || "", base: false }));
  return [...base, ...extra];
}
export const isOpen = (s?: string) => s === "Pendente" || s === "Não";
export function infraSummary(p: Project) {
  const rows = infraRows(p);
  const pending = rows.filter(x => isOpen(x.status));
  const unanswered = rows.filter(x => !x.status);
  const ok = rows.filter(x => x.status === "Sim" || x.status === "Não Aplica");
  const validated = !!p.infra?.validatedAt && !pending.length;
  return { rows, pending, unanswered, ok, validated, total: rows.length };
}
export const pendText = (x: InfraItem) => `${x.label}${x.kind || x.note ? ` (${[x.kind, x.note].filter(Boolean).join(": ")})` : ""}`;
