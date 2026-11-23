// V29 · Raio-X: comparativo entre consultores, clientes e ondas (desempenho, carga, risco e funil).
import type { Project, State } from "./types";
import { PHASES, docStates, healthOf, isArchived, phaseOf, phaseOwner, ballOf, unlockSummary, type PhaseKey } from "./flow";
import { businessDays } from "./gargalos";
import { forecastAll, paceByOwner } from "./forecast";
import { snapshotRows, type Snap } from "./evolucao";
import { infraSummary } from "./infra";
import { isDone, todayISO, weeklySlots, weekStart } from "./metrics";

const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function samePerson(a?: string | null, b?: string | null) {
  const x = norm(a), y = norm(b); if (!x || !y) return false; if (x === y) return true;
  const fx = x.split(" ")[0], fy = y.split(" ")[0]; return fx.length >= 3 && fx === fy && (x.split(" ").length === 1 || y.split(" ").length === 1);
}
const PLACEHOLDER = /^(a definir|nao definido|time de|dev |cliente|erp|painel|treinamento)/;
const openTask = (t: State["tasks"][number]) => !isDone(t.status) && !/cancel/i.test(t.status);
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const avg = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const LANES = ["Onda 1", "Onda 2", "Onda 3", "Congelado"];
const laneOf = (p: Project) => (LANES.includes(p.wave) ? p.wave : "Onda 1");
const backMoves = (p: Project, since?: string) => (p.timeline || []).filter(e => { if (since && String(e.at).slice(0, 10) < since) return false; const m = (e.text || "").match(/^Fase: (.+) → (.+)$/); if (!m) return false; const a = PHASES.findIndex(x => x.label === m[1]), b = PHASES.findIndex(x => x.label === m[2]); return a >= 0 && b >= 0 && b < a; }).length;

export type Trend = { a: number; b: number; d: number } | null;
function healthBy(rows: Snap[], key: (r: Snap) => string) { const m = new Map<string, number[]>(); for (const r of rows) { if (r.phase === "fim") continue; const k = key(r); m.set(k, [...(m.get(k) || []), Number(r.health) || 0]); } return m; }

