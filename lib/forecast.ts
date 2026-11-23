// V27 · Previsão de go-live: quando cada projeto deve virar, a partir da fase atual, das metas por fase
// e do ritmo real do dono da fase (quanto ele costuma levar em relação à meta).
import type { Project, State } from "./types";
import { PHASES, isArchived, phaseIndex, phaseOf, phaseOwner, phaseSince, healthOf, type PhaseKey } from "./flow";
import { PHASE_GOALS, businessDays } from "./gargalos";
import { todayISO } from "./metrics";

export type ForecastStatus = "virou" | "ok" | "risco" | "atrasado" | "sem-data";
export type Forecast = {
  p: Project; client: string; phase: PhaseKey; owner: string;
  forecast: string; promised: string | null; diff: number | null; status: ForecastStatus;
  confidence: "alta" | "média" | "baixa"; ratio: number; samples: number;
  steps: { phase: PhaseKey; days: number; current?: boolean }[]; remaining: number; reason: string;
};

const iso = (v?: string | null) => (v ? String(v).slice(0, 10) : null);
const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const isWork = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
export function addBD(from: string, n: number) { const d = new Date(from + "T12:00:00"); let i = 0; while (i < n) { d.setDate(d.getDate() + 1); if (isWork(d)) i++; } return d.toISOString().slice(0, 10); }
/** Diferença em dias úteis (positivo = b depois de a). */
export function bdDiff(a: string, b: string) { return b >= a ? (businessDays(a, b) ?? 0) : -(businessDays(b, a) ?? 0); }
const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Ritmo por dono de fase: dias reais ÷ meta, nas fases concluídas dos últimos 180 dias. */
export function paceByOwner(s: State, today = todayISO()) {
  const since = new Date(new Date(today + "T12:00:00").getTime() - 180 * 864e5).toISOString().slice(0, 10);
  const by = new Map<string, number[]>(), all: number[] = [];
  for (const p of s.projects) for (const ph of PHASES) {
    const g = PHASE_GOALS[ph.key], info = p.phases?.[ph.key]; if (!g || !info?.start || !info.done) continue;
    if (iso(info.done)! < since) continue;
    const real = businessDays(info.start, iso(info.done)!); if (real === null || real <= 0) continue;
    const r = real / g.goal, who = norm(info.owner || phaseOwner(p, ph.key));
    by.set(who, [...(by.get(who) || []), r]); all.push(r);
  }
  const global = clamp(median(all) ?? 1, 0.7, 3);
  return { of: (owner: string) => { const v = by.get(norm(owner)) || []; return v.length >= 2 ? { ratio: clamp(median(v)!, 0.7, 3), n: v.length } : { ratio: global, n: v.length }; }, global, samples: all.length };
}

const cache = new WeakMap<State, Map<string, Forecast>>();
export function forecastAll(s: State, today = todayISO()): Map<string, Forecast> {
  const hit = cache.get(s); if (hit) return hit;
  const pace = paceByOwner(s, today), out = new Map<string, Forecast>();
  for (const p of s.projects) {
    if (isArchived(p, today)) continue;
    const k = phaseOf(p); if (k === "fim") continue;
    const owner = phaseOwner(p, k), client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
    const promised = iso(p.goLiveDate);
    const pr = pace.of(owner);
    if (k === "golive") {
      const virou = iso(p.phases?.golive?.start) || iso(phaseSince(p, k)) || today;
      out.set(p.id, { p, client, phase: k, owner, forecast: virou, promised, diff: promised ? bdDiff(promised, virou) : null, status: "virou", confidence: "alta", ratio: pr.ratio, samples: pr.n, steps: [], remaining: 0, reason: `Virou em ${virou.split("-").reverse().join("/")}` });
      continue;
    }
    const start = iso(p.phases?.[k]?.start), since = start || iso(phaseSince(p, k)) || today;
    const elapsed = businessDays(since, today) ?? 0;
    const goal = PHASE_GOALS[k]?.goal ?? 5, expected = Math.max(1, Math.round(goal * pr.ratio));
    const overdue = elapsed >= expected;
    const curLeft = overdue ? Math.max(1, Math.ceil(expected * 0.5)) : expected - elapsed;
    const h = healthOf(p, today, s.tasks);
    const blocked = h.health === "red" && h.reasons.some(r => /empecilho|travado|recusad/i.test(r));
    const steps: Forecast["steps"] = [{ phase: k, days: curLeft + (blocked ? 2 : 0), current: true }];
    for (const ph of PHASES.slice(phaseIndex(k) + 1)) {
      if (ph.key === "golive" || ph.key === "fim") break;
      const g = PHASE_GOALS[ph.key]?.goal; if (!g) continue;
      steps.push({ phase: ph.key, days: Math.max(1, Math.round(g * pr.ratio)) });
    }
    const remaining = steps.reduce((a, x) => a + x.days, 0);
    const forecast = addBD(today, remaining);
    const diff = promised ? bdDiff(promised, forecast) : null;
    const status: ForecastStatus = !promised ? "sem-data" : diff! <= 0 ? "ok" : diff! <= 5 ? "risco" : "atrasado";
    const confidence = !start ? "baixa" : pr.n >= 2 && !blocked ? "alta" : "média";
    const why: string[] = [];
    why.push(overdue ? `já passou da meta na fase (${elapsed} de ${expected} du) — contando mais ${curLeft} du` : `${elapsed} de ${expected} du na fase`);
    if (blocked) why.push("+2 du pelo empecilho");
    if (Math.abs(pr.ratio - 1) >= 0.1) why.push(`ritmo ${pr.ratio.toFixed(1).replace(".", ",")}× a meta${pr.n >= 2 ? ` (${owner})` : " (média da equipe)"}`);
    if (!start) why.push("fase sem data de início (estimada)");
    out.set(p.id, { p, client, phase: k, owner, forecast, promised, diff, status, confidence, ratio: pr.ratio, samples: pr.n, steps, remaining, reason: why.join(" · ") });
  }
  cache.set(s, out);
  return out;
}
export const forecastOf = (s: State, p: Project) => forecastAll(s).get(p.id) || null;

export const STATUS_LABEL: Record<ForecastStatus, string> = { virou: "Virou", ok: "No prazo", risco: "Em risco", atrasado: "Atrasado", "sem-data": "Sem data prometida" };
export const br = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const brShort = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "—");
