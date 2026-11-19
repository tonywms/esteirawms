// V13 · Integração ZapSign (assinatura eletrônica).
// Variáveis: ZAPSIGN_TOKEN (token da API), ZAPSIGN_AMBIENTE ("producao" | "sandbox"), ZAPSIGN_WEBHOOK_CHAVE (segredo do webhook).
// Fluxo: enviar (cria o documento na ZapSign) → ZapSign avisa no webhook → o sistema confere na API, baixa o PDF assinado
// e guarda no Supabase como documento da fase (ou como novo anexo da atividade).
import { audit, transact } from "./storage";
import { sbDocUploadTicket, sbFileUploadTicket, sbUploadBytes } from "./supabase-store";
import { PHASES } from "./flow";
import type { ExtraDoc, SignRequest, State, TaskAttachment } from "./types";

const env = (k: string) => (process.env[k] || "").trim();
export const zapsignConfigured = () => !!env("ZAPSIGN_TOKEN");
export const zapsignSandbox = () => /sandbox|teste/i.test(env("ZAPSIGN_AMBIENTE"));
const base = () => (env("ZAPSIGN_API_URL") || (zapsignSandbox() ? "https://sandbox.api.zapsign.com.br" : "https://api.zapsign.com.br")).replace(/\/$/, "");

type ZsSigner = { token: string; sign_url?: string; status: string; name: string; email?: string; signed_at?: string | null };
export type ZsDoc = { token: string; status: string; name: string; external_id?: string; signed_file?: string | null; signers: ZsSigner[] };

async function zs<T>(path: string, init?: RequestInit): Promise<T> {
  if (!zapsignConfigured()) throw new Error("A integração com a ZapSign ainda não foi configurada (ZAPSIGN_TOKEN).");
  const r = await fetch(`${base()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${env("ZAPSIGN_TOKEN")}`, "Content-Type": "application/json", ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({})) as T & { detail?: string; message?: string; error?: string };
  if (!r.ok) throw new Error(`ZapSign: ${j.detail || j.message || j.error || r.status}`);
  return j;
}

