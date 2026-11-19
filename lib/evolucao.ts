// V18 · Evolução da esteira: uma "foto" diária de cada projeto (fase, avanço, saúde) para
// desenhar as linhas de evolução no estilo pesquisa eleitoral (quem sobe, quem desce).
import type { Project, State, Task } from "./types";
import { PHASES, isArchived, phaseOf, phaseOwner, ballOf, type PhaseKey } from "./flow";
import { projectHeat } from "./gargalos";
import { todayISO } from "./metrics";

export type Snap = { day: string; project_id: string; client_id: string; phase: string; progress: number; health: number; owner: string; wave: string; ball: string; est?: boolean };

/** Onde cada fase começa no índice de avanço (0–100). */
const BASE: Record<string, number> = { kickoff: 0, dev: 12, homolog: 45, campo: 62, golive: 85, fim: 100 };
const NEXT = (k: string) => { const i = PHASES.findIndex(p => p.key === k); return PHASES[Math.min(i + 1, PHASES.length - 1)]?.key || "fim"; };
const done = (t: Task) => /conclu|finaliz/i.test(t.status || "");
const cancelled = (t: Task) => /cancel/i.test(t.status || "");
const LANES = ["Onda 1", "Onda 2", "Onda 3", "Congelado"];
const laneOf = (p: Project) => (LANES.includes(p.wave) ? p.wave : "Onda 1");

/** Avanço = base da fase + parte da fase concluída (atividades feitas / total). */
export function progressOf(k: string, tasksDone: number, tasksTotal: number, fallbackPct = 0) {
  if (k === "fim") return 100;
  const base = BASE[k] ?? 0, span = (BASE[NEXT(k)] ?? 100) - base;
  const within = tasksTotal ? tasksDone / tasksTotal : Math.max(0, Math.min(1, fallbackPct / 100)) * .6;
  return Math.max(0, Math.min(99, Math.round(base + within * span * .95)));
}

/** Saúde = 100 menos o peso dos problemas encontrados no Mapa de gargalos. */
export function healthScore(sevSum: number, red: boolean) { return Math.max(0, Math.min(100, Math.round(100 - sevSum * 7 - (red ? 8 : 0)))); }

export function snapshotRows(s: State, today = todayISO()): Snap[] {
  return s.projects.filter(p => !isArchived(p, today)).map(p => {
    const h = projectHeat(s, p, today);
    const ts = s.tasks.filter(t => t.projectId === p.id && !cancelled(t));
    const sev = Object.values(h.dims).reduce((a, d) => a + d.sev, 0);
    return {
      day: today, project_id: p.id, client_id: p.clientId, phase: h.phase,
      progress: progressOf(h.phase, ts.filter(done).length, ts.length, p.progress),
      health: healthScore(sev, h.health === "red"), owner: h.owner || "Não definido", wave: h.wave, ball: h.ball,
    };
  });
}

const dayOf = (v?: string | null) => (v ? String(v).slice(0, 10) : "");
function addDays(d: string, n: number) { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
export function dayRange(from: string, to: string) { const out: string[] = []; for (let d = from, i = 0; d <= to && i < 800; d = addDays(d, 1), i++) out.push(d); return out; }

/** Fase do projeto num dia passado, desfazendo as mudanças de fase registradas depois desse dia. */
function phaseAt(p: Project, day: string): PhaseKey {
  let k: PhaseKey = phaseOf(p);
  const evs = (p.timeline || []).filter(e => dayOf(e.at) > day).sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const e of evs) {
    const m = (e.text || "").match(/^Fase: (.+) → (.+)$/);
    if (!m) continue;
    const from = PHASES.find(x => x.label === m[1]);
    if (from) k = from.key as PhaseKey;
  }
  return k;
}

