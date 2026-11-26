// V43 · Entregas prioritárias (chamado na TV). POST { projectId, action, date?, tv?, owner?, reason? }
// action: abrir (cria ou atualiza) | atender | reabrir | concluir | remover
import { randomUUID } from "node:crypto";
import { audit, problem, transact } from "@/lib/storage";
import { currentUser } from "@/lib/master";
import { authEnabled } from "@/lib/auth";
import { asProfile, canWriteEntity } from "@/lib/permissions";
import { callQueue } from "@/lib/chamados";
import { todayISO } from "@/lib/metrics";
import type { PriorityCall } from "@/lib/types";
export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const br = (d: string) => d.split("-").reverse().join("/");

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { projectId?: string; action?: string; date?: string; tv?: boolean; owner?: string; reason?: string };
  let who = "Equipe";
  if (authEnabled()) {
    const u = await currentUser(); const prof = asProfile(u.profile);
    if (!prof || prof === "Painel" || !canWriteEntity(prof, "projects", "PATCH")) return problem("Seu perfil não pode abrir entregas prioritárias.", 403);
    who = u.name || u.email;
  }
  const action = String(b.action || "");
  if (!b.projectId || !["abrir", "atender", "reabrir", "concluir", "remover"].includes(action)) return problem("Informe o projeto e a ação.");
  try {
    const out = await transact(s => {
      const p = s.projects.find(x => x.id === b.projectId); if (!p) throw new Error("Projeto não encontrado.");
      const client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
      const now = new Date().toISOString(), cur = p.priorityCall && p.priorityCall.date ? p.priorityCall : null;
      let text = "";
      if (action === "abrir") {
        const date = String(b.date || ""); if (!ISO.test(date)) throw new Error("Informe o dia em que entra na fila.");
        const owner = String(b.owner || "").trim().slice(0, 80); if (!owner) throw new Error("Escolha quem vai atender.");
        const reason = String(b.reason || "").trim().slice(0, 220); if (!reason) throw new Error("Escreva o que precisa ser feito.");
        const keep = cur && cur.status !== "concluido";
        const call: PriorityCall = { date, tv: b.tv !== false, owner, reason, status: keep ? cur!.status : "aberto", createdAt: keep && cur!.date === date ? cur!.createdAt : now, by: keep ? cur!.by || who : who, startedAt: keep ? cur!.startedAt || null : null, doneAt: null };
        p.priorityCall = call;
        text = keep ? `${who} atualizou a entrega prioritária: ${br(date)} · ${owner} · ${reason}${call.tv ? " · na TV" : ""}` : `${who} abriu entrega prioritária para ${br(date)} · atendimento ${owner} · ${reason}${call.tv ? " · chamada na TV" : ""}`;
      } else {
        if (!cur) throw new Error("Este projeto não tem entrega prioritária.");
        if (action === "atender") { p.priorityCall = { ...cur, status: "atendimento", startedAt: now }; text = `${who} iniciou o atendimento da entrega prioritária (${cur.owner})`; }
        if (action === "reabrir") { p.priorityCall = { ...cur, status: "aberto", doneAt: null }; text = `${who} voltou a entrega prioritária para a fila`; }
        if (action === "concluir") { p.priorityCall = { ...cur, status: "concluido", doneAt: now }; text = `${who} concluiu a entrega prioritária: ${cur.reason}`; }
        if (action === "remover") { p.priorityCall = null; text = `${who} removeu a entrega prioritária`; }
      }
      p.timeline = [{ id: randomUUID(), at: now, kind: "nota", text, author: who }, ...(p.timeline || [])];
      p.updatedAt = now; p.lastMovement = todayISO();
      audit(s, "projects", "entrega prioritária", p.id, `${client} · ${text}`);
      const q = callQueue(s, todayISO()).find(x => x.p.id === p.id);
      return { queue: q?.queue ?? null };
    });
    return Response.json({ ok: true, ...out });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao salvar."); }
}
