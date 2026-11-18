// V10 · Linha do tempo única: atividades e agenda alimentam o histórico do projeto sozinhas.
// Só entra o que importa (criação, status, conclusão, empecilho, prazo, responsável, exclusão).
// Mudanças seguidas na mesma atividade, pela mesma pessoa, em até 10 minutos viram um registro só.
import type { Appointment, Project, State, Task, TimelineEvent } from "./types";

const MERGE_MS = 10 * 60e3;
const fmt = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "sem prazo");
const blank = (v?: string | null) => { const s = (v || "").trim(); return !s || s === "-" || s === "—"; };
const done = (s?: string) => /conclu|finaliz|entregue/i.test(s || "");
const cancelled = (s?: string) => /cancel/i.test(s || "");

function push(state: State, projectId: string, ref: string, kind: "atividade" | "agenda", parts: string[], head: string, author?: string) {
  if (!parts.length) return;
  const p: Project | undefined = state.projects.find(x => x.id === projectId);
  if (!p) return;
  const now = new Date().toISOString();
  const tl = p.timeline || [];
  const top = tl[0];
  const sameRef = top && top.id.startsWith(`${ref}:`) && top.kind === kind && (top.author || "") === (author || "") && Date.now() - new Date(top.at).getTime() < MERGE_MS;
  let ev: TimelineEvent;
  if (sameRef && !/^.*(criad|exclu)/i.test(parts[0])) {
    ev = { ...top, at: now, text: `${top.text}; ${parts.join("; ")}`.slice(0, 900) };
    p.timeline = [ev, ...tl.slice(1)];
  } else {
    ev = { id: `${ref}:${crypto.randomUUID()}`, at: now, kind, author, text: `${head}${parts.join("; ")}`.slice(0, 900) };
    p.timeline = [ev, ...tl];
  }
}

export function logTask(state: State, before: Task | null, after: Task | null, author?: string) {
  const t = after || before; if (!t) return;
  const ref = `task-${t.id}`, name = `“${t.title}”`;
  if (!before && after) {
    return push(state, after.projectId, ref, "atividade", [`criada${after.owner ? ` · ${after.owner}` : ""} · prazo ${fmt(after.dueDate)}${blank(after.blocker) ? "" : ` · empecilho: ${after.blocker}`}`], `Atividade ${name} `, author);
  }
  if (before && !after) return push(state, before.projectId, ref, "atividade", [`excluída (estava ${before.status || "sem status"})`], `Atividade ${name} `, author);
  if (!before || !after) return;
  if (before.projectId !== after.projectId) {
    push(state, before.projectId, ref, "atividade", ["movida para outro projeto"], `Atividade ${name} `, author);
    return push(state, after.projectId, ref, "atividade", [`criada${after.owner ? ` · ${after.owner}` : ""} · prazo ${fmt(after.dueDate)} (movida de outro projeto)`], `Atividade ${name} `, author);
  }
  const parts: string[] = [];
  if (before.status !== after.status) parts.push(done(after.status) ? `concluída${after.owner ? ` (responsável: ${after.owner})` : ""}` : cancelled(after.status) ? "cancelada" : `status ${before.status || "—"} → ${after.status || "—"}`);
  if ((before.dueDate || "") !== (after.dueDate || "")) parts.push(`prazo ${fmt(before.dueDate)} → ${fmt(after.dueDate)}`);
  if ((before.owner || "") !== (after.owner || "")) parts.push(`responsável ${before.owner || "—"} → ${after.owner || "—"}`);
  if ((before.blocker || "").trim() !== (after.blocker || "").trim()) parts.push(blank(after.blocker) ? "empecilho resolvido" : `empecilho: ${after.blocker}`);
  if ((before.title || "") !== (after.title || "")) parts.push(`renomeada (antes: “${before.title}”)`);
  const n0 = (before.notes || "").trim(), n1 = (after.notes || "").trim();
  if (n0 !== n1 && n1) {
    const added = n0 && n1.startsWith(n0) ? n1.slice(n0.length).trim() : "";
    const cut = (t: string) => (t.length > 400 ? `${t.slice(0, 400)}…` : t);
    parts.push(added ? `observação: “${cut(added)}”` : `observações: “${cut(n1)}”`);
  }
  push(state, after.projectId, ref, "atividade", parts, `Atividade ${name}: `, author);
}

export function logAppointment(state: State, before: Appointment | null, after: Appointment | null, author?: string) {
  const a = after || before; if (!a) return;
  const ref = `agenda-${a.id}`;
  const desc = (x: Appointment) => `${x.consultant} · ${fmt(x.date)} · ${x.shift}${x.title ? ` · ${x.title}` : ""}`;
  if (!before && after) return push(state, after.projectId, ref, "agenda", [`agendado${after.modality ? ` (${after.modality})` : ""}`], `Agenda: ${desc(after)} — `, author);
  if (before && !after) return push(state, before.projectId, ref, "agenda", ["agendamento excluído"], `Agenda: ${desc(before)} — `, author);
  if (!before || !after) return;
  const parts: string[] = [];
  if (before.status !== after.status) parts.push(/realiz|conclu/i.test(after.status) ? "realizado" : cancelled(after.status) ? "cancelado" : `status ${before.status} → ${after.status}`);
  if (before.date !== after.date || before.shift !== after.shift || before.consultant !== after.consultant) parts.push(`remarcado (antes: ${desc(before)})`);
  if (before.projectId !== after.projectId) push(state, before.projectId, ref, "agenda", ["movido para outro projeto"], `Agenda: ${desc(before)} — `, author);
  push(state, after.projectId, ref, "agenda", parts, `Agenda: ${desc(after)} — `, author);
}

/** Aplica o log certo conforme a entidade gravada pela API de cadastros. */
export function logRecord(state: State, entity: string, before: unknown, after: unknown, author?: string) {
  try {
    if (entity === "tasks") logTask(state, (before as Task) || null, (after as Task) || null, author);
    if (entity === "appointments") logAppointment(state, (before as Appointment) || null, (after as Appointment) || null, author);
  } catch { /* o log nunca impede a gravação */ }
}
