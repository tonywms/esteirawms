// V38 · Números da TV "Pulso de hoje": go-lives chegando, ritmo da semana, bola fora, conquistas e quem está onde.
import type { Appointment, Project, State } from "./types";
import { PHASES, ballOf, healthOf, isArchived, phaseIndex, phaseOf } from "./flow";
import { isDone, todayISO } from "./metrics";
import { infraSummary, pendText } from "./infra";
import { forecastAll, type Forecast } from "./forecast";

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : "");
const addDays = (d: string, n: number) => new Date(new Date(d + "T12:00:00").getTime() + n * 864e5).toISOString().slice(0, 10);
const LABEL_IDX = new Map<string, number>(PHASES.map((p, i) => [p.label.toLowerCase(), i]));
const idxOfLabel = (l: string) => LABEL_IDX.get(l.trim().toLowerCase()) ?? PHASES.findIndex(p => p.short.toLowerCase() === l.trim().toLowerCase());

export type Win = { id: string; at: string; projectId: string; clientId: string; kind: "fase" | "golive" | "doc"; text: string };
export type Who = { person: string; today: Appointment[]; tomorrow: Appointment[] };

/** Avanços de fase (para frente) registrados no histórico do projeto. */
function forwardMoves(p: Project) {
  const out: { at: string; to: number; from: number }[] = [];
  for (const e of p.timeline || []) {
    if (e.kind !== "fase") continue;
    const m = /Fase:\s*(.+?)\s*→\s*(.+)$/.exec(e.text || ""); if (!m) continue;
    const a = idxOfLabel(m[1]), b = idxOfLabel(m[2]);
    if (a >= 0 && b > a) out.push({ at: e.at, from: a, to: b });
  }
  return out;
}

export function tvPulse(s: State, today = todayISO()) {
  const active = s.projects.filter(p => !isArchived(p, today) && phaseOf(p) !== "fim" && !isDone(p.status));
  const name = (id: string) => s.clients.find(c => c.id === id)?.name || "Cliente";
  const in30 = addDays(today, 30);

  // go-lives prometidos nos próximos 30 dias
  const goLives = active.filter(p => day(p.goLiveDate) >= today && day(p.goLiveDate) <= in30).sort((a, b) => day(a.goLiveDate).localeCompare(day(b.goLiveDate)));
  const noDate = active.filter(p => !p.goLiveDate).length;

  // ritmo: avanços de fase por semana (6 semanas, a atual por último)
  const moves = s.projects.flatMap(p => forwardMoves(p).map(m => ({ ...m, p })));
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const end = addDays(today, -7 * (5 - i)), start = addDays(end, -6);
    return { start, end, n: moves.filter(m => day(m.at) >= start && day(m.at) <= end).length };
  });
  const thisWeek = weeks[5].n, prev = weeks.slice(1, 5).map(w => w.n), avg4 = prev.length ? Math.round((prev.reduce((a, b) => a + b, 0) / prev.length) * 10) / 10 : 0;

  // bola fora (cliente / ERP) e há quanto tempo
  const reports = active.map(p => ({ p, h: healthOf(p, today, s.tasks), ball: ballOf(p) }));
  const out = reports.filter(r => r.ball !== "WMS Expert");
  const outLong = out.filter(r => (r.h.idle ?? 0) >= 5);
  const red = reports.filter(r => r.h.health === "red").length, amber = reports.filter(r => r.h.health === "amber").length;

  // conquistas da semana: fases avançadas, go-lives e documentos assinados
  const since = addDays(today, -6), wins: Win[] = [];
  for (const p of s.projects) {
    for (const m of forwardMoves(p)) if (day(m.at) >= since) {
      const to = PHASES[m.to];
      wins.push({ id: `${p.id}-f-${m.at}`, at: m.at, projectId: p.id, clientId: p.clientId, kind: to.key === "fim" || to.key === "golive" ? "golive" : "fase", text: to.key === "fim" ? `${name(p.clientId)} encerrou o projeto` : to.key === "golive" ? `${name(p.clientId)} entrou em Go-live` : `${name(p.clientId)} avançou para ${to.short}` });
    }
    for (const ph of PHASES) { const d = p.phases?.[ph.key]?.doc; if (d?.uploadedAt && day(d.uploadedAt) >= since) wins.push({ id: `${p.id}-d-${ph.key}`, at: d.uploadedAt, projectId: p.id, clientId: p.clientId, kind: "doc", text: `${name(p.clientId)} · ${ph.doc.replace("Documento de ", "termo de ")} anexado` }); }
    for (const x of p.extraDocs || []) { const t = x.signed?.uploadedAt; if (t && day(t) >= since) wins.push({ id: `${p.id}-x-${x.id}`, at: t, projectId: p.id, clientId: p.clientId, kind: "doc", text: `${name(p.clientId)} · ${x.title} assinado` }); }
  }
  wins.sort((a, b) => b.at.localeCompare(a.at));

  // quem está onde hoje e amanhã
  let next = addDays(today, 1); const wd = new Date(next + "T12:00:00").getDay(); if (wd === 6) next = addDays(next, 2); else if (wd === 0) next = addDays(next, 1);
  const apps = s.appointments.filter(a => a.status !== "Cancelado" && (a.date === today || a.date === next));
  const people = [...new Set(apps.map(a => a.consultant).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const who: Who[] = people.map(person => ({ person, today: apps.filter(a => a.consultant === person && a.date === today), tomorrow: apps.filter(a => a.consultant === person && a.date === next) }));

  return { active: active.length, goLives, noDate, weeks, thisWeek, avg4, out, outLong, red, amber, wins, who, nextDay: next };
}

/** Go-lives em risco (previsão depois da data prometida) e infra pendente dos go-lives dos próximos 30 dias. */
export function tvRisks(s: State, today = todayISO()) {
  const fc = [...forecastAll(s, today).values()];
  const risk = fc.filter(f => f.status === "atrasado" || f.status === "risco").sort((a, b) => (b.diff ?? 0) - (a.diff ?? 0));
  const in30 = addDays(today, 30);
  const soon = (f: Forecast) => (!!f.promised && f.promised <= in30) || f.phase === "golive" || f.phase === "campo";
  const infra = fc.filter(soon).map(f => ({ f, pend: infraSummary(f.p).pending })).filter(x => x.pend.length)
    .map(x => ({ ...x, text: x.pend.map(pendText).join(", "), late: x.pend.some(i => i.due && i.due < today) }))
    .sort((a, b) => (a.f.promised || a.f.forecast).localeCompare(b.f.promised || b.f.forecast));
  return { risk, infra, phaseShort: (k: string) => PHASES[phaseIndex(k)].short };
}
