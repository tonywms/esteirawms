// V39 · Agendar / pré-agendar a Homologação ou o Go-live de um projeto (fila "Próximas implantações").
// Agendado também grava a data no projeto e, se pedido, lança os dias na agenda do consultor.
import { randomUUID } from "node:crypto";
import { audit, problem, transact } from "@/lib/storage";
import { currentUser } from "@/lib/master";
import { authEnabled } from "@/lib/auth";
import { asProfile, canWriteEntity } from "@/lib/permissions";
import { addBD } from "@/lib/forecast";
import type { Booking } from "@/lib/types";
export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LABEL = { homolog: "Homologação", golive: "Go-live" } as const;
const br = (d: string) => d.split("-").reverse().join("/");
function workdays(a: string, b: string) { const out: string[] = []; const d = new Date(a + "T12:00:00"), e = new Date(b + "T12:00:00"); while (d <= e && out.length < 31) { if (d.getDay() && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return out; }

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { projectId?: string; kind?: string; booking?: Partial<Booking> | null; toAgenda?: boolean };
  const kind = body.kind === "homolog" || body.kind === "golive" ? body.kind : null;
  if (!body.projectId || !kind) return problem("Informe o projeto e se é homologação ou go-live.");
  let who = "Equipe";
  if (authEnabled()) { const u = await currentUser(); const p = asProfile(u.profile); if (!p || p === "Painel" || !canWriteEntity(p, "projects", "PATCH")) return problem("Seu perfil não pode agendar implantações.", 403); who = u.name || u.email; }
  const b = body.booking;
  let booking: Booking | null = null;
  if (b) {
    const status = b.status === "agendado" || b.status === "realizado" ? b.status : "pre";
    const start = String(b.start || ""); if (!ISO.test(start)) return problem("Informe a data de início.");
    const end = b.end && ISO.test(String(b.end)) ? String(b.end) : addBD(start, 4);
    if (end < start) return problem("A data final não pode ser antes do início.");
    booking = { status, start, end, consultant: String(b.consultant || "").trim().slice(0, 80), notes: String(b.notes || "").trim().slice(0, 300), by: who, at: new Date().toISOString() };
  }
  try {
    const out = await transact(s => {
      const p = s.projects.find(x => x.id === body.projectId); if (!p) throw new Error("Projeto não encontrado.");
      const client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
      p.phases = { ...(p.phases || {}) };
      p.phases[kind] = { ...(p.phases[kind] || {}), booking };
      if (booking?.status === "agendado") { if (kind === "golive") p.goLiveDate = booking.start; else p.homologationDate = booking.start; }
      const st = booking ? { pre: "pré-agendou", agendado: "agendou", realizado: "marcou como realizada" }[booking.status] : "removeu o agendamento d";
      const text = booking ? `${who} ${st} ${kind === "golive" ? "o go-live" : "a homologação"}: ${br(booking.start)} a ${br(booking.end || booking.start)}${booking.consultant ? ` · ${booking.consultant}` : ""}` : `${who} ${st}${kind === "golive" ? "o go-live" : "a homologação"}`;
      p.timeline = [{ id: randomUUID(), at: new Date().toISOString(), kind: "nota", text, author: who }, ...(p.timeline || [])];
      p.updatedAt = new Date().toISOString();
      audit(s, "projects", "fila de implantação", p.id, `${client} · ${text}`);
      let added = 0, conflicts: string[] = [];
      if (booking && body.toAgenda && booking.consultant && booking.status !== "realizado") {
        const now = new Date().toISOString();
        for (const d of workdays(booking.start, booking.end || booking.start)) {
          const clash = s.appointments.find(a => a.status !== "Cancelado" && a.consultant === booking!.consultant && a.date === d);
          if (clash) { conflicts.push(br(d)); continue; }
          s.appointments.push({ id: randomUUID(), projectId: p.id, clientId: p.clientId, consultant: booking.consultant, date: d, shift: "Dia Inteiro", modality: "Presencial (Em Campo)", title: `${LABEL[kind]} · ${client}`, status: booking.status === "agendado" ? "Confirmado com Cliente" : "Planejado", notes: booking.notes || "", message: "", createdAt: now, updatedAt: now });
          added++;
        }
        if (added) audit(s, "appointments", "criado", p.id, `${client} · ${added} dia(s) de ${LABEL[kind].toLowerCase()} na agenda de ${booking.consultant}`);
      }
      return { added, conflicts };
    });
    return Response.json({ ok: true, ...out });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao salvar o agendamento."); }
}
