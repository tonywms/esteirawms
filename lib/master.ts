// V9 · Usuário master: libera fase sem PDF, encerra ou cancela projetos.
// Quem é master: ESTEIRA_MASTERS (e-mails separados por vírgula). Padrão: tonikq24@gmail.com.
// A liberação sempre exige e-mail + senha do master (conferidos no Supabase, senha em bcrypt).
import { cookies } from "next/headers";
import { COOKIE, readSession } from "./auth";
import { sbAuth, supabaseConfigured } from "./supabase-store";

export const masterEmails = () => (process.env.ESTEIRA_MASTERS || "tonikq24@gmail.com").split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
export const isMasterEmail = (email?: string | null) => !!email && masterEmails().includes(email.trim().toLowerCase());

const tries = new Map<string, { n: number; at: number }>();
export async function verifyMaster(email: string, password: string): Promise<{ ok: true; name: string; email: string } | { ok: false; error: string }> {
  const e = (email || "").trim().toLowerCase();
  if (!e || !password) return { ok: false, error: "Informe o e-mail e a senha do usuário master." };
  const t = tries.get(e);
  if (t && t.n >= 5 && Date.now() - t.at < 10 * 60e3) return { ok: false, error: "Muitas tentativas. Aguarde 10 minutos." };
  if (!supabaseConfigured()) return { ok: false, error: "A liberação master exige o Supabase configurado." };
  if (!isMasterEmail(e)) { tries.set(e, { n: (t?.n || 0) + 1, at: Date.now() }); return { ok: false, error: "Este e-mail não tem permissão master." }; }
  const u = await sbAuth(e, password).catch(() => null);
  if (!u) { tries.set(e, { n: (t?.n || 0) + 1, at: Date.now() }); return { ok: false, error: "E-mail ou senha do master incorretos." }; }
  tries.delete(e);
  return { ok: true, name: u.name || e, email: u.email || e };
}

/** Quem está logado (para registrar quem pediu a ação). */
export async function currentUser() {
  const s = await readSession((await cookies()).get(COOKIE)?.value).catch(() => null);
  return { name: s?.n || "Equipe", email: s?.e || "", profile: s?.p || "" };
}
