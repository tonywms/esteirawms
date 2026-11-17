import { COOKIE, authEnabled, readSession, roleFromProfile, safeEqual, signSession, teamPassword } from "@/lib/auth";
import { sbAuth, supabaseConfigured } from "@/lib/supabase-store";
export const runtime = "nodejs";
const attempts = new Map<string, { n: number; until: number }>();
const cookie = (v: string, maxAge: number) => `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

/** Quem está logado (para o topo do sistema). */
export async function GET(req: Request) {
  const raw = req.headers.get("cookie")?.split(/;\s*/).find(c => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  const s = await readSession(raw);
  return Response.json(s ? { name: s.n || "", email: s.e || "", role: s.r } : { name: "", role: authEnabled() ? null : "local" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!authEnabled()) return Response.json({ ok: true });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return Response.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { email?: string; senha?: string };
  const email = String(body.email || "").trim(), senha = String(body.senha || "");
  let session: { r: "admin" | "editor" | "viewer"; u?: string; n?: string; e?: string } | null = null;
  try {
    if (email && supabaseConfigured()) {
      const u = await sbAuth(email, senha);
      if (u) session = { r: roleFromProfile(u.role), u: u.id, n: u.name, e: u.email };
    } else if (!email && teamPassword() && safeEqual(senha, teamPassword())) {
      session = { r: "admin", n: "Equipe" }; // compatibilidade com a senha unica antiga
    }
  } catch { return Response.json({ error: "Banco de dados indisponivel. Tente novamente." }, { status: 503 }); }
  if (!session) {
    const n = (a?.n || 0) + 1; attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return Response.json({ error: "E-mail ou senha incorretos, ou usuario inativo." }, { status: 401 });
  }
  attempts.delete(ip);
  const res = Response.json({ ok: true, name: session.n, role: session.r });
  res.headers.append("Set-Cookie", cookie(await signSession(session, 14), 14 * 86400));
  return res;
}
export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", cookie("", 0));
  return res;
}
