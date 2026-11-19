// V22 · Registro de erros do sistema (Supabase em produção; arquivo local no modo planilha).
// Só o usuário master (ESTEIRA_MASTERS, padrão tonymoreira@wmsexpert.com.br) consulta a lista.
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { supabaseConfigured, sbErrorLog, sbErrorResolve, sbErrorsLoad } from "./supabase-store";

export type ErrorEntry = { id: string; at: string; level: "erro" | "aviso"; source: string; page?: string; action?: string; status?: number | null; message: string; detail?: string; context?: Record<string, unknown> | null; userName?: string; userEmail?: string; resolvedAt?: string | null; resolvedBy?: string | null; note?: string | null };
const FILE = path.join(process.cwd(), "data", "errors.json");
let queue: Promise<void> = Promise.resolve(); // modo local: grava um de cada vez
const readFile = async (): Promise<ErrorEntry[]> => { try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return []; } };
const writeFile = async (l: ErrorEntry[]) => { await fs.mkdir(path.dirname(FILE), { recursive: true }); await fs.writeFile(FILE, JSON.stringify(l.slice(0, 3000)), "utf8"); };
/** Código curto para o usuário informar (ex.: E-7F3A2C). */
export const shortCode = (id: string) => `E-${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;

const SECRET = /(senha|password|token|segredo|secret|apikey|authorization|chave)/i;
export function scrub(v: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (typeof v === "string") return v.length > 600 ? `${v.slice(0, 600)}…` : v;
  if (Array.isArray(v)) return v.slice(0, 20).map(x => scrub(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 40).map(([k, x]) => [k, SECRET.test(k) ? "•••" : scrub(x, depth + 1)]));
  return v;
}

export async function logError(e: Omit<ErrorEntry, "id" | "at"> & { id?: string }) {
  const id = e.id || randomUUID().replace(/-/g, "");
  const row = { id, level: e.level, source: e.source, page: e.page, action: e.action, status: e.status ?? null, message: e.message, detail: e.detail, context: scrub(e.context || {}), user_name: e.userName, user_email: e.userEmail };
  try {
    if (supabaseConfigured()) await sbErrorLog(row);
    else { queue = queue.then(async () => { const l = await readFile(); l.unshift({ ...e, id, at: new Date().toISOString(), context: row.context as Record<string, unknown> }); await writeFile(l); }); await queue; }
  } catch (err) { console.error("[esteira] falha ao registrar erro", err, e.message); }
  return id;
}

export async function listErrors(limit = 500): Promise<ErrorEntry[]> {
  if (!supabaseConfigured()) return (await readFile()).slice(0, limit);
  const rows = await sbErrorsLoad(limit);
  return rows.map(r => ({ id: String(r.id), at: String(r.at), level: (r.level === "aviso" ? "aviso" : "erro"), source: String(r.source || ""), page: (r.page as string) || "", action: (r.action as string) || "", status: (r.status as number) ?? null, message: String(r.message || ""), detail: (r.detail as string) || "", context: (r.context as Record<string, unknown>) || null, userName: (r.user_name as string) || "", userEmail: (r.user_email as string) || "", resolvedAt: (r.resolved_at as string) || null, resolvedBy: (r.resolved_by as string) || null, note: (r.note as string) || null }));
}

export async function resolveErrors(ids: string[], by: string, note?: string, reopen = false) {
  if (supabaseConfigured()) return sbErrorResolve(ids, by, note, reopen);
  const l = await readFile(); let n = 0;
  for (const x of l) if (ids.includes(x.id)) { x.resolvedAt = reopen ? null : new Date().toISOString(); x.resolvedBy = reopen ? null : by; if (note) x.note = note; n++; }
  await writeFile(l); return n;
}
