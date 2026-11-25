// V39 · Próximas implantações: fila de Homologação e Go-live por consultor e por semana.
// Cada projeto ativo tem até duas "idas a campo": Homologação e Go-live. A data vem, nesta ordem, de:
//  1) agendamento marcado na fila (Agendado / Pré-agendado / Realizado);
//  2) fase em andamento agora (começou e ainda não terminou);
//  3) data prometida no projeto (homologação / go-live);
//  4) sugestão automática: previsão da esteira + a próxima semana livre do consultor (uma ida a campo por semana).
import type { Appointment, Booking, Project, Staff, State } from "./types";
import { docStates, isArchived, phaseIndex, phaseOf, phaseOwner, type PhaseKey } from "./flow";
import { isBlocked, isDone, todayISO } from "./metrics";
import { addBD, forecastAll } from "./forecast";
import { INTERNAL_PROJECT_ID, internalName, isInternalProject } from "./internal";
import { infraSummary, pendText } from "./infra";
import { samePerson } from "./timeline";

export type SlotKind = "homolog" | "golive";
export type SlotStatus = "realizado" | "andamento" | "agendado" | "pre" | "prometido" | "sugerido";
export type Slot = {
  id: string; p: Project; clientId: string; client: string; kind: SlotKind; start: string; end: string;
  consultant: string; status: SlotStatus; booking?: Booking | null; note: string; phaseNow: PhaseKey;
};
export const KIND_LABEL: Record<SlotKind, string> = { homolog: "Homologação", golive: "Go-live" };
export const STATUS_TXT: Record<SlotStatus, string> = { realizado: "Realizado", andamento: "Em andamento", agendado: "Agendado", pre: "Pré-agendado", prometido: "Data prometida", sugerido: "Sugestão" };
export const TBD = "A definir";

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : "");
const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const GENERIC = /^(time de implantacao|a definir|nao definido|dev & integracoes|wms expert|-)?$/;
export const mondayOf = (d: string) => { const x = new Date(d + "T12:00:00"); const wd = x.getDay(); x.setDate(x.getDate() - (wd === 0 ? 6 : wd - 1)); return x.toISOString().slice(0, 10); };
export const addDaysISO = (d: string, n: number) => new Date(new Date(d + "T12:00:00").getTime() + n * 864e5).toISOString().slice(0, 10);
const nextMonday = (d: string) => { const m = mondayOf(d); return m >= d ? m : addDaysISO(m, 7); };
/** Fim padrão de uma ida a campo: 5 dias úteis (segunda a sexta). */
const weekEnd = (start: string) => addBD(start, 4);
const overlap = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;

export function consultantOf(p: Project, k: SlotKind, b?: Booking | null) {
  const c = (b?.consultant || p.phases?.[k]?.owner || phaseOwner(p, k) || p.implementationOwner || "").trim();
  return GENERIC.test(norm(c)) ? TBD : c;
}