/** Reconstrói (estimado) os dias anteriores à primeira foto real, a partir da linha do tempo e das atividades. */
export function reconstruct(s: State, days: string[]): Snap[] {
  const out: Snap[] = [];
  const projects = s.projects.filter(p => !p.archivedAt);
  for (const day of days) for (const p of projects) {
    if (dayOf(p.createdAt) > day) continue;
    const k = phaseAt(p, day);
    const ts = s.tasks.filter(t => t.projectId === p.id && !cancelled(t) && dayOf(t.createdAt) <= day);
    const d = ts.filter(t => done(t) && dayOf(t.updatedAt) <= day).length;
    const overdue = ts.filter(t => t.dueDate && t.dueDate < day && !(done(t) && dayOf(t.updatedAt) <= day)).length;
    const sev = (overdue ? (overdue >= 4 ? 4 : overdue >= 2 ? 3 : 2) : 0) + (p.blocker?.trim() && dayOf(p.updatedAt) <= day ? 3 : 0);
    out.push({ day, project_id: p.id, client_id: p.clientId, phase: k, progress: progressOf(k, d, ts.length, p.progress), health: healthScore(sev, false), owner: phaseOwner(p, k) || "Não definido", wave: laneOf(p), ball: ballOf(p), est: true });
  }
  return out;
}

export type GroupBy = "fase" | "consultor" | "cliente" | "onda";
export type Metric = "avanco" | "saude" | "participacao";
export type Series = { key: string; label: string; color: string; points: { day: string; v: number | null; n: number; est: boolean }[]; first: number | null; last: number | null; delta: number | null; peak: number | null; low: number | null; n: number };

export const PALETTE = ["#16b8d4", "#f2994a", "#8b6cf6", "#2fbf71", "#ef5d79", "#3b82f6", "#e5b31a", "#14a38b", "#d36ad6", "#7c8da0", "#ff7a45", "#5ab0ff"];

/** Agrupa as fotos do dia e calcula a métrica de cada linha. */
export function buildSeries(snaps: Snap[], days: string[], by: GroupBy, metric: Metric, names: { clients: Record<string, string> }): Series[] {
  const byDay = new Map<string, Snap[]>();
  for (const r of snaps) { const a = byDay.get(r.day) || []; a.push(r); byDay.set(r.day, a); }
  const keyOf = (r: Snap) => by === "fase" ? r.phase : by === "onda" ? r.wave : by === "consultor" ? (r.owner || "Não definido") : r.client_id;
  const labelOf = (k: string) => by === "fase" ? (PHASES.find(p => p.key === k)?.short || k) : by === "cliente" ? (names.clients[k] || "Cliente") : k;
  const keys = new Set<string>();
  snaps.forEach(r => { if (!(by === "fase" && r.phase === "fim")) keys.add(keyOf(r)); });
  const ordered = by === "fase" ? PHASES.map(p => p.key).filter(k => keys.has(k)) : by === "onda" ? LANES.filter(k => keys.has(k)) : [...keys];
  const series = ordered.map((k): Series => {
    const points = days.map(day => {
      const rows = byDay.get(day) || [];
      const active = rows.filter(r => r.phase !== "fim");
      const mine = rows.filter(r => keyOf(r) === k);
      const est = rows.length ? rows.every(r => r.est) : false;
      if (!rows.length) return { day, v: null, n: 0, est };
      if (metric === "participacao") { const base = active.length || 1; const n = mine.filter(r => r.phase !== "fim").length; return { day, v: Math.round(n / base * 1000) / 10, n, est }; }
      if (!mine.length) return { day, v: null, n: 0, est };
      const vals = mine.map(r => metric === "avanco" ? r.progress : r.health);
      return { day, v: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10, n: mine.length, est };
    });
    const vs = points.filter(p => p.v !== null) as { v: number; day: string; n: number }[];
    const first = vs[0]?.v ?? null, last = vs[vs.length - 1]?.v ?? null;
    return { key: k, label: labelOf(k), color: "", points, first, last, delta: first !== null && last !== null ? Math.round((last - first) * 10) / 10 : null, peak: vs.length ? Math.max(...vs.map(x => x.v)) : null, low: vs.length ? Math.min(...vs.map(x => x.v)) : null, n: vs[vs.length - 1]?.n ?? 0 };
  }).filter(s => s.last !== null || s.points.some(p => p.v !== null));
  if (by === "cliente" || by === "consultor") series.sort((a, b) => (b.last ?? -1) - (a.last ?? -1));
  series.forEach((s, i) => { s.color = PALETTE[i % PALETTE.length]; });
  return series;
}
