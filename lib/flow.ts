// V7 · Esteira por fases: começo, meio e fim de cada projeto, com dono por fase,
// semáforo automático e "com quem está a bola". Tudo calculado, sem preenchimento extra.
import type { Project, State, PhaseInfo, Task } from "./types";
import { isBlocked, isDone, todayISO } from "./metrics";
import { infraSummary, pendText } from "./infra";

// V8 · Ordem oficial: Kickoff/Treinamento > Dev & Integração > Homologação > Implantação (opcional) > Go-live > Encerrado.
// Cada fase (menos Encerrado) exige o seu PDF assinado para liberar o avanço.
export const PHASES = [
  { key: "kickoff", label: "Kickoff / Treinamento", short: "Kickoff / Treinamento", defaultOwner: "Félix", doc: "Documento de endereçamento", letter: "K", optional: false },
  { key: "dev", label: "Desenvolvimento / Integração", short: "Dev & Integração", defaultOwner: "Dev & Integrações", doc: "Documento de integração", letter: "D", optional: false },
  { key: "homolog", label: "Homologação", short: "Homologação", defaultOwner: "Time de Implantação", doc: "Documento de homologação", letter: "H", optional: false },
  { key: "campo", label: "Implantação", short: "Implantação", defaultOwner: "Time de Implantação", doc: "Documento de implantação", letter: "I", optional: true },
  { key: "golive", label: "Go-live", short: "Go-live", defaultOwner: "Time de Implantação", doc: "Documento de go-live", letter: "G", optional: false },
  { key: "fim", label: "Encerrado", short: "Encerrado", defaultOwner: "", doc: "", letter: "", optional: false },
] as const;
export type PhaseKey = (typeof PHASES)[number]["key"];
export const WAVES = ["Onda 1", "Onda 2", "Onda 3", "Congelado", "Concluído"];
export const BALL = ["WMS Expert", "Cliente", "ERP Parceiro"] as const;