/** Mesmo nome com uma letra de diferença ("Giovani" x "Giovanni"). */
function nearName(a: string, b: string) {
  const x = norm(a).split(" ")[0], y = norm(b).split(" ")[0]; if (x.length < 5 || y.length < 5 || Math.abs(x.length - y.length) > 1) return false;
  let i = 0, j = 0, diff = 0; while (i < x.length && j < y.length) { if (x[i] === y[j]) { i++; j++; continue; } if (++diff > 1) return false; if (x.length > y.length) i++; else if (y.length > x.length) j++; else { i++; j++; } }
  return diff + (x.length - i) + (y.length - j) <= 1;
}
export function planQueue(s: State, today = todayISO(), until = `${today.slice(0, 4)}-12-31`) {
  const fc = forecastAll(s, today);
  // nomes escritos diferente ("Giovanni" x "Giovani") viram a pessoa cadastrada na equipe
  const canon = (n: string) => n === TBD ? n : s.staff.find(st => st.name === n)?.name || s.staff.find(st => samePerson(st.name, n))?.name || s.staff.find(st => nearName(st.name, n))?.name || n;
  const name = (id: string) => s.clients.find(c => c.id === id)?.name || "Cliente";
  const fixed: Slot[] = [], wants: { p: Project; kind: SlotKind; earliest: string; consultant: string }[] = [];
  const projects = s.projects.filter(p => !isInternalProject(p) && !isArchived(p, today) && !isDone(p.status) && phaseOf(p) !== "fim");
  for (const p of projects) {
    const k = phaseOf(p), ki = phaseIndex(k), f = fc.get(p.id);
    // datas previstas de entrada em homologação e go-live, pela previsão da esteira
    let acc = 0, homAt: string | null = null, goAt: string | null = f?.forecast || null;
    for (const st of f?.steps || []) { if (st.phase === "homolog" && !homAt) homAt = addBD(today, acc); acc += st.days; }
    for (const kind of ["homolog", "golive"] as SlotKind[]) {
      if (kind === "homolog" && ki > phaseIndex("homolog")) continue; // homologação já passou
      const b = p.phases?.[kind]?.booking || null, consultant = canon(consultantOf(p, kind, b));
      const base = { id: `${p.id}-${kind}`, p, clientId: p.clientId, client: name(p.clientId), kind, consultant, booking: b, phaseNow: k };
      if (b?.start) { fixed.push({ ...base, start: day(b.start), end: day(b.end) || weekEnd(day(b.start)), status: b.status, note: b.notes || "" }); continue; }
      if (k === kind) {
        const st = day(p.phases?.[kind]?.start) || today;
        const fri = addDaysISO(mondayOf(today), 4); // em andamento: ocupa até a sexta desta semana
        fixed.push({ ...base, start: st, end: weekEnd(st) > fri ? weekEnd(st) : fri, status: "andamento", note: "Fase em andamento agora" });
        continue;
      }
      const promised = day(kind === "golive" ? p.goLiveDate : p.homologationDate);
      if (promised && promised >= mondayOf(today)) { fixed.push({ ...base, start: promised, end: weekEnd(promised), status: "prometido", note: "Data combinada no projeto" }); continue; }
      const earliest = kind === "golive" ? goAt : homAt;
      wants.push({ p, kind, earliest: earliest && earliest > today ? earliest : addDaysISO(today, 1), consultant });
    }
  }
  // sugestões: uma ida a campo por semana por consultor, sem bater com o que já está marcado nem com a agenda cheia
  const busy = new Map<string, [string, string][]>();
  const mark = (c: string, a: string, b: string) => { if (c === TBD) return; const l = busy.get(c) || []; l.push([a, b]); busy.set(c, l); };
  for (const x of fixed) mark(x.consultant, x.start, x.end);
  for (const a of s.appointments) if (a.date && a.status !== "Cancelado" && a.date >= today) {
    const pr = s.projects.find(p => p.id === a.projectId); if ((pr && isInternalProject(pr)) || a.projectId === INTERNAL_PROJECT_ID || internalName(a.clientId)) continue; // escritório não ocupa a semana
    const n = s.appointments.filter(x => x.consultant === a.consultant && x.status !== "Cancelado" && x.date && mondayOf(x.date) === mondayOf(a.date!)).length;
    if (n >= 3) mark(a.consultant, mondayOf(a.date), addDaysISO(mondayOf(a.date), 4));
  }
  const suggested: Slot[] = [];
  wants.sort((a, b) => a.earliest.localeCompare(b.earliest) || phaseIndex(phaseOf(b.p)) - phaseIndex(phaseOf(a.p)));
  for (const w of wants) {
    // go-live sempre depois da homologação do mesmo projeto
    const hom = [...fixed, ...suggested].find(x => x.p.id === w.p.id && x.kind === "homolog");
    let start = nextMonday(w.kind === "golive" && hom ? addDaysISO(hom.end, 1) > w.earliest ? addDaysISO(hom.end, 1) : w.earliest : w.earliest);
    if (w.consultant !== TBD) for (let guard = 0; guard < 60; guard++) { const e = weekEnd(start); if (!(busy.get(w.consultant) || []).some(([a, b]) => overlap(start, e, a, b))) break; start = addDaysISO(start, 7); }
    const end = weekEnd(start); mark(w.consultant, start, end);
    suggested.push({ id: `${w.p.id}-${w.kind}`, p: w.p, clientId: w.p.clientId, client: name(w.p.clientId), kind: w.kind, start, end, consultant: w.consultant, status: "sugerido", note: "Sugestão: previsão da esteira + semana livre do consultor", phaseNow: phaseOf(w.p) });
  }
  const all = [...fixed, ...suggested].sort((a, b) => a.start.localeCompare(b.start) || a.client.localeCompare(b.client));
  const from = mondayOf(today);
  const weeks: string[] = []; for (let m = from; m <= until; m = addDaysISO(m, 7)) weeks.push(m);
  const inRange = all.filter(x => x.end >= from && x.start <= until);
  const consultants = [...new Set(inRange.map(x => x.consultant))].sort((a, b) => (a === TBD ? 1 : b === TBD ? -1 : a.localeCompare(b)));
  return { all, inRange, later: all.filter(x => x.start > until), weeks, consultants, from, until };
}

