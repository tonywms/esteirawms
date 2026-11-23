// V29 · Cronograma do projeto (modelo "Escopo de implantação · 06 Planejamento").
// Todo projeto novo começa com estas linhas, iguais ao documento padrão; só mudam datas e responsáveis.
import type { Client, ClientInfo, ClientPerson, ProjectSchedule, ScheduleRow } from "./types";

export const GROUPS = [
  { key: "formacao", label: "Formação Expert", color: "#0d1f33" },
  { key: "integracao", label: "Integração", color: "#1b8fc6" },
  { key: "golive", label: "Go live", color: "#1d6aa0" },
] as const;
export const groupLabel = (k: string) => GROUPS.find(g => g.key === k)?.label || k;

type T = [group: string, phase: string, activity: string, expert: string, expertHrs: string, client: string, clientHrs: string, highlight?: boolean, continuous?: boolean];
const TEMPLATE: T[] = [
  ["formacao", "Planejamento", "Reunião de Kickoff e envio do playbook", "Analista comercial", "", "Time cliente (5p)", ""],
  ["formacao", "Planejamento", "Apresentação e ativação do software Wms Expert", "Analista comercial", "", "Time cliente (4p)", ""],
  ["formacao", "Treinamento de cadastros", "Treinamento de cadastros", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamento de cadastros", "Treinamento de endereçamento", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Cadastros", "Homologação do cadastro de embalagens", "-", "", "Key users (2)", "", true],
  ["formacao", "Cadastros", "Cadastro e colagem das etiquetas de endereço", "-", "", "Key users (2)", "", true],
  ["formacao", "Cadastros", "Endereçamento de produtos", "-", "", "Key users (2)", "", true],
  ["formacao", "Acompanhamento", "Dúvidas e alinhamentos", "Consultor Expert", "", "Time cliente (1p)", "", true, true],
  ["formacao", "Treinamentos Wms", "Treinamento de consultas no coletor", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de recepção - conferência", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de recepção - armazenagem", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de movimentações - simples", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de movimentações - compostas", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de expedição - separação", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de expedição - conferência", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de expedição - embarque", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento Auditória - Inventário rotativo", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento Auditória - Inventário completo", "Treinador Expert", "1", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Avaliação dos Keyusers", "Treinador Expert", "", "Key users (2)", "1"],
  ["formacao", "Treinamentos Wms", "Treinamento de gestão", "Treinador Expert", "", "Gestor cliente (1)", ""],
  ["formacao", "Treinamentos Wms", "Avaliação dos Gestores", "Treinador Expert", "", "Gestor cliente (1)", ""],
  ["formacao", "Treinamentos Wms", "Treinamento patrocinador", "Treinador Expert", "", "Patrocinador cliente (1)", ""],
  ["formacao", "Acompanhamento", "Dúvidas e alinhamentos", "Treinador Expert", "", "Time cliente (1p)", "", false, true],
  ["integracao", "Integração", "Reuniões de dúvidas sobre a documentação", "Instrutor de TI", "", "TI Cliente + ERP (2)", ""],
  ["integracao", "Integração", "Parametrização das Views/Procedures ou API's", "Instrutor de TI", "", "TI Cliente + ERP (2)", ""],
  ["integracao", "Integração", "Homologação das Views/Procedures ou API's", "Instrutor de TI", "", "", ""],
  ["integracao", "Integração", "Instalação e parametrização do \"BOT INTEGRA\"", "Instrutor de TI", "", "TI Cliente + ERP (2)", ""],
  ["integracao", "Integração", "Testes integrados", "Instrutor de TI e Instrutor Expert", "", "", ""],
  ["integracao", "Integração", "Entrega para cliente", "Instrutor de TI e Instrutor Expert", "", "TI Cliente + ERP (2)", ""],
  ["integracao", "Acompanhamento", "Dúvidas e alinhamentos", "Consultor Expert", "", "Time cliente (1p)", "", false, true],
  ["golive", "Implantação", "Reunião de planejamento do Go live", "Qualidade Expert", "", "Time cliente (4p)", ""],
  ["golive", "Implantação", "Rollout do sistema WMS", "Instrutor Expert", "", "-", ""],
  ["golive", "Implantação", "Suporte aos Key users (Remoto ou presencial)", "Instrutor Expert", "", "Key users (2)", ""],
  ["golive", "Implantação", "Apoio remoto aos Key users", "Instrutor Expert", "", "Key users (2)", "", false, true],
  ["golive", "Implantação", "Inspeção remota e avaliação", "Qualidade Expert", "", "Key users (2)", "", false, true],
  ["golive", "Implantação", "Encerramento da implantação", "Consultor Sênior Expert", "", "Time cliente (4p)", ""],
  ["golive", "Acompanhamento", "Dúvidas e alinhamentos", "Consultor Expert", "", "Time cliente (1p)", "", false, true],
];
const rid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
export function templateRows(): ScheduleRow[] {
  return TEMPLATE.map(([group, phase, activity, expert, expertHrs, client, clientHrs, highlight, continuous]) => ({ id: rid(), group, phase, activity, expert, expertHrs, client, clientHrs, start: null, end: null, highlight: !!highlight, continuous: !!continuous, clientPeople: [], expertPerson: "" }));
}
export const scheduleOf = (s?: ProjectSchedule | null): ProjectSchedule => (s && Array.isArray(s.rows) && s.rows.length ? s : { rows: templateRows() });

/** Pessoas do cliente que podem ser responsáveis (patrocinador, key users, TI). */
export function clientPeople(info?: ClientInfo | null): { key: string; label: string; person: ClientPerson }[] {
  const out: { key: string; label: string; person: ClientPerson }[] = [];
  if (info?.sponsor?.name) out.push({ key: "sponsor", label: "Patrocinador", person: info.sponsor });
  (info?.keyUsers || []).forEach((k, i) => { if (k?.name) out.push({ key: `ku${i + 1}`, label: `Key user ${i + 1}`, person: k }); });
  if (info?.itSupport?.name) out.push({ key: "ti", label: "Suporte TI", person: info.itSupport });
  return out;
}
export const clientDisplayName = (c?: Client | null) => (c?.info?.tradeName || c?.name || "Cliente").trim();
export function fmtPhone(v?: string) { const d = (v || "").replace(/\D/g, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : v || ""; }
export const brDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
export function fmtCnpj(v?: string) { const d = (v || "").replace(/\D/g, ""); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : v || ""; }
export function validCnpj(v?: string) {
  const d = (v || "").replace(/\D/g, ""); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => { let s = 0, w = n - 7; for (let i = 0; i < n; i++) { s += Number(d[i]) * w--; if (w < 2) w = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
/** Resumo do cronograma para telas e e-mails. */
export function scheduleStats(s: ProjectSchedule, today: string) {
  const rows = s.rows, dated = rows.filter(r => r.start || r.end);
  const late = rows.filter(r => !r.done && r.end && r.end < today);
  const next = rows.filter(r => !r.done && (r.start || r.end) && (r.end || r.start)! >= today).sort((a, b) => String(a.start || a.end).localeCompare(String(b.start || b.end)))[0] || null;
  return { total: rows.length, dated: dated.length, done: rows.filter(r => r.done).length, late, next };
}