const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isoDay = (v?: string | null) => (v ? String(v).slice(0, 10) : null);
export const daysBetween = (from?: string | null, to = todayISO()) => {
  const a = isoDay(from); if (!a) return null;
  const d = Math.round((new Date(to + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5);
  return Number.isFinite(d) ? Math.max(0, d) : null;
};

/** Fase do projeto. Projetos antigos (sem `phase`) são posicionados pelo status/etapa atuais. */
export function phaseOf(p: Project): PhaseKey {
  if (p.phase && PHASES.some(x => x.key === p.phase)) return p.phase as PhaseKey;
  const st = norm(p.status), stage = norm(p.stage);
  if (isDone(p.status) || stage.includes("go-live concluido") || stage.includes("golive concluido")) return "fim";
  if (stage.includes("go live") || stage.includes("go-live") || stage.includes("golive") || stage.includes("virada")) return "golive";
  if (stage.includes("kickoff") || stage.includes("planejamento") || stage.includes("treinamento")) return "kickoff";
  if (stage.includes("homolog") || stage.includes("termo") || st.includes("finaliza")) return "homolog";
  if (stage.includes("campo") || stage.includes("implanta") || stage.includes("validacao") || st.includes("implanta")) return "campo";
  return "dev";
}
/* V34 · Fluxo do projeto: completo (todas as fases) ou simplificado (customização: homologação e go-live). */
export const SIMPLE_PHASES: PhaseKey[] = ["homolog", "golive", "fim"];
export const isSimpleFlow = (p: Pick<Project, "flow">) => p.flow === "simples";
/** Fases que fazem parte do fluxo deste projeto. */
export const flowPhases = (p: Pick<Project, "flow">) => (isSimpleFlow(p) ? PHASES.filter(x => SIMPLE_PHASES.includes(x.key)) : [...PHASES]);
export const inFlow = (p: Pick<Project, "flow">, k: string) => !isSimpleFlow(p) || SIMPLE_PHASES.includes(k as PhaseKey);
export const phaseIndex = (k: string) => Math.max(0, PHASES.findIndex(p => p.key === k));
export const phaseLabel = (k: string) => PHASES.find(p => p.key === k)?.label || k;

/** Dono da fase atual (o que foi definido na fase, senão o responsável coerente do projeto). */
export function phaseOwner(p: Project, k: PhaseKey = phaseOf(p)): string {
  const set = p.phases?.[k]?.owner?.trim();
  if (set) return set;
  if (k === "dev") return p.integrationOwner || "Dev & Integrações";
  if (k === "campo" || k === "golive" || k === "homolog") return p.implementationOwner || "Time de Implantação";
  return PHASES.find(x => x.key === k)?.defaultOwner || "Não definido";
}

/** Com quem está a bola agora. */
export function ballOf(p: Project): string {
  if (p.ballWith) return p.ballWith;
  const t = norm(`${p.team} ${p.blocker}`);
  if (t.includes("erp") || t.includes("parceiro") || t.includes("api") && t.includes("erp")) return "ERP Parceiro";
  if (t.includes("cliente") || t.includes("clinete") || t.includes("assinatura") || t.includes("aprovacao")) return "Cliente";
  return "WMS Expert";
}

export const phaseSince = (p: Project, k: PhaseKey = phaseOf(p)) => p.phases?.[k]?.start || p.lastMovement || isoDay(p.updatedAt) || null;
export const lastTouch = (p: Project) => {
  const ev = (p.timeline || []).map(e => isoDay(e.at)).filter(Boolean) as string[];
  return [isoDay(p.lastMovement), ...ev].filter(Boolean).sort().pop() || isoDay(p.updatedAt);
};

export type Health = "green" | "amber" | "red" | "done";
export type HealthReport = { health: Health; reasons: string[]; idle: number | null; inPhase: number | null; due: string | null };

/** Semáforo automático. */
/** V10.2 · Atividades abertas do projeto que pesam no semáforo (vencidas, com empecilho, sem prazo). */
export function taskSignals(p: Project, tasks: Task[] = [], today = todayISO()) {
  const open = tasks.filter(t => t.projectId === p.id && !isDone(t.status) && !norm(t.status).includes("cancel"));
  const blankTxt = (v?: string) => { const x = (v || "").trim(); return !x || x === "-" || x === "—"; };
  const overdue = open.filter(t => t.dueDate && t.dueDate < today).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const blocked = open.filter(t => !blankTxt(t.blocker));
  const noDue = open.filter(t => !t.dueDate);
  return { open, overdue, blocked, noDue };
}
const short = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function healthOf(p: Project, today = todayISO(), tasks?: Task[]): HealthReport {
  const k = phaseOf(p);
  const idle = daysBetween(lastTouch(p), today);
  const inPhase = daysBetween(phaseSince(p, k), today);
  const due = p.phases?.[k]?.due || (k === "dev" ? p.integrationDelivery : k === "homolog" ? p.homologationDate : k === "golive" ? p.goLiveDate : null) || null;
  if (k === "fim" || isDone(p.status)) return { health: "done", reasons: ["Projeto encerrado"], idle, inPhase, due };
  const red: string[] = [], amber: string[] = [];
  const blocker = (p.blocker || "").trim();
  if (isBlocked(p.status)) red.push("Status travado / em ajustes");
  if (blocker && blocker !== "-") red.push(`Empecilho: ${blocker}`);
  const ts = taskSignals(p, tasks, today);
  const tb = ts.blocked.filter(t => norm(t.blocker).trim() !== norm(blocker).trim()); // não repete o empecilho do projeto
  if (tb.length) red.push(tb.length === 1 ? `Empecilho na atividade “${short(tb[0].title)}”: ${short(tb[0].blocker, 60)}` : `${tb.length} atividades com empecilho (ex.: ${short(tb[0].blocker, 50)})`);
  if (due && due < today) red.push(`Prazo da fase vencido em ${due.split("-").reverse().join("/")}`);
  if (ts.overdue.length) red.push(ts.overdue.length === 1 ? `Atividade vencida em ${String(ts.overdue[0].dueDate).split("-").reverse().join("/")}: “${short(ts.overdue[0].title)}”` : `${ts.overdue.length} atividades vencidas (mais antiga: ${String(ts.overdue[0].dueDate).split("-").reverse().join("/")})`);
  if (idle !== null && idle >= 7) red.push(`Sem movimentação há ${idle} dias`);
  else if (idle !== null && idle >= 3) amber.push(`Parado há ${idle} dias`);
  if (due && due >= today && (daysBetween(today, due) ?? 99) <= 2) amber.push("Prazo da fase vence em até 2 dias");
  if (ts.noDue.length) amber.push(ts.noDue.length === 1 ? `Atividade sem prazo: “${short(ts.noDue[0].title)}”` : `${ts.noDue.length} atividades sem prazo`);
  if (!(p.nextAction || "").trim()) amber.push("Sem próxima ação definida");
  // V28: pendências da infraestrutura (coletores, rede, usuário-chave...)
  const infraPend = infraSummary(p).pending;
  if (infraPend.length) { const lateI = infraPend.filter(x => x.due && x.due < today); (lateI.length ? red : amber).push(`${lateI.length ? "Pendência de infra vencida" : "Infra pendente"}: ${infraPend.map(pendText).join(", ")}`); }
  const missingDocs = docStates(p).filter(d => d.state === "missing");
  if (missingDocs.length) amber.push(`Documentação pendente: ${missingDocs.map(d => d.doc.replace("Documento de ", "")).join(", ")}`);
  const refused = PHASES.filter(ph => ph.doc && p.phases?.[ph.key]?.sign?.status === "refused" && !p.phases?.[ph.key]?.doc);
  if (refused.length) red.push(`Assinatura recusada na ZapSign: ${refused.map(ph => ph.doc.replace("Documento de ", "")).join(", ")}`);
  const sentDocs = docStates(p).filter(d => d.state === "sent");
  if (sentDocs.length) amber.push(`Aguardando assinatura do cliente: ${sentDocs.map(d => d.doc.replace("Documento de ", "")).join(", ")}`);
  if (norm(p.wave) === "congelado") amber.push("Onda congelada");
  return { health: red.length ? "red" : amber.length ? "amber" : "green", reasons: [...red, ...amber], idle, inPhase, due };
}

export const healthLabel: Record<Health, string> = { green: "No fluxo", amber: "Atenção", red: "Crítico", done: "Encerrado" };

/** Projetos visíveis na operação: encerrados há mais de 30 dias vão para o arquivo. */
export const isCancelled = (p: Project) => norm(p.status).includes("cancel");
export function isArchived(p: Project, today = todayISO()) {
  if (p.archivedAt || isCancelled(p)) return true;
  if (phaseOf(p) !== "fim") return false;
  const closed = p.phases?.fim?.start || p.goLiveDate || p.lastMovement || isoDay(p.updatedAt);
  return (daysBetween(closed, today) ?? 0) > 30;
}

export function flowSummary(s: State) {
  const active = s.projects.filter(p => !isArchived(p));
  const reports = active.map(p => ({ p, phase: phaseOf(p), h: healthOf(p, todayISO(), s.tasks) }));
  const byPhase = PHASES.map(ph => ({ ...ph, items: reports.filter(r => r.phase === ph.key) }));
  const count = (h: Health) => reports.filter(r => r.h.health === h).length;
  const ball = BALL.map(b => ({ name: b, count: reports.filter(r => r.h.health !== "done" && ballOf(r.p) === b).length }));
  const today = todayISO(), in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const goLives = reports.filter(r => r.p.goLiveDate && r.p.goLiveDate >= today && r.p.goLiveDate <= in7 && r.h.health !== "done")
    .sort((a, b) => String(a.p.goLiveDate).localeCompare(String(b.p.goLiveDate)));
  const critical = reports.filter(r => r.h.health === "red").sort((a, b) => (b.h.idle ?? 0) - (a.h.idle ?? 0));
  const attention = reports.filter(r => r.h.health === "amber").sort((a, b) => (b.h.idle ?? 0) - (a.h.idle ?? 0));
  return { reports, byPhase, red: count("red"), amber: count("amber"), green: count("green"), done: count("done"), ball, goLives, critical, attention, archived: s.projects.length - active.length };
}

/** Monta o patch para mover o projeto de fase (registra datas e evento na linha do tempo). */
export function movePhasePatch(p: Project, to: PhaseKey, author = "Equipe") {
  const from = phaseOf(p), today = todayISO(), now = new Date().toISOString();
  const phases: Record<string, PhaseInfo> = { ...(p.phases || {}) };
  phases[from] = { ...(phases[from] || {}), owner: phases[from]?.owner || phaseOwner(p, from), start: phases[from]?.start || phaseSince(p, from), done: phaseIndex(to) > phaseIndex(from) ? today : phases[from]?.done || null };
  phases[to] = { ...(phases[to] || {}), owner: phases[to]?.owner || phaseOwner(p, to), start: today, done: to === "fim" ? today : null };
  const statusFor: Record<PhaseKey, string> = { kickoff: "Pendente de Integração", dev: "Pendente de Integração", homolog: "Pendente de Implantação", campo: "Pendente de Implantação", golive: "Pendente de Finalização", fim: "Concluído" };
  const progressFor: Record<PhaseKey, number> = { kickoff: 5, dev: 25, homolog: 50, campo: 70, golive: 90, fim: 100 };
  const timeline = [{ id: crypto.randomUUID(), at: now, kind: "fase", author, text: `Fase: ${phaseLabel(from)} → ${phaseLabel(to)}` }, ...(p.timeline || [])];
  return {
    phase: to, phases, timeline, lastMovement: today,
    status: isBlocked(p.status) && to !== "fim" ? p.status : statusFor[to],
    progress: Math.max(to === "fim" ? 100 : 0, Math.min(100, Math.max(p.progress || 0, progressFor[to]))),
    stage: phaseLabel(to),
    wave: to === "fim" ? "Concluído" : p.wave,
  };
}


/* ---------- V8 · Documentos obrigatórios por fase ---------- */
export type DocState = "ok" | "waived" | "missing" | "pending" | "sent" | "skipped" | "future";
export const DOC_PHASES = PHASES.filter(p => p.doc) as unknown as { key: PhaseKey; label: string; short: string; doc: string; letter: string; optional: boolean }[];
export const docOf = (p: Project, k: string) => p.phases?.[k]?.doc || null;
/** V9 · PDF dispensado por usuário master (registro de quem liberou e por quê). */
export const waiverOf = (p: Project, k: string) => p.phases?.[k]?.docWaived || null;
export const docResolved = (p: Project, k: string) => !!docOf(p, k) || !!waiverOf(p, k);
/** Implantação pulada: o projeto passou dela sem nunca ter entrado. */
const campoSkipped = (p: Project, cur: PhaseKey) => phaseIndex(cur) > phaseIndex("campo") && !p.phases?.campo?.start && !docOf(p, "campo");
/** Situação do PDF de cada fase: ok (anexado), pending (fase atual sem PDF), missing (fase já passada sem PDF), skipped, future. */
export function docStates(p: Project): { key: PhaseKey; letter: string; doc: string; label: string; state: DocState }[] {
  const cur = phaseOf(p), ci = phaseIndex(cur);
  return DOC_PHASES.map(ph => {
    const i = phaseIndex(ph.key);
    let state: DocState = docOf(p, ph.key) ? "ok" : i < ci ? "missing" : i === ci ? "pending" : "future";
    if (ph.key === "campo" && state === "missing" && campoSkipped(p, cur)) state = "skipped";
    if (!inFlow(p, ph.key) && state !== "ok") state = "skipped"; // V34: fase fora do fluxo simplificado
    if ((state === "pending" || state === "missing") && p.phases?.[ph.key]?.docSentAt) state = "sent";
    if (state !== "ok" && state !== "future" && state !== "skipped" && waiverOf(p, ph.key)) state = "waived";
    return { key: ph.key, letter: ph.letter, doc: ph.doc, label: ph.short, state };
  });
}
/** Regra de avanço: só avança com o PDF da fase atual anexado. De Homologação pode ir direto ao Go-live (pulando Implantação). */
export function canMove(p: Project, to: PhaseKey): { ok: boolean; reason?: string } {
  const from = phaseOf(p), fi = phaseIndex(from), ti = phaseIndex(to);
  if (ti <= fi) return { ok: true };
  const skipsOnlyCampo = from === "homolog" && to === "golive";
  // V34: fluxo simplificado entra direto na Homologação, sem os PDFs de kickoff e integração
  if (isSimpleFlow(p) && !inFlow(p, from)) return to === "homolog" || ti <= phaseIndex("homolog") ? { ok: true } : { ok: false, reason: "Fluxo simplificado: comece pela Homologação." };
  if (ti - fi > 1 && !skipsOnlyCampo) return { ok: false, reason: "Avance uma fase por vez." };
  const ph = PHASES[fi];
  if (ph.doc && !docResolved(p, from)) return { ok: false, reason: `Anexe o ${ph.doc.toLowerCase()} (PDF assinado) para sair de ${ph.short}.` };
  return { ok: true };
}
export const docsPending = (p: Project) => docStates(p).filter(d => d.state === "missing" || d.state === "pending" || d.state === "sent");

/* ---------- V8.1 · Destravar a onda (painel de TV) ---------- */
export type DocGap = { p: Project; key: PhaseKey; doc: string; label: string; letter: string; state: DocState; blocks: boolean; owner: string; days: number };
/** Tudo o que a equipe precisa saber para a onda andar: quem pode avançar já, o que falta de PDF e com quem está. */
export function unlockSummary(s: State, today = todayISO()) {
  const active = s.projects.filter(p => !isArchived(p, today)).filter(p => phaseOf(p) !== "fim" && !isDone(p.status));
  const ready = active.filter(p => { const k = phaseOf(p); return !!PHASES[phaseIndex(k)].doc && docResolved(p, k); })
    .map(p => { const k = phaseOf(p); const to = k === "homolog" ? "campo" : PHASES[phaseIndex(k) + 1].key; return { p, from: k, to: to as PhaseKey, days: daysBetween(p.phases?.[k]?.doc?.uploadedAt || p.phases?.[k]?.docWaived?.at, today) ?? 0 }; })
    .sort((a, b) => b.days - a.days);
  const gaps: DocGap[] = [];
  for (const p of active) for (const d of docStates(p)) {
    if (d.state !== "pending" && d.state !== "missing" && d.state !== "sent") continue;
    const info = p.phases?.[d.key];
    const since = d.state === "sent" ? info?.docSentAt : d.state === "pending" ? phaseSince(p, d.key) : info?.done || info?.start || phaseSince(p);
    gaps.push({ p, key: d.key, doc: d.doc, label: d.label, letter: d.letter, state: d.state, blocks: d.key === phaseOf(p), owner: d.state === "sent" ? "Cliente (assinatura)" : phaseOwner(p, d.key), days: daysBetween(since, today) ?? 0 });
  }
  gaps.sort((a, b) => Number(b.blocks) - Number(a.blocks) || Number(a.state === "sent") - Number(b.state === "sent") || b.days - a.days);
  const blocked = gaps.filter(g => g.blocks);
  const ownerMap = new Map<string, { name: string; total: number; blocks: number; letters: Record<string, number> }>();
  for (const g of gaps) { const o = ownerMap.get(g.owner) || { name: g.owner, total: 0, blocks: 0, letters: {} }; o.total++; if (g.blocks) o.blocks++; o.letters[g.letter] = (o.letters[g.letter] || 0) + 1; ownerMap.set(g.owner, o); }
  const owners = [...ownerMap.values()].sort((a, b) => b.blocks - a.blocks || b.total - a.total);
  const coverage = DOC_PHASES.map(ph => {
    let ok = 0, need = 0, sent = 0;
    for (const p of s.projects.filter(x => !isArchived(x, today))) { const st = docStates(p).find(d => d.key === ph.key)!.state; if (st === "future" || st === "skipped") continue; need++; if (st === "ok" || st === "waived") ok++; if (st === "sent") sent++; }
    return { key: ph.key, letter: ph.letter, short: ph.short, ok, sent, need, pct: need ? Math.round((ok / need) * 100) : 100 };
  });
  const movedWeek = active.filter(p => { const k = phaseOf(p); const st = p.phases?.[k]?.start; return k !== "kickoff" && !!st && (daysBetween(st, today) ?? 99) <= 6; }).length
    + s.projects.filter(p => phaseOf(p) === "fim" && (daysBetween(p.phases?.fim?.start, today) ?? 99) <= 6).length;
  return { ready, gaps, blocked, owners, coverage, movedWeek, sent: gaps.filter(g => g.state === "sent").length };
}
