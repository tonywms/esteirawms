// V7 · Armazenamento no Supabase (tabelas reais). O app fala com o banco somente por
// funções RPC protegidas pela chave do aplicativo (ESTEIRA_DB_CHAVE); as tabelas não
// ficam expostas na API pública (RLS ligado, sem permissões para anon).
import type { State, TimelineEvent } from "./types";

type Row = Record<string, unknown>;
type Kind = "text" | "textnull" | "int" | "bool" | "boolf" | "date" | "ts" | "json";
const T = (spec: Record<string, Kind>) => spec;
const TABLES = {
  clients: T({ id: "text", name: "text", system: "text", notes: "text", source: "json", signers: "json", created_at: "ts", updated_at: "ts" }),
  staff: T({ id: "text", name: "text", role: "text", capacity: "int", active: "bool", email: "textnull", sector: "textnull", escalation: "boolf", created_at: "ts", updated_at: "ts" }),
  workspace_users: T({ id: "text", name: "text", email: "text", role: "text", active: "bool", notes: "text", created_at: "ts", updated_at: "ts" }),
  projects: T({
    id: "text", client_id: "text", name: "text", system: "text", wave: "text", stage: "text", progress: "int", status: "text", team: "text",
    integration_owner: "text", implementation_owner: "text", blocker: "text", readiness: "json", last_movement: "date", initial_milestone: "date",
    integration_delivery: "date", homologation_date: "date", go_live_date: "date", implementation_start: "date", notes: "text",
    phase: "textnull", phases: "json", ball_with: "textnull", next_action: "textnull", next_action_owner: "textnull", next_action_due: "date",
    archived_at: "ts", source: "json", extra_docs: "json", infra: "json", created_at: "ts", updated_at: "ts",
  }),
  tasks: T({ id: "text", project_id: "text", client_id: "text", title: "text", owner: "text", start_date: "date", due_date: "date", status: "text", blocker: "text", notes: "text", sla_original: "textnull", source: "json", attachments: "json", created_at: "ts", updated_at: "ts" }),
  appointments: T({ id: "text", project_id: "text", client_id: "text", consultant: "text", date: "date", shift: "text", modality: "text", title: "text", status: "text", notes: "text", message: "text", source_week: "textnull", source: "json", created_at: "ts", updated_at: "ts" }),
  project_events: T({ id: "text", project_id: "text", at: "ts", text: "text", kind: "textnull", author: "textnull" }),
  audit_log: T({ id: "text", at: "ts", entity: "text", operation: "text", record_id: "text", label: "text" }),
} as const;
type Table = keyof typeof TABLES;
const ENTITY_TABLE = { clients: "clients", staff: "staff", users: "workspace_users", projects: "projects", tasks: "tasks", appointments: "appointments" } as const;
type Entity = keyof typeof ENTITY_TABLE;

const toSnake = (k: string) => k.replace(/[A-Z]/g, m => "_" + m.toLowerCase());
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const PROGRESS_SAFE = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

function toRow(table: Table, obj: Row): Row {
  const out: Row = {};
  const spec = TABLES[table] as Record<string, Kind>;
  const src: Row = {};
  for (const [k, v] of Object.entries(obj)) src[toSnake(k)] = v;
  for (const [col, kind] of Object.entries(spec)) {
    const v = src[col];
    switch (kind) {
      case "text": out[col] = v == null ? "" : String(v); break;
      case "textnull": out[col] = v == null || v === "" ? null : String(v); break;
      case "int": out[col] = col === "progress" ? PROGRESS_SAFE(v) : Math.max(0, Math.round(Number(v) || 0)); break;
      case "bool": out[col] = v === undefined ? true : Boolean(v); break;
      case "boolf": out[col] = v === true || v === "true"; break;
      case "date": out[col] = typeof v === "string" && ISO_DAY.test(v) ? v.slice(0, 10) : null; break;
      case "ts": out[col] = typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : col === "archived_at" ? null : new Date().toISOString(); break;
      case "json": out[col] = v == null ? (col === "source" ? null : col === "attachments" || col === "signers" || col === "extra_docs" ? [] : {}) : v; break;
    }
  }
  return out;
}
function fromRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (v !== null || ["last_movement", "initial_milestone", "integration_delivery", "homologation_date", "go_live_date", "implementation_start", "start_date", "due_date", "date", "next_action_due"].includes(k)) out[toCamel(k)] = v;
  return out;
}

