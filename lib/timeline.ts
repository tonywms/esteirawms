// V31 · Linha do tempo: junta fases da esteira, agenda, cronograma do projeto e o diário do consultor
// numa visão por consultor (quem esteve em qual cliente, em qual etapa, o que fez em cada dia, onde parou)
// ou por projeto (quem entrou em cada fase: Carlos, Félix, cliente...).
import type { Appointment, JournalEntry, Project, State } from "./types";
import { PHASES, docStates, isArchived, phaseOf, phaseOwner, type PhaseKey } from "./flow";
import { clientNames, expertNames, scheduleOf } from "./schedule";

export type SegKind = "fase" | "agenda" | "crono";
export type Seg = { id: string; kind: SegKind; label: string; start: string; end: string; phase: PhaseKey | null; termo: "ok" | "pendente" | null; person: string; projectId: string; detail?: string };
export type Entry = JournalEntry & { projectId: string };
export type Lane = { key: string; projectId: string; client: string; person: string; segs: Seg[]; entries: Entry[]; apps: Appointment[]; blocker?: string };
export type Group = { person: string; lanes: Lane[]; stops: Entry[]; days: number };

const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function samePerson(a?: string | null, b?: string | null) {
  const x = norm(a), y = norm(b); if (!x || !y) return false; if (x === y) return true;
  const fx = x.split(" ")[0], fy = y.split(" ")[0]; return fx.length >= 3 && fx === fy && (x.split(" ").length === 1 || y.split(" ").length === 1);
}
const PLACEHOLDER = /^(a definir|nao definido|time de|dev |erp|painel|treinamento \d)/;
export const isRealPerson = (n?: string | null) => !!n && !PLACEHOLDER.test(norm(n));
export const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
export const mondayOf = (d: string) => { const x = new Date(d + "T12:00:00"); const w = x.getDay(); return addDays(d, w === 0 ? -6 : 1 - w); };
export const daysBetween = (a: string, b: string) => { const out: string[] = []; for (let d = a; d <= b && out.length < 400; d = addDays(d, 1)) out.push(d); return out; };
const isWeekend = (d: string) => { const w = new Date(d + "T12:00:00").getDay(); return w === 0 || w === 6; };

/** Qual fase da esteira um texto descreve (para saber se o termo final da fase já foi entregue). */
export function phaseFromText(t?: string | null): PhaseKey | null {
  const n = norm(t);
  if (/go ?live|virada|rollout|inventario/.test(n)) return "golive";
  if (/homolog/.test(n)) return "homolog";
  if (/implanta|campo|recebimento|armazen|expedi|separa|embarque|confer/.test(n)) return "campo";
  if (/integra|view|procedure|api|bot integra|desenvolv/.test(n)) return "dev";
  if (/kickoff|kick off|treinamento|endere|cadastro|mapeamento|playbook|planejamento|apresenta/.test(n)) return "kickoff";
  return null;
}
export const PHASE_COLOR: Record<string, string> = { kickoff: "#8b6cf6", dev: "#3b82f6", homolog: "#0fb5d4", campo: "#f2994a", golive: "#22b573", none: "#64748b" };
export const phaseShort = (k?: string | null) => PHASES.find(p => p.key === k)?.short || "Atividade";

function termoOf(p: Project, k: PhaseKey | null): Seg["termo"] {
  if (!k) return null;
  const d = docStates(p).find(x => x.key === k);
  if (!d || d.state === "future" || d.state === "skipped") return null;
  return d.state === "ok" || d.state === "waived" ? "ok" : "pendente";
}

/** Todos os segmentos e lançamentos de um projeto, por pessoa. */
export function projectTimeline(s: State, p: Project, today: string) {
  const client = s.clients.find(c => c.id === p.clientId);
  const cname = client?.info?.tradeName || client?.name || p.name;
  const segs: Seg[] = [];
  // 1) fases da esteira (quem era o dono e quando)
  const order = PHASES.filter(x => x.key !== "fim").map(x => x.key);
  const cur = phaseOf(p);
  order.forEach((k, i) => {
    const info = p.phases?.[k]; const start = info?.start ? String(info.start).slice(0, 10) : null; if (!start) return;
    const next = order.slice(i + 1).map(x => p.phases?.[x]?.start).find(Boolean);
    const end = info?.done ? String(info.done).slice(0, 10) : next ? addDays(String(next).slice(0, 10), -1) : k === cur ? today : start;
    segs.push({ id: `f-${p.id}-${k}`, kind: "fase", label: phaseShort(k), start, end: end < start ? start : end, phase: k, termo: termoOf(p, k), person: phaseOwner(p, k), projectId: p.id, detail: k === cur ? "fase atual" : undefined });
  });
  // 2) agenda: dias seguidos com o mesmo título viram um bloco
  const apps = s.appointments.filter(a => a.projectId === p.id && a.date && a.status !== "Cancelado").sort((a, b) => `${a.consultant}${a.date}`.localeCompare(`${b.consultant}${b.date}`));
  let run: { a: Appointment; start: string; end: string } | null = null;
  const flush = () => { if (!run) return; const k = phaseFromText(run.a.title); segs.push({ id: `a-${run.a.id}`, kind: "agenda", label: run.a.title || "Agenda", start: run.start, end: run.end, phase: k, termo: termoOf(p, k), person: run.a.consultant, projectId: p.id, detail: [run.a.modality, run.a.status].filter(Boolean).join(" · ") }); run = null; };
  for (const a of apps) {
    const d = String(a.date).slice(0, 10);
    if (run && samePerson(run.a.consultant, a.consultant) && norm(run.a.title) === norm(a.title)) {
      let gap = addDays(run.end, 1); while (gap < d && isWeekend(gap)) gap = addDays(gap, 1);
      if (gap >= d) { run.end = d; continue; }
    }
    flush(); run = { a, start: d, end: d };
  }
  flush();
  // 3) cronograma do projeto (time Expert e time cliente)
  const sched = scheduleOf(p.schedule, p.flow);
  if (p.schedule?.rows?.length) for (const r of sched.rows) {
    const start = r.start || r.end, end = r.end || r.start; if (!start || !end) continue;
    const k = phaseFromText(`${r.phase} ${r.activity}`);
    for (const who of expertNames(r, sched.team, sched.consultant)) segs.push({ id: `c-${r.id}-${who}`, kind: "crono", label: r.activity, start, end, phase: k, termo: r.done ? "ok" : null, person: who, projectId: p.id, detail: r.phase });
    const cl = clientNames(r, client?.info);
    if (cl.length || /cliente|key user|patrocinador|ti cliente/i.test(r.client)) segs.push({ id: `c-${r.id}-cli`, kind: "crono", label: r.activity, start, end, phase: k, termo: r.done ? "ok" : null, person: `Cliente · ${cname}`, projectId: p.id, detail: cl.join(", ") || r.client });
  }
  const entries: Entry[] = (p.journal || []).map(e => ({ ...e, projectId: p.id }));
  return { client: cname, segs, entries, apps };
}

