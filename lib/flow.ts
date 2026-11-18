// V7 · Esteira por fases: começo, meio e fim de cada projeto, com dono por fase,
// semáforo automático e "com quem está a bola". Tudo calculado, sem preenchimento extra.
import type { Project, State, PhaseInfo } from "./types";
import { isBlocked, isDone, todayISO } from "./metrics";

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
export function healthOf(p: Project, today = todayISO()): HealthReport {
  const k = phaseOf(p);
  const idle = daysBetween(lastTouch(p), today);
  const inPhase = daysBetween(phaseSince(p, k), today);
  const due = p.phases?.[k]?.due || (k === "dev" ? p.integrationDelivery : k === "homolog" ? p.homologationDate : k === "golive" ? p.goLiveDate : null) || null;
  if (k === "fim" || isDone(p.status)) return { health: "done", reasons: ["Projeto encerrado"], idle, inPhase, due };
  const red: string[] = [], amber: string[] = [];
  const blocker = (p.blocker || "").trim();
  if (isBlocked(p.status)) red.push("Status travado / em ajustes");
  if (blocker && blocker !== "-") red.push(`Empecilho: ${blocker}`);
  if (due && due < today) red.push(`Prazo da fase vencido em ${due.split("-").reverse().join("/")}`);
  if (idle !== null && idle >= 7) red.push(`Sem movimentação há ${idle} dias`);
  else if (idle !== null && idle >= 3) amber.push(`Parado há ${idle} dias`);
  if (due && due >= today && (daysBetween(today, due) ?? 99) <= 2) amber.push("Prazo da fase vence em até 2 dias");
  if (!(p.nextAction || "").trim()) amber.push("Sem próxima ação definida");
  const missingDocs = docStates(p).filter(d => d.state === "missing");
  if (missingDocs.length) amber.push(`Documentação pendente: ${missingDocs.map(d => d.doc.replace("Documento de ", "")).join(", ")}`);
  if (norm(p.wave) === "congelado") amber.push("Onda congelada");
  return { health: red.length ? "red" : amber.length ? "amber" : "green", reasons: [...red, ...amber], idle, inPhase, due };
}

export const healthLabel: Record<Health, string> = { green: "No fluxo", amber: "Atenção", red: "Crítico", done: "Encerrado" };

/** Projetos visíveis na operação: encerrados há mais de 30 dias vão para o arquivo. */
export function isArchived(p: Project, today = todayISO()) {
  if (p.archivedAt) return true;
  if (phaseOf(p) !== "fim") return false;
  const closed = p.phases?.fim?.start || p.goLiveDate || p.lastMovement || isoDay(p.updatedAt);
  return (daysBetween(closed, today) ?? 0) > 30;
}

export function flowSummary(s: State) {
  const active = s.projects.filter(p => !isArchived(p));
  const reports = active.map(p => ({ p, phase: phaseOf(p), h: healthOf(p) }));
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
  const timeline = [{ id: crypto.randomUUID(), at: now, kind: "fase", author, text: `Fase: ${phaseLabel(from)} → ${phaseLabel(to)}` }, ...(p.timeline || [])].slice(0, 200);
  return {
    phase: to, phases, timeline, lastMovement: today,
    status: isBlocked(p.status) && to !== "fim" ? p.status : statusFor[to],
    progress: Math.max(to === "fim" ? 100 : 0, Math.min(100, Math.max(p.progress || 0, progressFor[to]))),
    stage: phaseLabel(to),
    wave: to === "fim" ? "Concluído" : p.wave,
  };
}


/* ---------- V8 · Documentos obrigatórios por fase ---------- */
export type DocState = "ok" | "missing" | "pending" | "skipped" | "future";
export const DOC_PHASES = PHASES.filter(p => p.doc) as unknown as { key: PhaseKey; label: string; short: string; doc: string; letter: string; optional: boolean }[];
export const docOf = (p: Project, k: string) => p.phases?.[k]?.doc || null;
/** Implantação pulada: o projeto passou dela sem nunca ter entrado. */
const campoSkipped = (p: Project, cur: PhaseKey) => phaseIndex(cur) > phaseIndex("campo") && !p.phases?.campo?.start && !docOf(p, "campo");
/** Situação do PDF de cada fase: ok (anexado), pending (fase atual sem PDF), missing (fase já passada sem PDF), skipped, future. */
export function docStates(p: Project): { key: PhaseKey; letter: string; doc: string; label: string; state: DocState }[] {
  const cur = phaseOf(p), ci = phaseIndex(cur);
  return DOC_PHASES.map(ph => {
    const i = phaseIndex(ph.key);
    let state: DocState = docOf(p, ph.key) ? "ok" : i < ci ? "missing" : i === ci ? "pending" : "future";
    if (ph.key === "campo" && state === "missing" && campoSkipped(p, cur)) state = "skipped";
    return { key: ph.key, letter: ph.letter, doc: ph.doc, label: ph.short, state };
  });
}
/** Regra de avanço: só avança com o PDF da fase atual anexado. De Homologação pode ir direto ao Go-live (pulando Implantação). */
export function canMove(p: Project, to: PhaseKey): { ok: boolean; reason?: string } {
  const from = phaseOf(p), fi = phaseIndex(from), ti = phaseIndex(to);
  if (ti <= fi) return { ok: true };
  const skipsOnlyCampo = from === "homolog" && to === "golive";
  if (ti - fi > 1 && !skipsOnlyCampo) return { ok: false, reason: "Avance uma fase por vez." };
  const ph = PHASES[fi];
  if (ph.doc && !docOf(p, from)) return { ok: false, reason: `Anexe o ${ph.doc.toLowerCase()} (PDF assinado) para sair de ${ph.short}.` };
  return { ok: true };
}
export const docsPending = (p: Project) => docStates(p).filter(d => d.state === "missing" || d.state === "pending");