export const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY) && process.env.ESTEIRA_DB_CHAVE);
async function rpc<T>(fn: string, body: Row): Promise<T> {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", cache: "no-store", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text; try { msg = (JSON.parse(text) as { message?: string }).message || text; } catch {}
    throw new Error(/acesso negado/.test(msg) ? "Banco de dados: chave do aplicativo invalida (ESTEIRA_DB_CHAVE)." : `Banco de dados: ${msg}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
const appKey = () => (process.env.ESTEIRA_DB_CHAVE || "").trim();

export async function sbLoad(): Promise<State> {
  const raw = await rpc<Record<string, Row[] | Row>>("esteira_load", { p_key: appKey() });
  const list = (t: string) => ((raw[t] as Row[]) || []).map(fromRow);
  const events = list("project_events") as unknown as (TimelineEvent & { projectId: string })[];
  const byProject = new Map<string, TimelineEvent[]>();
  for (const e of events) { const { projectId, ...ev } = e; if (!byProject.has(projectId)) byProject.set(projectId, []); byProject.get(projectId)!.push(ev); }
  const meta = (raw.meta || {}) as Row;
  return {
    version: 1, importedAt: String(meta.imported_at || ""), sourceFile: String(meta.source_file || ""),
    clients: list("clients") as unknown as State["clients"],
    projects: (list("projects") as unknown as State["projects"]).map(p => ({ ...p, timeline: byProject.get(p.id) || [] })),
    tasks: list("tasks") as unknown as State["tasks"],
    appointments: list("appointments") as unknown as State["appointments"],
    staff: list("staff") as unknown as State["staff"],
    users: list("workspace_users") as unknown as State["users"],
    audit: list("audit_log") as unknown as State["audit"],
  };
}

const eventRows = (pid: string, tl: TimelineEvent[] = []) => tl.map(e => toRow("project_events", { ...e, projectId: pid } as unknown as Row));
const stripTimeline = (p: Row) => { const { timeline: _t, ...rest } = p; return rest; };

/** Grava somente o que mudou entre `before` e `after` (uma transação no banco). */
export async function sbSaveDiff(before: State, after: State) {
  const payload: { upsert: Record<string, Row[]>; delete: Record<string, string[]>; events: Record<string, Row[]>; audit: Row[] } = { upsert: {}, delete: {}, events: {}, audit: [] };
  for (const entity of Object.keys(ENTITY_TABLE) as Entity[]) {
    const table = ENTITY_TABLE[entity];
    const prev = new Map((before[entity] as unknown as Row[]).map(r => [String(r.id), JSON.stringify(entity === "projects" ? stripTimeline(r) : r)]));
    const nowRows = after[entity] as unknown as Row[];
    const changed = nowRows.filter(r => prev.get(String(r.id)) !== JSON.stringify(entity === "projects" ? stripTimeline(r) : r));
    if (changed.length) payload.upsert[table] = changed.map(r => toRow(table, r));
    const ids = new Set(nowRows.map(r => String(r.id)));
    const gone = [...prev.keys()].filter(id => !ids.has(id));
    if (gone.length) payload.delete[table] = gone;
  }
  const prevTl = new Map(before.projects.map(p => [p.id, JSON.stringify(p.timeline || [])]));
  for (const p of after.projects) if (prevTl.get(p.id) !== JSON.stringify(p.timeline || []) && (p.timeline?.length || prevTl.has(p.id))) payload.events[p.id] = eventRows(p.id, p.timeline);
  const known = new Set(before.audit.map(a => a.id));
  payload.audit = after.audit.filter(a => !known.has(a.id)).map(a => toRow("audit_log", a as unknown as Row));
  if (!Object.keys(payload.upsert).length && !Object.keys(payload.delete).length && !Object.keys(payload.events).length && !payload.audit.length) return;
  await rpc("esteira_apply", { p_key: appKey(), p: payload });
}

/** Substitui a base inteira (importação/migração). */
export async function sbReplace(s: State) {
  const upsert: Record<string, Row[]> = {};
  for (const entity of Object.keys(ENTITY_TABLE) as Entity[]) upsert[ENTITY_TABLE[entity]] = (s[entity] as unknown as Row[]).map(r => toRow(ENTITY_TABLE[entity], entity === "projects" ? stripTimeline(r) : r));
  const events: Record<string, Row[]> = {};
  for (const p of s.projects) if (p.timeline?.length) events[p.id] = eventRows(p.id, p.timeline);
  return rpc<{ written: number }>("esteira_apply", { p_key: appKey(), p: { replace: true, upsert, events, audit: (s.audit || []).slice(0, 1000).map(a => toRow("audit_log", a as unknown as Row)), meta: { imported_at: s.importedAt || new Date().toISOString(), source_file: s.sourceFile || "backup" } } });
}

/** Usado só para teste/migração: monta o payload de substituição sem enviar. */
export function buildReplacePayload(s: State) {
  const upsert: Record<string, Row[]> = {};
  for (const entity of Object.keys(ENTITY_TABLE) as Entity[]) upsert[ENTITY_TABLE[entity]] = (s[entity] as unknown as Row[]).map(r => toRow(ENTITY_TABLE[entity], entity === "projects" ? stripTimeline(r) : r));
  return { replace: true, upsert };
}

/** Login: valida e-mail + senha no banco (bcrypt). Devolve o usuário ou null. */
export async function sbAuth(email: string, password: string) {
  return rpc<{ id: string; name: string; email: string; role: string } | null>("esteira_auth", { p_key: appKey(), p_email: email, p_password: password });
}
/** Define/troca a senha de um usuário (guardada só como hash no banco). */
export async function sbSetPassword(userId: string, password: string) {
  const ok = await rpc<boolean>("esteira_set_password", { p_key: appKey(), p_user_id: userId, p_password: password });
  if (!ok) throw new Error("Usuário não encontrado para definir a senha.");
}

/* V8 · Documentos (PDF) no Supabase Storage privado, liberados por "ticket" de curta duração. */
const DOC_BUCKET = "esteira-docs";
const sbBase = () => (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const sbPublicKey = () => (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
export async function sbDocUploadTicket(projectId: string, phase: string) {
  const path = await rpc<string>("esteira_doc_ticket", { p_key: appKey(), p_project_id: projectId, p_phase: phase, p_kind: "up" });
  return { path, uploadUrl: `${sbBase()}/storage/v1/object/${DOC_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, apikey: sbPublicKey() };
}
export async function sbDocSignedUrl(projectId: string, phase: string, path: string, fileName?: string) {
  await rpc<string>("esteira_doc_ticket", { p_key: appKey(), p_project_id: projectId, p_phase: phase, p_kind: "down", p_path: path });
  const key = sbPublicKey();
  const res = await fetch(`${sbBase()}/storage/v1/object/sign/${DOC_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 120 }),
  });
  const j = await res.json().catch(() => ({})) as { signedURL?: string; message?: string; error?: string };
  if (!res.ok || !j.signedURL) throw new Error(`Documento indisponível: ${j.message || j.error || res.status}`);
  const url = `${sbBase()}/storage/v1${j.signedURL}`;
  return fileName ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}` : url;
}

/* ---------- V12 · Fotos e PDFs das atividades (mesmo armazenamento privado, pasta <projeto>/tasks/<atividade>/) ---------- */
const filePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
export async function sbFileUploadTicket(projectId: string, taskId: string, ext: string) {
  const path = await rpc<string>("esteira_file_ticket", { p_key: appKey(), p_project_id: projectId, p_task_id: taskId, p_kind: "up", p_ext: ext });
  return { path, uploadUrl: `${sbBase()}/storage/v1/object/${DOC_BUCKET}/${filePath(path)}`, apikey: sbPublicKey() };
}
export async function sbFileSignedUrl(projectId: string, taskId: string, path: string, fileName?: string) {
  await rpc<string>("esteira_file_ticket", { p_key: appKey(), p_project_id: projectId, p_task_id: taskId, p_kind: "down", p_path: path });
  const key = sbPublicKey();
  const res = await fetch(`${sbBase()}/storage/v1/object/sign/${DOC_BUCKET}/${filePath(path)}`, {
    method: "POST", cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }),
  });
  const j = await res.json().catch(() => ({})) as { signedURL?: string; message?: string; error?: string };
  if (!res.ok || !j.signedURL) throw new Error(`Arquivo indisponível: ${j.message || j.error || res.status}`);
  const url = `${sbBase()}/storage/v1${j.signedURL}`;
  return fileName ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}` : url;
}

/* ---------- V13 · Upload feito pelo servidor (ex.: PDF assinado devolvido pela ZapSign) ---------- */
export async function sbUploadBytes(uploadUrl: string, apikey: string, bytes: Uint8Array, contentType = "application/pdf") {
  const res = await fetch(uploadUrl, { method: "POST", headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": contentType, "x-upsert": "false" }, body: Buffer.from(bytes) });
  if (!res.ok) throw new Error(`Falha ao guardar o arquivo (${res.status}).`);
}

/* V18 · Evolução da esteira: fotos diárias */
export async function sbSnapshotSave(day: string, rows: Row[]) {
  return rpc<number>("esteira_snapshot_save", { p_key: appKey(), p_day: day, p_rows: rows });
}
export async function sbSnapshotsLoad(since: string) {
  return rpc<Row[]>("esteira_snapshots_load", { p_key: appKey(), p_since: since });
}

/* V22 · Erros do sistema */
export async function sbErrorLog(row: Row) { return rpc<string>("esteira_error_log", { p_key: appKey(), p: row }); }
export async function sbErrorsLoad(limit = 500) { return rpc<Row[]>("esteira_errors_load", { p_key: appKey(), p_limit: limit }); }
export async function sbErrorResolve(ids: string[], by: string, note?: string, reopen = false) { return rpc<number>("esteira_error_resolve", { p_key: appKey(), p_ids: ids, p_by: by, p_note: note || null, p_reopen: reopen }); }

/* V26 · Fotos de perfil enviadas pelo app */
export async function sbAvatarSet(akey: string, name: string, data: string, by?: string) { return rpc<string>("esteira_avatar_set", { p_key: appKey(), p_akey: akey, p_name: name, p_data: data, p_by: by || null }); }
export async function sbAvatarGet(akey: string) { return rpc<string | null>("esteira_avatar_get", { p_key: appKey(), p_akey: akey }); }
export async function sbAvatarsList() { return rpc<{ key: string; name: string; updated_at: string }[]>("esteira_avatars_list", { p_key: appKey() }); }
export async function sbAvatarDelete(akey: string) { return rpc<boolean>("esteira_avatar_delete", { p_key: appKey(), p_akey: akey }); }
