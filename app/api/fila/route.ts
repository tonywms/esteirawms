// V39/V41 · Próximas implantações.
// 1) Agendar / pré-agendar a Homologação ou o Go-live de um projeto (kind = homolog | golive).
//    Os dias lançados na agenda ficam marcados (sourceWeek = "fila:<projeto>:<tipo>"): ao remarcar, trocar o consultor
//    ou remover, a agenda é refeita sozinha — Agenda, Minha semana, TV e Linha do tempo ficam iguais.
// 2) Alocação rápida (kind = agenda): lança dias de Implantação, Treinamento, Integração ou Escritório direto na agenda.
import { randomUUID } from "node:crypto";
import { audit, problem, transact } from "@/lib/storage";
import { currentUser } from "@/lib/master";
import { authEnabled } from "@/lib/auth";
import { asProfile, canWriteEntity } from "@/lib/permissions";
import { addBD } from "@/lib/forecast";
import { INTERNAL_CLIENT_ID, INTERNAL_PROJECT_ID } from "@/lib/internal";
import type { Appointment, Booking, State } from "@/lib/types";
export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LABEL = { homolog: "Homologação", golive: "Go-live" } as const;
const QUICK = { campo: "Implantação", treino: "Treinamento", dev: "Integração", office: "Escritório" } as const;
type QuickKind = keyof typeof QUICK;
const br = (d: string) => d.split("-").reverse().join("/");
function workdays(a: string, b: string) { const out: string[] = []; const d = new Date(a + "T12:00:00"), e = new Date(b + "T12:00:00"); while (d <= e && out.length < 31) { if (d.getDay() && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return out; }
const tagOf = (projectId: string, kind: string) => `fila:${projectId}:${kind}`;

/** Lança os dias úteis na agenda, pulando dias em que a pessoa já está em outro compromisso. */
function launch(s: State, base: Omit<Appointment, "id" | "date" | "createdAt" | "updatedAt">, start: string, end: string) {
  const now = new Date().toISOString(); let added = 0; const conflicts: string[] = [];
  for (const d of workdays(start, end)) {
    const clash = s.appointments.find(a => a.status !== "Cancelado" && a.consultant === base.consultant && a.date === d);
    if (clash) { conflicts.push(br(d)); continue; }
    s.appointments.push({ ...base, id: randomUUID(), date: d, createdAt: now, updatedAt: now });
    added++;
  }
  return { added, conflicts };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { projectId?: string; kind?: string; booking?: Partial<Booking> | null; toAgenda?: boolean; type?: string; consultant?: string; start?: string; end?: string; status?: string; notes?: string };
  let who = "Equipe", profile: ReturnType<typeof asProfile> = null;
  if (authEnabled()) { const u = await currentUser(); profile = asProfile(u.profile); who = u.name || u.email; }

  /* ---------- 2) alocação rápida direto na agenda ---------- */
  if (body.kind === "agenda") {
    if (authEnabled() && (!profile || profile === "Painel" || !canWriteEntity(profile, "appointments", "POST"))) return problem("Seu perfil não pode lançar na agenda.", 403);
    const type = (Object.keys(QUICK) as QuickKind[]).find(k => k === body.type) || "campo";
    const consultant = String(body.consultant || "").trim().slice(0, 80); if (!consultant) return problem("Escolha quem vai.");
    const start = String(body.start || ""); if (!ISO.test(start)) return problem("Informe a data de início.");
    const end = body.end && ISO.test(String(body.end)) ? String(body.end) : start; if (end < start) return problem("A data final não pode ser antes do início.");
    try {
      const out = await transact(s => {
        const office = type === "office";
        const p = office ? s.projects.find(x => x.id === INTERNAL_PROJECT_ID) : s.projects.find(x => x.id === body.projectId);
        if (!office && !p) throw new Error("Escolha o cliente/projeto.");
        const clientId = p?.clientId || INTERNAL_CLIENT_ID;
        const client = office ? "WMS Expert" : s.clients.find(c => c.id === clientId)?.name || p!.name;
        const r = launch(s, { projectId: p?.id || INTERNAL_PROJECT_ID, clientId, consultant, shift: "Dia Inteiro", modality: office ? "Escritório" : "Presencial (Em Campo)", title: office ? "Escritório WMS Expert" : `${QUICK[type]} · ${client}`, status: body.status === "Confirmado com Cliente" ? "Confirmado com Cliente" : "Planejado", notes: String(body.notes || "").slice(0, 300), message: "", sourceWeek: `fila:agenda:${type}` }, start, end);
        if (r.added) audit(s, "appointments", "alocação rápida", p?.id || INTERNAL_PROJECT_ID, `${client} · ${QUICK[type]} · ${r.added} dia(s) para ${consultant} (${br(start)} a ${br(end)})`);
        return r;
      });
      return Response.json({ ok: true, ...out });
    } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao lançar na agenda."); }
  }

  /* ---------- 1) homologação / go-live ---------- */
  const kind = body.kind === "homolog" || body.kind === "golive" ? body.kind : null;
  if (!body.projectId || !kind) return problem("Informe o projeto e se é homologação ou go-live.");
  if (authEnabled() && (!profile || profile === "Painel" || !canWriteEntity(profile, "projects", "PATCH"))) return problem("Seu perfil não pode agendar implantações.", 403);
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
      const old = p.phases?.[kind]?.booking || null;
      p.phases = { ...(p.phases || {}) };
      p.phases[kind] = { ...(p.phases[kind] || {}), booking };
      if (booking?.status === "agendado") { if (kind === "golive") p.goLiveDate = booking.start; else p.homologationDate = booking.start; }
      const st = booking ? { pre: "pré-agendou", agendado: "agendou", realizado: "marcou como realizada" }[booking.status] : "removeu o agendamento d";
      const text = booking ? `${who} ${st} ${kind === "golive" ? "o go-live" : "a homologação"}: ${br(booking.start)} a ${br(booking.end || booking.start)}${booking.consultant ? ` · ${booking.consultant}` : ""}` : `${who} ${st}${kind === "golive" ? "o go-live" : "a homologação"}`;
      p.timeline = [{ id: randomUUID(), at: new Date().toISOString(), kind: "nota", text, author: who }, ...(p.timeline || [])];
      p.updatedAt = new Date().toISOString();
      audit(s, "projects", "fila de implantação", p.id, `${client} · ${text}`);

      // Sincroniza a agenda: tira os dias lançados antes por esta ida a campo (marcados, ou os antigos da V40 pelo título)
      // e lança de novo com as datas/consultor atuais. "Realizado" não mexe (é histórico).
      let added = 0, removed = 0, conflicts: string[] = [];
      if (booking?.status !== "realizado") {
        const tag = tagOf(p.id, kind), title = `${LABEL[kind]} · ${client}`;
        const mine = (a: Appointment) => a.projectId === p.id && (a.sourceWeek === tag || (!a.sourceWeek && !!old && a.title === title && a.consultant === old.consultant && !!a.date && a.date >= old.start && a.date <= (old.end || old.start)));
        const keepPast = (a: Appointment) => a.status === "Realizado";
        const before = s.appointments.length;
        s.appointments = s.appointments.filter(a => !mine(a) || keepPast(a));
        removed = before - s.appointments.length;
        if (booking && body.toAgenda !== false && booking.consultant) {
          const r = launch(s, { projectId: p.id, clientId: p.clientId, consultant: booking.consultant, shift: "Dia Inteiro", modality: "Presencial (Em Campo)", title, status: booking.status === "agendado" ? "Confirmado com Cliente" : "Planejado", notes: booking.notes || "", message: "", sourceWeek: tag }, booking.start, booking.end || booking.start);
          added = r.added; conflicts = r.conflicts;
        }
        if (added || removed) audit(s, "appointments", "sincronizado", p.id, `${client} · ${LABEL[kind].toLowerCase()}: ${removed ? `${removed} dia(s) retirado(s)` : ""}${removed && added ? ", " : ""}${added ? `${added} dia(s) na agenda de ${booking!.consultant}` : ""}`);
      }
      return { added, removed, conflicts };
    });
    return Response.json({ ok: true, ...out });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao salvar o agendamento."); }
}