/* ---------- V40 · Calendário por dia (consultor × dia), quem aparece e críticas ao mover ---------- */

/** Dias úteis (seg–sex) a partir de uma segunda, por N semanas. */
export function weekDays(monday: string, weeks = 1) { const out: string[] = []; for (let w = 0; w < weeks; w++) for (let i = 0; i < 5; i++) out.push(addDaysISO(monday, w * 7 + i)); return out; }
/** Quem aparece no painel: marcado pelo gestor; sem marcação = consultores e implantação. */
export const inQueueDefault = (s: Staff) => s.inQueue ?? /consult|implant/i.test(s.role || "");
export function panelPeople(st: State, slots: Slot[], days: string[]) {
  const from = days[0], to = days[days.length - 1];
  const on = st.staff.filter(s => s.active && inQueueDefault(s)).map(s => s.name);
  // quem não foi escolhido (nem ocultado de propósito) aparece só na semana em que tiver ida a campo marcada
  const busy = slots.filter(x => x.consultant !== TBD && x.booking && x.start <= to && x.end >= from).map(x => x.consultant)
    .filter(n => st.staff.find(s => s.name === n)?.inQueue !== false);
  return [...new Set([...on, ...busy])].sort((a, b) => a.localeCompare(b));
}
/** No calendário só entra o que alguém marcou (pré-agendado, agendado, realizado). O resto vai para a fila. */
export function splitPlan(all: Slot[]) {
  const placed = all.filter(s => !!s.booking && s.consultant !== TBD);
  const queue = all.filter(s => !s.booking || s.consultant === TBD);
  return { placed, queue };
}
export type AgendaTone = "golive" | "homolog" | "campo" | "treino" | "dev" | "office" | "outro";
export type AgendaBar = { id: string; person: string; clientId: string; client: string; title: string; start: string; end: string; office: boolean; tone: AgendaTone; appointments: Appointment[] };
/** Agenda do consultor no período, juntando dias seguidos no mesmo cliente numa barra só. */
export function agendaBars(st: State, days: string[], people: string[], skipIds: Set<string>) {
  const set = new Set(days), out: AgendaBar[] = [];
  const name = (id: string) => st.clients.find(c => c.id === id)?.name || "Cliente";
  for (const person of people) {
    const apps = st.appointments.filter(a => a.consultant === person && a.date && set.has(a.date) && a.status !== "Cancelado" && !skipIds.has(a.id)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const a of apps) {
      const prev = out.find(b => b.person === person && b.clientId === a.clientId && b.title === a.title && days.indexOf(b.end) === days.indexOf(a.date!) - 1);
      if (prev) { prev.end = a.date!; prev.appointments.push(a); continue; }
      if (out.some(b => b.person === person && b.clientId === a.clientId && b.title === a.title && b.start <= a.date! && b.end >= a.date!)) continue;
      const pr = st.projects.find(p => p.id === a.projectId), office = (!!pr && isInternalProject(pr)) || a.projectId === INTERNAL_PROJECT_ID || !!internalName(a.clientId);
      const t = norm(a.title), ph = pr ? phaseOf(pr) : null;
      const tone: AgendaTone = office ? "office" : /go.?live|virada/.test(t) ? "golive" : /homolog/.test(t) ? "homolog" : /treina|kickoff|cadastro|endere/.test(t) ? "treino" : /integra|dev/.test(t) ? "dev" : /implanta|campo|rollout/.test(t) ? "campo"
        : ph === "golive" ? "golive" : ph === "homolog" ? "homolog" : ph === "campo" ? "campo" : ph === "dev" ? "dev" : ph === "kickoff" ? "treino" : "outro";
      out.push({ id: a.id, person, clientId: a.clientId, client: internalName(a.clientId) || name(a.clientId), title: a.title, start: a.date!, end: a.date!, office, tone, appointments: [a] });
    }
  }
  return out;
}
export type Critique = { level: "red" | "amber"; kind: "conflito" | "pdf" | "empecilho" | "infra" | "previsao" | "fase" | "consultor"; text: string };
/** O que pode dar errado ao marcar esta ida a campo nestas datas com este consultor. */
export function critiques(st: State, p: Project, kind: SlotKind, start: string, end: string, consultant: string, today = todayISO()): Critique[] {
  const out: Critique[] = [], name = (id: string) => st.clients.find(c => c.id === id)?.name || "outro cliente";
  if (!consultant || consultant === TBD) out.push({ level: "amber", kind: "consultor", text: "Sem consultor definido para ir a campo." });
  else {
    const apps = st.appointments.filter(a => a.consultant === consultant && a.status !== "Cancelado" && a.date && a.date >= start && a.date <= end && a.projectId !== p.id);
    if (apps.length) out.push({ level: "red", kind: "conflito", text: `${consultant} já tem agenda: ${[...new Set(apps.map(a => `${name(a.clientId)} (${a.date!.slice(8)}/${a.date!.slice(5, 7)})`))].slice(0, 4).join(", ")}.` });
    for (const q of st.projects) for (const k of ["homolog", "golive"] as SlotKind[]) {
      const b = q.phases?.[k]?.booking; if (!b?.start || (q.id === p.id && k === kind) || b.status === "realizado") continue;
      if ((b.consultant || "") === consultant && b.start <= end && (b.end || b.start) >= start) out.push({ level: "red", kind: "conflito", text: `${consultant} já está marcado em ${name(q.clientId)} (${k === "golive" ? "go-live" : "homologação"}) nessas datas.` });
    }
  }
  const ki = phaseIndex(phaseOf(p)), need = kind === "golive" ? phaseIndex("golive") : phaseIndex("homolog");
  const pend = docStates(p).filter(d => phaseIndex(d.key) < need && (d.state === "pending" || d.state === "missing"));
  if (pend.length) out.push({ level: ki < need - 1 ? "amber" : "red", kind: "pdf", text: `Falta PDF antes de ${kind === "golive" ? "virar o go-live" : "homologar"}: ${pend.map(d => d.doc.replace("Documento de ", "")).join(", ")}.` });
  if (isBlocked(p.status) || /[a-z0-9]/i.test(p.blocker || "")) out.push({ level: "red", kind: "empecilho", text: `Empecilho no projeto: ${(p.blocker || "").trim() || p.status}.` });
  if (kind === "golive") { const inf = infraSummary(p).pending; if (inf.length) out.push({ level: "amber", kind: "infra", text: `Infra pendente: ${inf.map(pendText).join(", ")}.` }); }
  if (ki < need - 1) out.push({ level: "amber", kind: "fase", text: `O projeto ainda está em ${phaseOf(p) === "kickoff" ? "Kickoff" : phaseOf(p) === "dev" ? "Dev & Integração" : "outra fase"} — confira se dá tempo.` });
  if (start < today) out.push({ level: "amber", kind: "previsao", text: "Data no passado." });
  return out;
}