export type SignerInput = { name: string; email?: string; phone?: string };
export async function zsCreate(o: { name: string; urlPdf: string; externalId: string; signers: SignerInput[]; message?: string; whatsapp?: boolean }): Promise<ZsDoc> {
  return zs<ZsDoc>("/api/v1/docs/", {
    method: "POST",
    body: JSON.stringify({
      name: o.name.slice(0, 250), url_pdf: o.urlPdf, external_id: o.externalId, lang: "pt-br", folder_path: "/Esteira WMS Expert/",
      brand_name: "WMS Expert", reminder_every_n_days: 3, allow_refuse_signature: true,
      signers: o.signers.map(s => {
        const digits = (s.phone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
        return {
          name: s.name, email: s.email || "", auth_mode: "assinaturaTela", lock_name: true, lock_email: !!s.email,
          send_automatic_email: !!s.email, custom_message: o.message || undefined,
          ...(digits.length >= 10 ? { phone_country: "55", phone_number: digits, send_automatic_whatsapp: !!o.whatsapp } : {}),
        };
      }),
    }),
  });
}
export const zsDetail = (token: string) => zs<ZsDoc>(`/api/v1/docs/${encodeURIComponent(token)}/`);

export const signFromDoc = (d: ZsDoc, prev?: Partial<SignRequest>): SignRequest => ({
  provider: "zapsign", docToken: d.token, fileName: prev?.fileName || d.name, originalPath: prev?.originalPath, sentAt: prev?.sentAt || new Date().toISOString(), sentBy: prev?.sentBy,
  status: d.status === "signed" ? "signed" : d.status === "refused" || d.signers.some(s => s.status === "refused") ? "refused" : "pending",
  signers: d.signers.map(s => ({ name: s.name, email: s.email, status: s.status, signUrl: s.sign_url, signedAt: s.signed_at || null })),
  completedAt: d.status === "signed" ? prev?.completedAt || new Date().toISOString() : null,
});

/** external_id: "esteira:phase:<projeto>:<fase>", "esteira:task:<atividade>:<anexo>" ou "esteira:extra:<projeto>:<documento>" (V20) */
export const extPhase = (projectId: string, phase: string) => `esteira:phase:${projectId}:${phase}`;
export const extTask = (taskId: string, attId: string) => `esteira:task:${taskId}:${attId}`;
export const extExtra = (projectId: string, docId: string) => `esteira:extra:${projectId}:${docId}`;
function parseExt(ext?: string) {
  const m = (ext || "").match(/^esteira:(phase|task|extra):([^:]+):([^:]+)$/);
  return m ? { kind: m[1] as "phase" | "task" | "extra", a: m[2], b: m[3] } : null;
}

/**
 * Confere um documento na ZapSign e atualiza o sistema. Se estiver assinado, baixa o PDF assinado
 * e guarda como documento da fase / novo anexo da atividade. Idempotente (pode ser chamado várias vezes).
 */
export async function syncZapsignDoc(token: string, by = "ZapSign"): Promise<{ ok: boolean; status: string; message: string }> {
  const d = await zsDetail(token);
  const t = parseExt(d.external_id);
  if (!t) return { ok: false, status: d.status, message: "Documento não pertence à esteira." };
  let file: Uint8Array | null = null;
  if (d.status === "signed" && d.signed_file) {
    const r = await fetch(d.signed_file, { cache: "no-store" });
    if (!r.ok) throw new Error(`Falha ao baixar o PDF assinado (${r.status}).`);
    file = new Uint8Array(await r.arrayBuffer());
  }
  // Guarda o arquivo assinado antes de mexer no estado (o caminho é gerado pelo Supabase)
  let stored: { path: string } | null = null;
  const already = await transact((s: State) => {
    if (t.kind === "phase") return s.projects.find(p => p.id === t.a)?.phases?.[t.b]?.sign?.status === "signed";
    if (t.kind === "extra") return !!s.projects.find(p => p.id === t.a)?.extraDocs?.find(x => x.id === t.b)?.signed;
    const task = s.tasks.find(x => x.id === t.a);
    return task?.attachments?.find(x => x.id === t.b)?.sign?.status === "signed";
  });
  if (file && !already) {
    if (t.kind === "phase") { const up = await sbDocUploadTicket(t.a, t.b); await sbUploadBytes(up.uploadUrl, up.apikey, file); stored = { path: up.path }; }
    else if (t.kind === "extra") { const up = await sbDocUploadTicket(t.a, "extra"); await sbUploadBytes(up.uploadUrl, up.apikey, file); stored = { path: up.path }; }
    else { const s0 = await transact((s: State) => s.tasks.find(x => x.id === t.a)?.projectId || ""); const up = await sbFileUploadTicket(s0, t.a, "pdf"); await sbUploadBytes(up.uploadUrl, up.apikey, file); stored = { path: up.path }; }
  }
  return transact((s: State) => {
    const now = new Date().toISOString();
    const who = d.signers.filter(x => x.status === "signed").map(x => x.name).join(", ");
    if (t.kind === "phase") {
      const p = s.projects.find(x => x.id === t.a); if (!p) return { ok: false, status: d.status, message: "Projeto não encontrado." };
      const ph = PHASES.find(x => x.key === t.b); const info = { ...(p.phases?.[t.b] || {}) };
      const prev = info.sign || undefined, next = signFromDoc(d, prev);
      info.sign = next;
      let text = "";
      if (stored && next.status === "signed") {
        info.doc = { path: stored.path, name: `${(prev?.fileName || d.name).replace(/\.pdf$/i, "")} (assinado).pdf`, size: file?.length, uploadedAt: now, uploadedBy: "ZapSign" };
        info.docSentAt = null;
        text = `PDF assinado via ZapSign · ${ph?.doc || t.b}: assinado por ${who}`;
      } else if (prev?.status !== next.status && next.status === "refused") text = `ZapSign: ${ph?.doc || t.b} RECUSADO pelo signatário`;
      else if (JSON.stringify(prev?.signers?.map(x => x.status)) !== JSON.stringify(next.signers.map(x => x.status)) && who) text = `ZapSign: ${ph?.doc || t.b} — já assinaram: ${who}`;
      p.phases = { ...(p.phases || {}), [t.b]: info };
      if (text) { p.timeline = [{ id: crypto.randomUUID(), at: now, kind: "doc", author: by, text }, ...(p.timeline || [])]; p.updatedAt = now; audit(s, "projects", "zapsign", p.id, text); }
      return { ok: true, status: next.status, message: next.status === "signed" ? "Documento assinado e anexado à fase" : next.status === "refused" ? "Assinatura recusada" : "Aguardando assinatura" };
    }
    if (t.kind === "extra") {
      const p = s.projects.find(x => x.id === t.a); if (!p) return { ok: false, status: d.status, message: "Projeto não encontrado." };
      const list: ExtraDoc[] = [...(p.extraDocs || [])]; const i = list.findIndex(x => x.id === t.b);
      if (i < 0) return { ok: false, status: d.status, message: "Documento não encontrado." };
      const prev = list[i].sign || undefined, next = signFromDoc(d, prev);
      list[i] = { ...list[i], sign: next };
      let text = "";
      if (stored && next.status === "signed") {
        list[i].signed = { path: stored.path, name: `${list[i].name.replace(/\.pdf$/i, "")} (assinado).pdf`, size: file?.length, uploadedAt: now };
        text = `Documento avulso “${list[i].title}” assinado via ZapSign por ${who}`;
      } else if (prev?.status !== next.status && next.status === "refused") text = `ZapSign: documento avulso “${list[i].title}” RECUSADO pelo signatário`;
      else if (JSON.stringify(prev?.signers?.map(x => x.status)) !== JSON.stringify(next.signers.map(x => x.status)) && who) text = `ZapSign: “${list[i].title}” — já assinaram: ${who}`;
      p.extraDocs = list;
      if (text) { p.timeline = [{ id: crypto.randomUUID(), at: now, kind: "doc", author: by, text }, ...(p.timeline || [])]; p.updatedAt = now; audit(s, "projects", "zapsign", p.id, text); }
      return { ok: true, status: next.status, message: next.status === "signed" ? "Documento assinado e guardado no projeto" : next.status === "refused" ? "Assinatura recusada" : "Aguardando assinatura" };
    }
    const task = s.tasks.find(x => x.id === t.a); if (!task) return { ok: false, status: d.status, message: "Atividade não encontrada." };
    const list = [...(task.attachments || [])]; const i = list.findIndex(x => x.id === t.b);
    if (i < 0) return { ok: false, status: d.status, message: "Anexo não encontrado." };
    const prev = list[i].sign || undefined, next = signFromDoc(d, prev);
    list[i] = { ...list[i], sign: next };
    let text = "";
    if (stored && next.status === "signed") {
      const signed: TaskAttachment = { id: crypto.randomUUID(), path: stored.path, name: `${list[i].name.replace(/\.pdf$/i, "")} (assinado).pdf`, size: file?.length, type: "pdf", uploadedAt: now, uploadedBy: "ZapSign", signedFrom: list[i].id };
      list.push(signed);
      text = `Atividade “${task.title}”: PDF assinado via ZapSign · ${list[i].name} (assinado por ${who})`;
    } else if (prev?.status !== next.status && next.status === "refused") text = `Atividade “${task.title}”: assinatura RECUSADA na ZapSign · ${list[i].name}`;
    task.attachments = list; task.updatedAt = now;
    const p = s.projects.find(x => x.id === task.projectId);
    if (text && p) { p.timeline = [{ id: `task-${task.id}:${crypto.randomUUID()}`, at: now, kind: "atividade", author: by, text }, ...(p.timeline || [])]; audit(s, "tasks", "zapsign", task.id, text); }
    return { ok: true, status: next.status, message: next.status === "signed" ? "Documento assinado e anexado à atividade" : next.status === "refused" ? "Assinatura recusada" : "Aguardando assinatura" };
  });
}