export function raioX(s: State, past: Snap[], hist: Snap[], days = 30, today = todayISO()) {
  const active = s.projects.filter(p => !isArchived(p, today) && phaseOf(p) !== "fim");
  const since = addDays(today, -days);
  const fc = forecastAll(s, today), pace = paceByOwner(s, today), unlock = unlockSummary(s, today);
  const nowSnaps = snapshotRows(s, today);
  const H = new Map(active.map(p => [p.id, healthOf(p, today, s.tasks)]));
  const monday = weekStart(new Date(today + "T12:00:00"));

  /* ---------- Consultores ---------- */
  const names: string[] = [];
  for (const n of [...s.staff.filter(x => x.active !== false).map(x => x.name), ...active.map(p => phaseOwner(p))]) if (n && !PLACEHOLDER.test(norm(n)) && !names.some(o => samePerson(o, n))) names.push(n);
  const nowBy = healthBy(nowSnaps, r => r.owner), pastBy = healthBy(past, r => r.owner);
  const consultants = names.map(name => {
    const projs = active.filter(p => samePerson(phaseOwner(p), name));
    const tasks = s.tasks.filter(t => openTask(t) && samePerson(t.owner, name));
    const late = tasks.filter(t => t.dueDate && t.dueDate < today);
    const actions = active.filter(p => (p.nextAction || "").trim() && samePerson(p.nextActionOwner || phaseOwner(p), name));
    const actOk = actions.filter(p => !p.nextActionDue || p.nextActionDue >= today).length;
    const docs = unlock.gaps.filter(g => samePerson(g.owner, name));
    const st = s.staff.find(x => samePerson(x.name, name));
    const slots = st ? weeklySlots(s.appointments, st.name, monday) : s.appointments.filter(a => samePerson(a.consultant, name) && a.status !== "Cancelado" && a.date && a.date >= today.slice(0, 10)).length;
    const cap = st?.capacity || 0;
    const hn = [...nowBy.entries()].filter(([k]) => samePerson(k, name)).flatMap(([, v]) => v), hp = [...pastBy.entries()].filter(([k]) => samePerson(k, name)).flatMap(([, v]) => v);
    const a = avg(hp), b = avg(hn);
    const pc = pace.of(name);
    const visits = s.appointments.filter(x => samePerson(x.consultant, name) && x.status !== "Cancelado" && x.date && x.date >= since && x.date < today).length;
    return { name, projects: projs, red: projs.filter(p => H.get(p.id)?.health === "red").length, pace: pc.ratio, paceN: pc.n, openTasks: tasks.length, late: late.length,
      actions: actions.length, actionsOkPct: actions.length ? Math.round(actOk / actions.length * 100) : null, docs: docs.length, docsBlocking: docs.filter(g => g.blocks).length,
      slots, cap, loadPct: cap ? Math.round(slots / cap * 100) : null, health: b, trend: a !== null && b !== null ? { a, b, d: b - a } as Trend : null, visits,
      backMoves: projs.reduce((n, p) => n + backMoves(p, since), 0) };
  }).sort((x, y) => y.projects.length - x.projects.length || x.name.localeCompare(y.name));

  /* ---------- Clientes (um por projeto ativo) ---------- */
  const histBy = new Map<string, Snap[]>(); for (const r of hist) if (r.day >= since) histBy.set(r.project_id, [...(histBy.get(r.project_id) || []), r]);
  const clients = active.map(p => {
    const h = H.get(p.id)!, f = fc.get(p.id), k = phaseOf(p);
    const name = s.clients.find(c => c.id === p.clientId)?.name || p.name;
    const snaps = histBy.get(p.id) || [];
    const ballOut = snaps.length ? Math.round(snaps.filter(r => r.ball && r.ball !== "WMS Expert").length / snaps.length * 100) : ballOf(p) !== "WMS Expert" ? 100 : 0;
    const start = [p.initialMilestone, ...Object.values(p.phases || {}).map(x => x?.start)].filter(Boolean).map(x => String(x).slice(0, 10)).sort()[0] || String(p.createdAt || "").slice(0, 10) || null;
    const ageBD = start ? businessDays(start, today) : null;
    const rework = backMoves(p);
    const infra = infraSummary(p).pending.length;
    const docsMissing = docStates(p).filter(d => d.state === "missing" || d.state === "pending").length;
    const visits = s.appointments.filter(x => x.projectId === p.id && x.status !== "Cancelado" && x.date && x.date < today).length;
    const late = s.tasks.filter(t => t.projectId === p.id && openTask(t) && t.dueDate && t.dueDate < today).length;
    const diff = f?.diff ?? null;
    const parts: [number, string][] = [
      [h.health === "red" ? 25 : h.health === "amber" ? 10 : 0, h.health === "red" ? "crítico no semáforo" : "em atenção"],
      [Math.min(20, h.idle ?? 0), `${h.idle ?? 0} dias sem movimento`],
      [diff && diff > 0 ? Math.min(20, diff * 2) : 0, `${diff} du após a data prometida`],
      [Math.round(ballOut * 0.15), `bola fora da WMS em ${ballOut}% do tempo`],
      [Math.min(10, rework * 5), `${rework} volta(s) de fase`],
      [Math.min(9, infra * 3), `${infra} pendência(s) de infra`],
      [Math.min(10, docsMissing * 2), `${docsMissing} documento(s) faltando`],
      [Math.min(10, late * 3), `${late} atividade(s) vencida(s)`],
    ];
    const risk = Math.min(100, parts.reduce((a, [v]) => a + v, 0));
    const why = parts.filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, t]) => t);
    return { p, name, phase: k as PhaseKey, owner: phaseOwner(p), wave: laneOf(p), health: h.health, idle: h.idle, ageBD, forecast: f?.forecast || null, promised: f?.promised || null, diff, ballOut, rework, infra, docsMissing, visits, late, risk, why };
  }).sort((a, b) => b.risk - a.risk);

  /* ---------- Ondas ---------- */
  const waves = LANES.map(w => {
    const projs = active.filter(p => laneOf(p) === w);
    const prog = nowSnaps.filter(r => projs.some(p => p.id === r.project_id));
    const funnel = PHASES.filter(ph => ph.key !== "fim").map(ph => ({ key: ph.key, short: ph.short, n: projs.filter(p => phaseOf(p) === ph.key).length }));
    const in30 = addDays(today, 30);
    const goLives = projs.filter(p => { const f = fc.get(p.id); return f && f.status !== "virou" && f.forecast <= in30; }).length;
    let ok = 0, need = 0; for (const p of projs) for (const d of docStates(p)) { if (d.state === "future" || d.state === "skipped") continue; need++; if (d.state === "ok" || d.state === "waived") ok++; }
    const pb = past.filter(r => projs.some(p => p.id === r.project_id) && r.phase !== "fim").map(r => Number(r.health) || 0);
    const b = avg(prog.map(r => r.health)), a = avg(pb);
    return { wave: w, projects: projs, count: projs.length, progress: avg(prog.map(r => r.progress)), health: b, trend: a !== null && b !== null ? { a, b, d: b - a } as Trend : null,
      red: projs.filter(p => H.get(p.id)?.health === "red").length, funnel, goLives, docsPct: need ? Math.round(ok / need * 100) : null,
      idleAvg: avg(projs.map(p => H.get(p.id)?.idle ?? 0)), ballOut: projs.length ? Math.round(projs.filter(p => ballOf(p) !== "WMS Expert").length / projs.length * 100) : 0 };
  }).filter(w => w.count);

  /* ---------- Frases ---------- */
  const tops: Record<"consultores" | "clientes" | "ondas", string[]> = { consultores: [], clientes: [], ondas: [] };
  const busiest = consultants[0];
  if (busiest?.projects.length) tops.consultores.push(`${busiest.name} concentra ${busiest.projects.length} de ${active.length} projetos ativos como dono da fase${busiest.paceN >= 2 ? ` e trabalha a ${busiest.pace.toFixed(1).replace(".", ",")}× a meta` : ""}.`);
  const over = consultants.filter(c => c.loadPct !== null && c.loadPct > 100); if (over.length) tops.consultores.push(`Acima da capacidade nesta semana: ${over.map(c => `${c.name} (${c.loadPct}%)`).join(", ")}.`);
  const lateC = [...consultants].sort((a, b) => b.late - a.late)[0]; if (lateC?.late) tops.consultores.push(`${lateC.name} tem ${lateC.late} atividade(s) vencida(s) — o maior acúmulo da equipe.`);
  const free = consultants.filter(c => c.loadPct !== null && c.loadPct < 50 && c.cap); if (free.length && tops.consultores.length < 3) tops.consultores.push(`Com folga na agenda: ${free.map(c => c.name).join(", ")}.`);
  const worst = clients[0]; if (worst) tops.clientes.push(`${worst.name} é o maior risco (${worst.risk}/100): ${worst.why.join(" e ")}.`);
  const outside = clients.filter(c => c.ballOut >= 50); if (outside.length) tops.clientes.push(`${outside.length} projeto(s) ficaram com a bola fora da WMS Expert em metade ou mais do tempo — ${outside.slice(0, 3).map(c => c.name).join(", ")}.`);
  const reworkC = clients.filter(c => c.rework > 0); if (reworkC.length) tops.clientes.push(`${reworkC.length} projeto(s) já voltaram de fase (${reworkC.slice(0, 3).map(c => c.name).join(", ")}).`);
  else if (clients.length) tops.clientes.push(`Risco médio da carteira: ${avg(clients.map(c => c.risk))}/100.`);
  const bigW = [...waves].sort((a, b) => b.count - a.count)[0]; if (bigW) { const top = [...bigW.funnel].sort((a, b) => b.n - a.n)[0]; tops.ondas.push(`${bigW.wave} tem ${bigW.count} projetos; ${top.n} deles em ${top.short}.`); }
  const redW = [...waves].sort((a, b) => b.red / Math.max(1, b.count) - a.red / Math.max(1, a.count))[0]; if (redW?.red) tops.ondas.push(`${redW.wave} tem a maior proporção de críticos: ${redW.red} de ${redW.count}.`);
  const gl = waves.reduce((a, w) => a + w.goLives, 0); tops.ondas.push(gl ? `${gl} go-live(s) previsto(s) nos próximos 30 dias: ${waves.filter(w => w.goLives).map(w => `${w.wave} (${w.goLives})`).join(", ")}.` : "Nenhum go-live previsto nos próximos 30 dias.");
  return { consultants, clients, waves, tops, active: active.length };
}
