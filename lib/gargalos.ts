// V17 · Mapa de gargalos: cruza fase / consultor / cliente / onda com 6 tipos de problema
// e aponta onde a esteira está perdendo velocidade. Tudo calculado a partir do que já existe
// (projetos, atividades, agenda e linha do tempo). Metas de cada fase em dias úteis.
import type { Project, State, Task } from "./types";
import { PHASES, ballOf, daysBetween, flowSummary, healthOf, isArchived, lastTouch, phaseLabel, phaseIndex, phaseOf, phaseOwner, taskSignals, type PhaseKey } from "./flow";
import { todayISO } from "./metrics";

/** Metas por fase (dias úteis). Implantação: 5 a 10 dias úteis (até 5 ok, 6–10 tolerância, >10 estourou). */
export const PHASE_GOALS: Record<string, { goal: number; limit: number; text: string }> = {
  kickoff: { goal: 1, limit: 1, text: "1 dia útil" },
  dev: { goal: 10, limit: 10, text: "2 semanas (10 dias úteis)" },
  homolog: { goal: 5, limit: 5, text: "5 dias úteis" },
  campo: { goal: 5, limit: 10, text: "5 a 10 dias úteis" },
  golive: { goal: 5, limit: 5, text: "5 dias úteis" },
};
export const CYCLE_GOAL = Object.values(PHASE_GOALS).reduce((a, g) => a + g.limit, 0); // 31 dias úteis

export const DIMS = [
  { key: "atraso", label: "Atraso", sub: "atividades e prazos vencidos", unit: "count" },
  { key: "parado", label: "Tempo parado", sub: "dias sem movimento", unit: "days" },
  { key: "empecilho", label: "Empecilho", sub: "gargalos abertos", unit: "count" },
  { key: "meta", label: "Fora da meta", sub: "dias úteis na fase", unit: "days" },
  { key: "retrabalho", label: "Retrabalho", sub: "voltas e remarcações (30d)", unit: "count" },
  { key: "bola", label: "Bola fora", sub: "parado com cliente/ERP", unit: "days" },
] as const;
export type DimKey = (typeof DIMS)[number]["key"];
export type GroupBy = "fase" | "consultor" | "cliente" | "onda";

const iso = (v?: string | null) => (v ? String(v).slice(0, 10) : null);
const br = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const short = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const blank = (v?: string | null) => { const x = (v || "").trim(); return !x || x === "-" || x === "—"; };

