// V13 · Envia um PDF (da fase ou de uma atividade) para assinatura na ZapSign.
import { audit, loadState, problem, transact } from "@/lib/storage";
import { sbDocSignedUrl, sbFileSignedUrl, supabaseConfigured } from "@/lib/supabase-store";
import { currentUser } from "@/lib/master";
import { extExtra, extPhase, extTask, signFromDoc, zapsignConfigured, zapsignSandbox, zsCreate, type SignerInput } from "@/lib/zapsign";
import { PHASES, phaseOf } from "@/lib/flow";
import type { State } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { target?: "phase" | "task" | "extra"; title?: string; size?: number; extraId?: string; projectId?: string; phase?: string; path?: string; name?: string; taskId?: string; attachmentId?: string; signers?: SignerInput[]; message?: string; whatsapp?: boolean };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() { return Response.json({ configured: zapsignConfigured(), sandbox: zapsignSandbox() }); }

export async function POST(req: Request) {
  if (!zapsignConfigured()) return problem("A integração com a ZapSign ainda não foi configurada. Rode o instalador com -ConfigurarZapSign.");
  if (!supabaseConfigured()) return problem("A assinatura exige o Supabase configurado.");
  const b = await req.json().catch(() => ({})) as Body;
  const signers = (b.signers || []).map(s => ({ name: String(s.name || "").trim(), email: String(s.email || "").trim().toLowerCase(), phone: String(s.phone || "").trim() })).filter(s => s.name);
  if (!signers.length) return problem("Escolha ao menos um signatário.");
  if (signers.length > 10) return problem("Máximo de 10 signatários por documento.");
  for (const s of signers) if (!EMAIL.test(s.email) && (s.phone.replace(/\D/g, "").length < 10 || !b.whatsapp)) return problem(`${s.name}: informe um e-mail válido${b.whatsapp ? " ou celular com DDD" : ""}.`);
  const s0 = await loadState();
  const who = await currentUser();
  try {
    if (b.target === "phase") {
      const p = s0.projects.find(x => x.id === b.projectId), ph = PHASES.find(x => x.key === b.phase && x.doc);
      if (!p || !ph) return problem("Projeto ou fase inválidos.");
      if (!b.path || !b.path.startsWith(`${p.id}/${ph.key}/`)) return problem("Arquivo inválido.");
      if (p.phases?.[ph.key]?.doc) return problem("Esta fase já tem o PDF assinado anexado.");
      const client = s0.clients.find(c => c.id === p.clientId)?.name || p.name;
      const url = await sbDocSignedUrl(p.id, ph.key, b.path);
      const d = await zsCreate({ name: `${ph.doc} · ${client}`, urlPdf: url, externalId: extPhase(p.id, ph.key), signers, message: b.message, whatsapp: b.whatsapp });
      await transact((s: State) => {
        const pp = s.projects.find(x => x.id === p.id); if (!pp) return;
        const now = new Date().toISOString(), info = { ...(pp.phases?.[ph.key] || {}) };
        info.sign = signFromDoc(d, { fileName: b.name || `${ph.doc}.pdf`, sentAt: now, sentBy: who.name, originalPath: b.path });
        info.docSentAt = now.slice(0, 10); info.docSentBy = who.name;
        pp.phases = { ...(pp.phases || {}), [ph.key]: info };
        if (phaseOf(pp) === ph.key) pp.ballWith = "Cliente";
        pp.timeline = [{ id: crypto.randomUUID(), at: now, kind: "doc", author: who.name, text: `${ph.doc} enviado para assinatura via ZapSign${zapsignSandbox() ? " (ambiente de testes)" : ""} → ${signers.map(x => `${x.name}${x.email ? ` <${x.email}>` : ""}`).join(", ")}` }, ...(pp.timeline || [])];
        pp.updatedAt = now; pp.lastMovement = now.slice(0, 10);
        audit(s, "projects", "zapsign enviado", pp.id, `${client} · ${ph.doc}`);
      });
      return Response.json({ ok: true, message: `Enviado para assinatura de ${signers.length} pessoa(s)`, signUrls: d.signers.map(x => ({ name: x.name, url: x.sign_url })) });
    }
    if (b.target === "task") {
      const t = s0.tasks.find(x => x.id === b.taskId), a = t?.attachments?.find(x => x.id === b.attachmentId);
      if (!t || !a) return problem("Atividade ou anexo inválidos.");
      if (a.type !== "pdf") return problem("Só PDFs podem ser enviados para assinatura.");
      if (a.signedFrom) return problem("Este arquivo já é a versão assinada.");
      const client = s0.clients.find(c => c.id === t.clientId)?.name || "";
      const url = await sbFileSignedUrl(t.projectId, t.id, a.path);
      const d = await zsCreate({ name: `${a.name.replace(/\.pdf$/i, "")}${client ? ` · ${client}` : ""}`, urlPdf: url, externalId: extTask(t.id, a.id), signers, message: b.message, whatsapp: b.whatsapp });
      await transact((s: State) => {
        const tt = s.tasks.find(x => x.id === t.id); if (!tt) return;
        const now = new Date().toISOString();
        tt.attachments = (tt.attachments || []).map(x => (x.id === a.id ? { ...x, sign: signFromDoc(d, { fileName: a.name, sentAt: now, sentBy: who.name, originalPath: a.path }) } : x));
        tt.updatedAt = now;
        const p = s.projects.find(x => x.id === tt.projectId);
        if (p) p.timeline = [{ id: `task-${tt.id}:${crypto.randomUUID()}`, at: now, kind: "atividade", author: who.name, text: `Atividade “${tt.title}”: ${a.name} enviado para assinatura via ZapSign → ${signers.map(x => x.name).join(", ")}` }, ...(p.timeline || [])];
        audit(s, "tasks", "zapsign enviado", tt.id, a.name);
      });
      return Response.json({ ok: true, message: `Enviado para assinatura de ${signers.length} pessoa(s)`, signUrls: d.signers.map(x => ({ name: x.name, url: x.sign_url })) });
    }
    if (b.target === "extra") {
      // V20 · Documento avulso (contrato, aditivo, termo...) — novo envio ou reenvio de um já cadastrado
      const p = s0.projects.find(x => x.id === b.projectId);
      if (!p) return problem("Projeto inválido.");
      const prev = b.extraId ? (p.extraDocs || []).find(x => x.id === b.extraId) : null;
      if (b.extraId && !prev) return problem("Documento não encontrado.");
      if (prev?.signed) return problem("Este documento já está assinado.");
      const path = prev ? prev.path : b.path || "";
      if (!path.startsWith(`${p.id}/extra/`)) return problem("Arquivo inválido.");
      const title = (prev?.title || String(b.title || "").trim() || String(b.name || "Documento").replace(/\.pdf$/i, "")).slice(0, 120);
      const client = s0.clients.find(c => c.id === p.clientId)?.name || p.name;
      const id = prev?.id || crypto.randomUUID();
      const url = await sbDocSignedUrl(p.id, "extra", path);
      const d = await zsCreate({ name: `${title} · ${client}`, urlPdf: url, externalId: extExtra(p.id, id), signers, message: b.message, whatsapp: b.whatsapp });
      await transact((s: State) => {
        const pp = s.projects.find(x => x.id === p.id); if (!pp) return;
        const now = new Date().toISOString(), list = [...(pp.extraDocs || [])];
        const fileName = prev?.name || b.name || `${title}.pdf`;
        const sign = signFromDoc(d, { fileName, sentAt: now, sentBy: who.name, originalPath: path });
        const i = list.findIndex(x => x.id === id);
        if (i >= 0) list[i] = { ...list[i], sign };
        else list.unshift({ id, title, name: fileName, path, size: Number(b.size) || undefined, uploadedAt: now, uploadedBy: who.name, sign, signed: null });
        pp.extraDocs = list;
        pp.timeline = [{ id: crypto.randomUUID(), at: now, kind: "doc", author: who.name, text: `Documento avulso “${title}” enviado para assinatura via ZapSign${zapsignSandbox() ? " (ambiente de testes)" : ""} → ${signers.map(x => `${x.name}${x.email ? ` <${x.email}>` : ""}`).join(", ")}` }, ...(pp.timeline || [])];
        pp.updatedAt = now; pp.lastMovement = now.slice(0, 10);
        audit(s, "projects", "zapsign enviado", pp.id, `${client} · ${title}`);
      });
      return Response.json({ ok: true, message: `“${title}” enviado para assinatura de ${signers.length} pessoa(s)`, signUrls: d.signers.map(x => ({ name: x.name, url: x.sign_url })) });
    }
    return problem("Destino inválido.");
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha no envio para a ZapSign.", 502); }
}
