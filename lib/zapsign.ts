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
  if (!r.ok) throw new Error(`ZapSign: ${r.status}${j.detail || j.message || j.error ? ` · ${j.detail || j.message || j.error}` : ""}`);
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

/** V21 · Pessoas que já receberam documentos na ZapSign (a API não expõe a agenda de contatos;
 *  lemos os documentos com os signatários). Cache de 10 minutos por servidor.
 *  V21.2 · Segue o link "next" da própria ZapSign, não repete documentos, completa pelo detalhe
 *  quando a listagem vem sem signatários e devolve um diagnóstico completo. */
// A listagem da ZapSign devolve os signatários com campos em português (nome, telefone…); o detalhe, em inglês.
type ZsListSigner = { name?: string; nome?: string; email?: string | null; phone_country?: string | null; phone_number?: string | null; phone?: string | null; telefone?: string | null };
type ZsListDoc = { token?: string; open_id?: number | string; name?: string; created_at?: string; last_update_at?: string; signers?: ZsListSigner[] };
export type ZsPeopleInfo = { pages: number; docs: number; unique: number; withSigners: number; details: number; detailErrors: number; signers: number; firstKeys: string[]; signerKeys: string[]; total?: number; firstError?: string; stoppedBy?: string };
let peopleCache: { at: number; people: import("./contacts").ZsPerson[]; info: ZsPeopleInfo } | null = null;
export async function zsPeople(force = false) {
  if (!force && peopleCache && Date.now() - peopleCache.at < 10 * 60 * 1000 && peopleCache.people.length) return { people: peopleCache.people, info: peopleCache.info, cached: true };
  const t0 = Date.now();
  const map = new Map<string, import("./contacts").ZsPerson>();
  const info: ZsPeopleInfo = { pages: 0, docs: 0, unique: 0, withSigners: 0, details: 0, detailErrors: 0, signers: 0, firstKeys: [], signerKeys: [] };
  const add = (d: ZsListDoc, sg: ZsListSigner) => {
    if (!info.signerKeys.length) info.signerKeys = Object.keys(sg || {}).slice(0, 20);
    const name = String(sg?.name || sg?.nome || "").trim(); if (!name) return;
    info.signers++;
    const email = String(sg.email || "").trim().toLowerCase();
    const raw = String(sg.phone_number || sg.phone || sg.telefone || "").replace(/\D/g, "");
    const phone = raw ? (sg.phone_country && sg.phone_country !== "55" ? `+${sg.phone_country}${raw}` : raw) : "";
    const key = email || (phone ? `tel:${phone}` : `nome:${name.toLowerCase()}`);
    const at = String(d.last_update_at || d.created_at || "");
    const cur = map.get(key);
    if (cur) { cur.docs++; if (at > cur.lastAt) cur.lastAt = at; if (!cur.phone && phone) cur.phone = phone; if (d.name && cur.docNames.length < 5 && !cur.docNames.includes(d.name)) cur.docNames.push(d.name); }
    else map.set(key, { name, email, phone, docs: 1, lastAt: at, docNames: d.name ? [d.name] : [] });
  };
  const seen = new Set<string>(), noSigners: ZsListDoc[] = [];
  const take = (list: ZsListDoc[]) => {
    let fresh = 0;
    for (const d of list) {
      info.docs++;
      const id = String(d.token || d.open_id || `${d.name}|${d.created_at}`);
      if (seen.has(id)) continue; seen.add(id); fresh++;
      if (Array.isArray(d.signers) && d.signers.length) { info.withSigners++; d.signers.forEach(sg => add(d, sg)); }
      else if (d.token) noSigners.push(d);
    }
    return fresh;
  };
  type Page = { next?: string | null; count?: number; results?: ZsListDoc[] } | ZsListDoc[];
  const first: Page = await zs(`/api/v1/docs/?page=1&include_signers=true&sort_order=desc`);
  const list1 = Array.isArray(first) ? first : first.results || [];
  info.pages = 1;
  if (list1[0]) info.firstKeys = Object.keys(list1[0]).slice(0, 25);
  take(list1);
  if (!Array.isArray(first) && first.next && list1.length) {
    info.total = typeof first.count === "number" ? first.count : undefined;
    // Monta a URL das próximas páginas a partir do link "next" da própria ZapSign e busca 6 páginas por vez
    let tpl: URL; try { tpl = new URL(String(first.next), base()); } catch { tpl = new URL(`${base()}/api/v1/docs/?page=2&sort_order=desc`); }
    if (!tpl.searchParams.has("include_signers")) tpl.searchParams.set("include_signers", "true");
    const lastPage = info.total ? Math.min(80, Math.ceil(info.total / list1.length)) : 40;
    let stop = false;
    for (let k = 2; k <= lastPage && !stop; k += 6) {
      if (Date.now() - t0 > 35000) { info.stoppedBy = "tempo"; break; }
      const nums = Array.from({ length: Math.min(6, lastPage - k + 1) }, (_, x) => k + x);
      const pages = await Promise.all(nums.map(async n => { const u = new URL(tpl.toString()); u.searchParams.set("page", String(n)); try { return await zs<Page>(u.pathname + u.search); } catch (e) { if (!info.firstError) info.firstError = e instanceof Error ? e.message.slice(0, 160) : "erro"; return [] as ZsListDoc[]; } }));
      for (const pg of pages) {
        const l = Array.isArray(pg) ? pg : pg.results || [];
        info.pages++;
        if (!l.length || !take(l)) { stop = true; info.stoppedBy = l.length ? "página repetida" : "fim"; }
      }
    }
    if (!info.stoppedBy) info.stoppedBy = "fim";
  } else info.stoppedBy = "fim";
  info.unique = seen.size;
  // listagem sem signatários: completa pelo detalhe de cada documento (mais recentes primeiro, 4 por vez)
  const todo = noSigners.slice(0, 60);
  for (let k = 0; k < todo.length && Date.now() - t0 < 50000; k += 6) {
    await Promise.all(todo.slice(k, k + 6).map(async d => {
      try { const full = await zsDetail(d.token!); info.details++; (full.signers || []).forEach(sg => add({ ...d, name: full.name || d.name }, sg as ZsListSigner)); }
      catch (e) { info.detailErrors++; if (!info.firstError) info.firstError = e instanceof Error ? e.message.slice(0, 160) : "erro"; }
    }));
  }
  const people = [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  peopleCache = { at: Date.now(), people, info };
  return { people, info, cached: false };
}

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
