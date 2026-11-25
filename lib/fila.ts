// V39 · Próximas implantações: fila de Homologação e Go-live por consultor e por semana.
// Cada projeto ativo tem até duas "idas a campo": Homologação e Go-live. A data vem, nesta ordem, de:
//  1) agendamento marcado na fila (Agendado / Pré-agendado / Realizado);
//  2) fase em andamento agora (começou e ainda não terminou);
//  3) data prometida no projeto (homologação / go-live);
//  4) sugestão automática: previsão da esteira + a próxima semana livre do consultor (uma ida a campo por semana).
import type { Booking, Project, State } from "./types";
import { isArchived, phaseIndex, phaseOf, phaseOwner, type PhaseKey } from "./flow";
import { isDone, todayISO } from "./metrics";
import { addBD, forecastAll } from "./forecast";
import { isInternalProject } from "./internal";

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

export function planQueue(s: State, today = todayISO(), until = `${today.slice(0, 4)}-12-31`) {
  const fc = forecastAll(s, today);
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
      const b = p.phases?.[kind]?.booking || null, consultant = consultantOf(p, kind, b);
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
    const pr = s.projects.find(p => p.id === a.projectId); if (pr && isInternalProject(pr)) continue; // escritório não ocupa a semana
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
