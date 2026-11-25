// V26 · Fotos de perfil enviadas pelo app (Supabase em produção; arquivo local no modo planilha).
import { promises as fs } from "node:fs";
import path from "node:path";
import { supabaseConfigured, sbAvatarDelete, sbAvatarGet, sbAvatarSet, sbAvatarsList } from "./supabase-store";
import type { AvatarEntry } from "./avatars";
import { logoKey, type LogoEntry } from "./logos";

const FILE = path.join(process.cwd(), "data", "avatars.json");
type Row = { key: string; name: string; data: string; updatedAt: string; by?: string };
async function readFile(): Promise<Row[]> { try { return JSON.parse(await fs.readFile(FILE, "utf8")) as Row[]; } catch { return []; } }
async function writeFile(rows: Row[]) { await fs.mkdir(path.dirname(FILE), { recursive: true }); await fs.writeFile(FILE, JSON.stringify(rows), "utf8"); }

/** "Denilson Maia" → "denilson-maia" */
export const slugKey = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const cache = new Map<string, { at: number; data: string | null }>();
let listCache: { at: number; rows: AvatarEntry[] } | null = null;

async function listAll(): Promise<AvatarEntry[]> {
  if (listCache && Date.now() - listCache.at < 15_000) return listCache.rows;
  const rows = supabaseConfigured()
    ? (await sbAvatarsList()).map(r => ({ key: r.key, name: r.name, v: String(new Date(r.updated_at).getTime()) }))
    : (await readFile()).map(r => ({ key: r.key, name: r.name, v: String(new Date(r.updatedAt).getTime()) }));
  listCache = { at: Date.now(), rows };
  return rows;
}
// V32 · Os logos dos clientes ficam na mesma tabela, com chave "logo-..." e nome "logo:<id do cliente>".
const isLogo = (r: { key: string; name: string }) => r.key.startsWith("logo-") && r.name.startsWith("logo:");
export async function listAvatars(): Promise<AvatarEntry[]> { return (await listAll()).filter(r => !isLogo(r) && !r.key.startsWith("cfg-")); }
export async function listLogos(): Promise<LogoEntry[]> { return (await listAll()).filter(isLogo).map(r => ({ clientId: r.name.slice(5), key: r.key, v: r.v })); }
export async function getAvatar(key: string): Promise<string | null> {
  const c = cache.get(key); if (c && Date.now() - c.at < 60_000) return c.data;
  const data = supabaseConfigured() ? await sbAvatarGet(key) : (await readFile()).find(r => r.key === key)?.data || null;
  cache.set(key, { at: Date.now(), data }); return data;
}
export async function setAvatar(name: string, data: string, by?: string) {
  const key = slugKey(name); if (key.length < 2 || key.startsWith("logo-")) throw new Error("Nome inválido para a foto.");
  if (supabaseConfigured()) await sbAvatarSet(key, name, data, by);
  else { const rows = (await readFile()).filter(r => r.key !== key); rows.push({ key, name, data, updatedAt: new Date().toISOString(), by }); await writeFile(rows); }
  cache.delete(key); listCache = null; return key;
}
export async function deleteAvatar(name: string) {
  const key = slugKey(name); if (key.startsWith("logo-")) throw new Error("Nome inválido para a foto.");
  if (supabaseConfigured()) await sbAvatarDelete(key);
  else await writeFile((await readFile()).filter(r => r.key !== key));
  cache.delete(key); listCache = null; return key;
}

/** V32 · Logo do cliente (PNG ou JPEG em base64). */
export async function setLogo(clientId: string, data: string, by?: string) {
  const key = logoKey(clientId), name = `logo:${clientId}`;
  if (key.length < 7) throw new Error("Cliente inválido para o logo.");
  if (supabaseConfigured()) await sbAvatarSet(key, name, data, by);
  else { const rows = (await readFile()).filter(r => r.key !== key); rows.push({ key, name, data, updatedAt: new Date().toISOString(), by }); await writeFile(rows); }
  cache.delete(key); listCache = null; return key;
}
export async function deleteLogo(clientId: string) {
  const key = logoKey(clientId);
  if (supabaseConfigured()) await sbAvatarDelete(key);
  else await writeFile((await readFile()).filter(r => r.key !== key));
  cache.delete(key); listCache = null; return key;
}
/** Bytes do logo de um cliente (para o PDF e o Word). */
export async function logoBytes(clientId?: string | null): Promise<Buffer | null> {
  if (!clientId) return null;
  const b64 = await getAvatar(logoKey(clientId)).catch(() => null);
  return b64 ? Buffer.from(b64, "base64") : null;
}

/** V41 · Configurações do painel (ex.: quantas semanas a TV mostra). Guardadas na mesma tabela, chave "cfg-...". */
export type PanelConfig = { tvWeeks?: number };
export async function getPanelConfig(): Promise<PanelConfig> {
  const b64 = await getAvatar("cfg-painel").catch(() => null);
  if (!b64) return {};
  try { return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as PanelConfig; } catch { return {}; }
}
export async function setPanelConfig(cfg: PanelConfig, by?: string) {
  const data = Buffer.from(JSON.stringify(cfg), "utf8").toString("base64");
  if (supabaseConfigured()) await sbAvatarSet("cfg-painel", "cfg:painel", data, by);
  else { const rows = (await readFile()).filter(r => r.key !== "cfg-painel"); rows.push({ key: "cfg-painel", name: "cfg:painel", data, updatedAt: new Date().toISOString(), by }); await writeFile(rows); }
  cache.delete("cfg-painel"); listCache = null; return cfg;
}
