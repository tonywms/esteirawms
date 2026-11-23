// V9 · Liberação master: avança sem PDF, dispensa um PDF, encerra ou cancela o projeto.
// Exige e-mail + senha de um usuário master a cada liberação; tudo fica na linha do tempo e na auditoria.
import { audit, problem, transact } from "@/lib/storage";
import { PHASES, movePhasePatch, phaseIndex, phaseLabel, phaseOf, type PhaseKey } from "@/lib/flow";
import { currentUser, isMasterEmail, isReleaserEmail, verifyMaster } from "@/lib/master";
import type { DocWaiver, PhaseInfo, State } from "@/lib/types";
export const runtime = "nodejs";

type Body = { projectId?: string; action?: "advance" | "waive" | "close" | "cancel"; to?: string; phase?: string; reason?: string; email?: string; password?: string; trusted?: boolean; nextAction?: string; nextActionOwner?: string; nextActionDue?: string | null };
const DOC_KEYS = PHASES.filter(p => p.doc).map(p => p.key as string);

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as Body;
  const reason = (b.reason || "").trim();
  if (!b.projectId || !b.action || !["advance", "waive", "close", "cancel"].includes(b.action)) return problem("Ação inválida.");
  if (reason.length < 5) return problem("Descreva o motivo da liberação (mínimo 5 caracteres).");
  const scope = b.action === "advance" || b.action === "waive" ? "fase" : "master";
  const who = await currentUser();
  // V22.3 · Quem está logado e já tem a permissão libera sem digitar a senha de novo (a sessão já foi autenticada)
  const sessionOk = b.trusted && !!who.email && (scope === "fase" ? isReleaserEmail(who.email) : isMasterEmail(who.email));
  if (b.trusted && !sessionOk) return problem(scope === "fase" ? "Seu usuário não pode liberar fase sem PDF. Peça a um master ou liberador." : "Somente o master pode encerrar ou cancelar projeto.", 403);
  const m = sessionOk ? { ok: true as const, name: who.name || who.email, email: who.email } : await verifyMaster(b.email || "", b.password || "", scope);
  if (!m.ok) return problem(m.error, 403);
  try {
    const result = await transact((s: State) => {
      const p = s.projects.find(x => x.id === b.projectId);
      if (!p) throw new Error("Projeto não encontrado.");
      const now = new Date().toISOString(), cur = phaseOf(p);
      const waiver: DocWaiver = { by: m.name, email: m.email, at: now, reason };
      const phases: Record<string, PhaseInfo> = { ...(p.phases || {}) };
      const waive = (k: string) => { if (DOC_KEYS.includes(k) && !phases[k]?.doc) phases[k] = { ...(phases[k] || {}), docWaived: waiver }; };
      const by = who.name && who.email !== m.email ? ` · solicitado por ${who.name}` : "";
      let text = "";
      if (b.action === "waive") {
        const k = b.phase || cur;
        if (!DOC_KEYS.includes(k)) throw new Error("Fase inválida.");
        if (phases[k]?.doc) throw new Error("Esta fase já tem o PDF anexado.");
        waive(k); p.phases = phases;
        text = `Liberação master (${m.name}): PDF de ${phaseLabel(k)} dispensado. Motivo: ${reason}${by}`;
      } else if (b.action === "advance") {
        const to = (b.to || "") as PhaseKey;
        const ti = phaseIndex(to), ci = phaseIndex(cur);
        if (!PHASES.some(x => x.key === to) || ti <= ci) throw new Error("Escolha uma fase seguinte.");
        for (const ph of PHASES) { const i = phaseIndex(ph.key); if (i >= ci && i < ti && !(ph.key === "campo" && cur !== "campo")) waive(ph.key); }
        p.phases = phases;
        Object.assign(p, movePhasePatch(p, to, m.name));
        // V24: a fase nova já nasce com a próxima ação
        if (to !== "fim") {
          const na = (b.nextAction || "").trim();
          if (!na) throw new Error("Ao mudar de fase, informe a próxima ação (o que precisa acontecer, quem faz e até quando).");
          Object.assign(p, { nextAction: na, nextActionOwner: (b.nextActionOwner || "").trim(), nextActionDue: b.nextActionDue || null });
        }
        text = `Liberação master (${m.name}): avançou de ${phaseLabel(cur)} para ${phaseLabel(to)} sem PDF. Motivo: ${reason}${by}`;
      } else if (b.action === "close") {
        waive(cur); p.phases = phases;
        Object.assign(p, movePhasePatch(p, "fim", m.name), { status: "Concluído", progress: 100 });
        text = `Liberação master (${m.name}): projeto encerrado a partir de ${phaseLabel(cur)}. Motivo: ${reason}${by}`;
      } else {
        p.status = "Cancelado"; p.archivedAt = now; p.wave = p.wave === "Concluído" ? p.wave : "Congelado";
        text = `Liberação master (${m.name}): projeto CANCELADO e retirado da esteira e do painel. Motivo: ${reason}${by}`;
      }
      p.timeline = [{ id: crypto.randomUUID(), at: now, kind: "master", author: m.name, text }, ...(p.timeline || [])];
      p.lastMovement = now.slice(0, 10); p.updatedAt = now;
      const client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
      audit(s, "projects", `liberação master (${b.action})`, p.id, `${client} · ${m.email}`);
      return { ok: true, project: p, message: b.action === "cancel" ? "Projeto cancelado e retirado da esteira" : b.action === "close" ? "Projeto encerrado" : b.action === "waive" ? "PDF dispensado pelo master" : `Avançou para ${PHASES[phaseIndex(b.to || "")].short}` };
    });
    return Response.json(result);
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha na liberação."); }
}
