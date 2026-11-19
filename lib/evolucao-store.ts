// V18 · Guarda e lê as fotos diárias (Supabase em produção; arquivo local no modo planilha).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { State } from "./types";
import { snapshotRows, type Snap } from "./evolucao";
import { supabaseConfigured, sbSnapshotSave, sbSnapshotsLoad } from "./supabase-store";

const FILE = path.join(process.cwd(), "data", "snapshots.json");
let lastSave = 0;

/** "Hoje" no fuso de São Paulo (a foto do dia não pode virar à meia-noite UTC). */
export function todaySP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function readFile(): Promise<Snap[]> { try { return JSON.parse(await fs.readFile(FILE, "utf8")) as Snap[]; } catch { return []; } }

/** Grava a foto de hoje (no máximo a cada 20 min por servidor; a última do dia prevalece). */
export async function recordSnapshot(s: State, force = false) {
  if (!force && Date.now() - lastSave < 20 * 60 * 1000) return;
  lastSave = Date.now();
  const day = todaySP();
  const rows = snapshotRows(s, day).map(({ est: _e, day: _d, ...r }) => r);
  if (!rows.length) return;
  if (supabaseConfigured()) { await sbSnapshotSave(day, rows); return; }
  const all = (await readFile()).filter(r => r.day !== day);
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify([...all, ...rows.map(r => ({ ...r, day }))]), "utf8");
}

export async function loadSnapshots(since: string): Promise<Snap[]> {
  const rows = supabaseConfigured() ? ((await sbSnapshotsLoad(since)) as unknown as Snap[]) : (await readFile()).filter(r => r.day >= since);
  return rows.map(r => ({ ...r, day: String(r.day).slice(0, 10), progress: Number(r.progress) || 0, health: Number(r.health) || 0 }));
}