/** Dias úteis (seg–sex) entre duas datas, sem contar o dia inicial. */
export function businessDays(from?: string | null, to = todayISO()): number | null {
  const a = iso(from); if (!a) return null;
  const s = new Date(a + "T12:00:00"), e = new Date(to + "T12:00:00");
  if (!(s < e)) return 0;
  let n = 0; const d = new Date(s);
  for (let i = 0; i < 3660 && d < e; i++) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export type DimHit = { sev: number; value: number; text: string; reason: string };
export type ProjectHeat = {
  p: Project; client: string; phase: PhaseKey; owner: string; wave: string; ball: string;
  dims: Record<DimKey, DimHit>; score: number; health: string; inPhaseBD: number | null; nextAction: string; noStart: boolean;
};

const LANES = ["Onda 1", "Onda 2", "Onda 3", "Congelado"];
const laneOf = (p: Project) => (LANES.includes(p.wave) ? p.wave : "Onda 1");
const none: DimHit = { sev: 0, value: 0, text: "", reason: "" };

function reworkEvents(p: Project, tasks: Task[], appts: State["appointments"], since: string) {
  const out: string[] = [];
  for (const e of p.timeline || []) {
    if ((iso(e.at) || "") < since) continue;
    const t = e.text || "";
    const m = t.match(/^Fase: (.+) → (.+)$/);
    if (m) { const a = PHASES.findIndex(x => x.label === m[1]), b = PHASES.findIndex(x => x.label === m[2]); if (a >= 0 && b >= 0 && b < a) out.push(`Voltou de fase: ${m[1]} → ${m[2]}`); continue; }
    if (/prazo [0-9—s]/i.test(t) && /→/.test(t) && !/criada/i.test(t)) out.push(short(t.replace(/^[^·]*· /, ""), 80));
    else if (/remarcado|cancelad[oa]/i.test(t)) out.push(short(t, 80));
    else if (/recus/i.test(t)) out.push(short(t, 80));
  }
  void tasks; void appts;
  return out;
}

export function projectHeat(s: State, p: Project, today = todayISO()): ProjectHeat {
  const k = phaseOf(p), h = healthOf(p, today, s.tasks), ts = taskSignals(p, s.tasks, today);
  const client = s.clients.find(c => c.id === p.clientId)?.name || p.name || "Cliente";
  const dims = {} as Record<DimKey, DimHit>;

  // Atraso
  const due = h.due && h.due < today ? h.due : null;
  const nLate = ts.overdue.length + (due ? 1 : 0);
  dims.atraso = nLate ? {
    sev: nLate >= 4 ? 4 : nLate >= 2 ? 3 : 2, value: nLate, text: String(nLate),
    reason: ts.overdue.length ? `${ts.overdue.length} atividade(s) vencida(s) · mais antiga: “${short(ts.overdue[0].title, 50)}” (${br(ts.overdue[0].dueDate)})${due ? ` · prazo da fase vencido em ${br(due)}` : ""}` : `Prazo da fase vencido em ${br(due)}`,
  } : none;

  // Tempo parado
  const idle = h.idle ?? 0;
  dims.parado = idle >= 3 ? { sev: idle >= 14 ? 4 : idle >= 7 ? 3 : 2, value: idle, text: `${idle}d`, reason: `Sem movimento há ${idle} dias (último registro em ${br(lastTouch(p))})` } : idle >= 1 ? { sev: 1, value: idle, text: `${idle}d`, reason: `Último registro há ${idle} dia(s)` } : none;

  // Empecilho
  const pb = blank(p.blocker) ? "" : p.blocker.trim();
  const same = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const tb = ts.blocked.filter(t => same(t.blocker) !== same(pb)).map(t => `${short(t.blocker, 60)} (atividade “${short(t.title, 36)}”)`);
  const refused = PHASES.filter(ph => ph.doc && p.phases?.[ph.key]?.sign?.status === "refused" && !p.phases?.[ph.key]?.doc).map(ph => `Assinatura recusada: ${ph.doc}`);
  const blocks = [...(pb ? [pb] : []), ...tb, ...refused];
  dims.empecilho = blocks.length ? { sev: blocks.length >= 2 ? 4 : 3, value: blocks.length, text: String(blocks.length), reason: short(blocks.join(" · "), 140) } : none;

  // Fora da meta (dias úteis na fase atual)
  const goal = PHASE_GOALS[k];
  // Só conta a meta com a data real de início da fase (definida ao mover o card na esteira).
  const start = p.phases?.[k]?.start || null;
  const bd = start ? businessDays(start, today) : null;
  if (goal && bd !== null) {
    const r = bd / goal.limit;
    const sev = bd <= goal.goal ? 0 : bd <= goal.limit ? 1 : r <= 1.5 ? 2 : r <= 2 ? 3 : 4;
    dims.meta = sev ? { sev, value: bd, text: `${bd}du`, reason: `${bd} dias úteis em ${phaseLabel(k)} (meta: ${goal.text})${bd > goal.limit ? ` · ${bd - goal.limit} acima` : " · dentro da tolerância"}` } : none;
  } else dims.meta = none;

  // Retrabalho (últimos 30 dias)
  const since = new Date(new Date(today + "T12:00:00").getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const rw = reworkEvents(p, s.tasks, s.appointments, since);
  dims.retrabalho = rw.length ? { sev: rw.length >= 3 ? 4 : rw.length === 2 ? 3 : 2, value: rw.length, text: String(rw.length), reason: short(rw.slice(0, 2).join(" · "), 140) } : none;

  // Bola fora: parado com cliente ou ERP
  const ball = ballOf(p);
  if (ball !== "WMS Expert") {
    const d = Math.max(idle, 1);
    dims.bola = { sev: d >= 14 ? 4 : d >= 7 ? 3 : d >= 3 ? 2 : 1, value: d, text: `${d}d`, reason: `Bola com ${ball} há ${d} dia(s)${blank(p.blocker) ? "" : ` · ${short(p.blocker, 60)}`}` };
  } else dims.bola = none;

  const golive = p.goLiveDate && p.goLiveDate >= today ? daysBetween(today, p.goLiveDate) : null;
  const sevSum = Object.values(dims).reduce((a, d) => a + d.sev, 0);
  const score = sevSum * 10 + (h.health === "red" ? 15 : h.health === "amber" ? 5 : 0) + (golive !== null && golive <= 15 ? 20 - golive : 0) + Math.min(idle, 30);
  return { p, client, phase: k, owner: phaseOwner(p, k), wave: laneOf(p), ball, dims, score, health: h.health, inPhaseBD: bd, nextAction: (p.nextAction || "").trim(), noStart: !start && !!goal };
}

export type Cell = { level: number; text: string; sub: string; hits: ProjectHeat[]; missing: ProjectHeat[] };
export type Row = { key: string; label: string; sub: string; total: number; cells: Record<DimKey, Cell>; weight: number };

function cellOf(list: ProjectHeat[], dim: (typeof DIMS)[number]): Cell {
  const hits = list.filter(x => x.dims[dim.key].sev > 0).sort((a, b) => b.dims[dim.key].sev - a.dims[dim.key].sev || b.dims[dim.key].value - a.dims[dim.key].value);
  const missing = dim.key === "meta" ? list.filter(x => x.noStart) : [];
  if (!list.length) return { level: 0, text: "–", sub: "", hits, missing };
  if (missing.length === list.length) return { level: 0, text: "?", sub: `${missing.length} sem data`, hits, missing };
  if (!hits.length) return { level: 1, text: "0", sub: missing.length ? `ok · ${missing.length} s/ data` : "ok", hits, missing };
  const top = hits.slice(0, 3).map(h => h.dims[dim.key].sev);
  // pondera também a proporção de projetos afetados no grupo
  const share = hits.length / list.length;
  const level = Math.max(1, Math.min(4, Math.round(top.reduce((a, b) => a + b, 0) / top.length + (share >= .5 ? .5 : share < .2 ? -.5 : 0))));
  if (dim.unit === "days") {
    const avg = Math.round(hits.reduce((a, h) => a + h.dims[dim.key].value, 0) / hits.length);
    return { level, text: dim.key === "meta" ? `${avg}du` : `${avg}d`, sub: `${hits.length} proj.${missing.length ? ` · ${missing.length} s/ data` : ""}`, hits, missing };
  }
  const sum = hits.reduce((a, h) => a + h.dims[dim.key].value, 0);
  return { level, text: String(sum), sub: `${hits.length} proj.`, hits, missing };
}

export function heatmap(s: State, by: GroupBy, today = todayISO()) {
  const active = s.projects.filter(p => !isArchived(p, today) && phaseOf(p) !== "fim");
  const heats = active.map(p => projectHeat(s, p, today));
  const groups = new Map<string, { label: string; sub?: string; list: ProjectHeat[]; order: number }>();
  const add = (key: string, label: string, h: ProjectHeat, order: number) => { const g = groups.get(key) || { label, list: [], order }; g.list.push(h); groups.set(key, g); };
  if (by === "fase") PHASES.filter(ph => ph.key !== "fim").forEach((ph, i) => groups.set(ph.key, { label: ph.short, list: [], order: i }));
  if (by === "onda") LANES.forEach((l, i) => groups.set(l, { label: l, list: [], order: i }));
  for (const h of heats) {
    if (by === "fase") add(h.phase, PHASES[phaseIndex(h.phase)].short, h, phaseIndex(h.phase));
    else if (by === "onda") add(h.wave, h.wave, h, LANES.indexOf(h.wave));
    else if (by === "consultor") add(h.owner || "Não definido", h.owner || "Não definido", h, 0);
    else add(h.p.clientId || h.client, h.client, h, 0);
  }
  let rows: Row[] = [...groups.entries()].map(([key, g]) => {
    const cells = {} as Record<DimKey, Cell>;
    DIMS.forEach(d => { cells[d.key] = cellOf(g.list, d); });
    const weight = g.list.reduce((a, h) => a + h.score, 0);
    const sub = by === "cliente" ? (g.list[0] ? PHASES[phaseIndex(g.list[0].phase)].short : "") : `${g.list.length} projeto${g.list.length === 1 ? "" : "s"}`;
    return { key, label: g.label, sub, total: g.list.length, cells, weight, order: g.order } as Row & { order: number };
  });
  if (by === "fase" || by === "onda") rows.sort((a, b) => (a as Row & { order: number }).order - (b as Row & { order: number }).order);
  else rows.sort((a, b) => b.weight - a.weight);
  if (by === "cliente") rows = rows.slice(0, 12);
  if (by === "consultor") rows = rows.slice(0, 14);
  return { rows, heats };
}

const NEXT: Record<DimKey, (h: ProjectHeat) => string> = {
  atraso: () => "Cobrar o responsável e repactuar o prazo hoje",
  parado: () => "Fazer contato hoje e registrar a próxima ação",
  empecilho: () => "Escalonar o empecilho com o responsável do setor",
  meta: h => `Revisar o plano da fase com ${h.owner}`,
  retrabalho: () => "Alinhar escopo e critério de aceite para evitar nova volta",
  bola: h => h.ball === "ERP Parceiro" ? "Escalonar ao ERP parceiro" : "Cobrar o cliente (escalonar se passar de 7 dias)",
};

export function attackFirst(heats: ProjectHeat[], n = 5) {
  return [...heats].filter(h => h.score > 0).sort((a, b) => b.score - a.score).slice(0, n).map(h => {
    const worst = DIMS.map(d => ({ d, hit: h.dims[d.key] })).sort((a, b) => b.hit.sev - a.hit.sev || b.hit.value - a.hit.value)[0];
    return { h, dim: worst.d, problem: worst.hit.reason, next: h.nextAction ? `Próxima ação: ${short(h.nextAction, 70)}` : NEXT[worst.d.key](h) };
  });
}

/** Tempo real por fase × meta: média de dias úteis dos projetos na fase agora + fases concluídas nos últimos 90 dias. */
export function phaseTimes(s: State, heats: ProjectHeat[], today = todayISO()) {
  const since = new Date(new Date(today + "T12:00:00").getTime() - 90 * 864e5).toISOString().slice(0, 10);
  return PHASES.filter(ph => PHASE_GOALS[ph.key]).map(ph => {
    const g = PHASE_GOALS[ph.key];
    const now = heats.filter(h => h.phase === ph.key && h.inPhaseBD !== null).map(h => h.inPhaseBD as number);
    const done = s.projects.map(p => p.phases?.[ph.key]).filter(x => x?.start && x?.done && (x.done as string) >= since).map(x => businessDays(x!.start, x!.done as string) as number);
    const all = [...now, ...done];
    const avg = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
    const over = all.filter(v => v > g.limit).length;
    return { key: ph.key, label: ph.short, goal: g, avg, n: all.length, nNow: now.length, nDone: done.length, over };
  });
}

/** Ciclo completo realizado (kickoff → go-live) dos projetos com histórico. */
export function cycleTime(s: State) {
  const vals = s.projects.map(p => {
    const a = p.phases?.kickoff?.start, b = p.phases?.golive?.done || p.phases?.fim?.start;
    return a && b ? businessDays(a, b) : null;
  }).filter((v): v is number => v !== null && v > 0);
  return { avg: vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null, n: vals.length };
}

export function dataQuality(s: State, heats: ProjectHeat[], today = todayISO()) {
  const ids = new Set(heats.map(h => h.p.id));
  const openTasks = s.tasks.filter(t => ids.has(t.projectId) && !/conclu|finaliz|cancel/i.test(t.status));
  return {
    noNext: heats.filter(h => !h.nextAction).length,
    noNextList: heats.filter(h => !h.nextAction), // V24
    noDue: openTasks.filter(t => !t.dueDate).length,
    noStart: heats.filter(h => h.noStart).length,
    noStartList: heats.filter(h => h.noStart),
    total: heats.length,
    today,
  };
}

export function gargalosSummary(s: State, today = todayISO()) {
  const byPhase = heatmap(s, "fase", today);
  const heats = byPhase.heats;
  const worst = [...byPhase.rows].filter(r => r.total).sort((a, b) => b.weight - a.weight)[0] || null;
  const withGoal = heats.filter(h => PHASE_GOALS[h.phase] && h.inPhaseBD !== null);
  const inGoal = withGoal.filter(h => (h.inPhaseBD as number) <= PHASE_GOALS[h.phase].limit).length;
  const overDays = withGoal.reduce((a, h) => a + Math.max(0, (h.inPhaseBD as number) - PHASE_GOALS[h.phase].limit), 0);
  const idleAll = heats.reduce((a, h) => a + h.dims.parado.value, 0);
  const idleOut = heats.filter(h => h.ball !== "WMS Expert").reduce((a, h) => a + h.dims.parado.value, 0);
  const hot: { row: string; dim: string; level: number; text: string }[] = [];
  byPhase.rows.forEach(r => DIMS.forEach(d => { const c = r.cells[d.key]; if (c.level >= 3) hot.push({ row: r.label, dim: d.label, level: c.level, text: c.text }); }));
  hot.sort((a, b) => b.level - a.level);
  const sum = flowSummary(s);
  return {
    worst, inGoal, withGoal: withGoal.length, pctInGoal: withGoal.length ? Math.round(inGoal / withGoal.length * 100) : null, overDays,
    idleOutPct: idleAll ? Math.round(idleOut / idleAll * 100) : 0, hot: hot.slice(0, 3), cycle: cycleTime(s), red: sum.red, active: heats.length,
  };
}