/** Visão por consultor (padrão) ou por projeto, no intervalo [from, to]. */
export function buildTimeline(s: State, from: string, to: string, opts: { mode?: "consultor" | "projeto"; person?: string; projectId?: string; today: string }) {
  const projs = s.projects.filter(p => (opts.projectId ? p.id === opts.projectId : !isArchived(p, opts.today)));
  const inRange = (a: string, b: string) => a <= to && b >= from;
  const all = projs.map(p => ({ p, ...projectTimeline(s, p, opts.today) }));
  const groups = new Map<string, Group>();
  const groupFor = (person: string) => { const k = [...groups.keys()].find(x => samePerson(x, person)) || person; if (!groups.has(k)) groups.set(k, { person: k, lanes: [], stops: [], days: 0 }); return groups.get(k)!; };
  for (const t of all) {
    const people = new Set<string>();
    t.segs.filter(x => inRange(x.start, x.end)).forEach(x => people.add(x.person));
    t.entries.filter(e => e.date >= from && e.date <= to).forEach(e => people.add(e.person));
    t.apps.filter(a => a.date && a.date >= from && a.date <= to).forEach(a => people.add(a.consultant));
    for (const person of people) {
      if (opts.mode !== "projeto" && (!isRealPerson(person) || person.startsWith("Cliente ·"))) continue;
      if (opts.person && !samePerson(person, opts.person)) continue;
      const gkey = opts.mode === "projeto" ? t.p.id : person;
      const g = groupFor(opts.mode === "projeto" ? gkey : person);
      const lane: Lane = {
        key: `${t.p.id}-${person}`, projectId: t.p.id, client: t.client, person,
        segs: t.segs.filter(x => samePerson(x.person, person) || x.person === person).filter(x => inRange(x.start, x.end)).sort((a, b) => a.start.localeCompare(b.start)),
        entries: t.entries.filter(e => (samePerson(e.person, person) || e.person === person) && e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date)),
        apps: t.apps.filter(a => samePerson(a.consultant, person) && a.date && a.date >= from && a.date <= to),
        blocker: t.p.blocker && t.p.blocker !== "-" ? t.p.blocker : undefined,
      };
      g.lanes.push(lane);
    }
  }
  const out = [...groups.values()].map(g => {
    const stops = g.lanes.flatMap(l => l.entries.filter(e => e.status !== "ok"));
    const days = new Set(g.lanes.flatMap(l => [...l.entries.map(e => e.date), ...l.apps.map(a => String(a.date))])).size;
    g.lanes.sort((a, b) => (a.segs[0]?.start || a.entries[0]?.date || "9").localeCompare(b.segs[0]?.start || b.entries[0]?.date || "9") || a.client.localeCompare(b.client));
    return { ...g, stops, days };
  });
  if (opts.mode === "projeto") for (const g of out) { const p = s.projects.find(x => x.id === g.person); g.person = p ? (all.find(a => a.p.id === p.id)?.client || p.name) : g.person; g.lanes.sort((a, b) => (a.person.startsWith("Cliente") ? 1 : 0) - (b.person.startsWith("Cliente") ? 1 : 0) || (a.segs[0]?.start || "9").localeCompare(b.segs[0]?.start || "9")); }
  return out.sort((a, b) => b.lanes.length - a.lanes.length || a.person.localeCompare(b.person));
}

/** Texto corrido (como no exemplo: "Nadson · Cliente Tropical · Homologação 16/11 a 20/11 (termo final)"). */
export const br = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
export const brS = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "");
export function laneSummary(l: Lane) {
  const lines: string[] = [];
  for (const s of l.segs) lines.push(`${s.label} ${brS(s.start)}${s.end !== s.start ? ` a ${brS(s.end)}` : ""}${s.termo === "ok" ? " (termo final)" : s.termo === "pendente" ? " (termo pendente)" : ""}`);
  return lines;
}
export const STATUS_LABEL: Record<string, string> = { ok: "Feito", parcial: "Parcial", parado: "Parado" };
