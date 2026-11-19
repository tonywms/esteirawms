// V22 · Erros do sistema. POST: qualquer usuário logado registra (o navegador avisa sozinho quando algo falha).
// GET/PATCH: só o usuário master vê a lista e marca como resolvido.
import { authEnabled } from "@/lib/auth";
import { currentUser, isMasterEmail } from "@/lib/master";
import { listErrors, logError, resolveErrors, shortCode } from "@/lib/error-log";
export const runtime = "nodejs";

const recent = new Map<string, number[]>();
async function master() { const u = await currentUser(); return { u, ok: !authEnabled() || isMasterEmail(u.email) }; }

export async function POST(req: Request) {
  const u = await currentUser();
  const key = u.email || u.name || "anon", now = Date.now();
  const hits = (recent.get(key) || []).filter(t => now - t < 60_000);
  if (hits.length >= 30) return Response.json({ ok: false, skipped: "limite" });
  hits.push(now); recent.set(key, hits);
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const message = String(b.message || "").trim().slice(0, 2000);
  if (!message) return Response.json({ ok: false });
  const status = Number(b.status) || null;
  const id = await logError({
    level: b.level === "aviso" || (status !== null && status < 500 && b.level !== "erro") ? "aviso" : "erro",
    source: String(b.source || "navegador").slice(0, 40), page: String(b.page || "").slice(0, 300), action: String(b.action || "").slice(0, 300), status,
    message, detail: String(b.detail || "").slice(0, 4000), context: (b.context as Record<string, unknown>) || null, userName: u.name, userEmail: u.email,
  });
  return Response.json({ ok: true, id, code: shortCode(id) });
}

export async function GET() {
  const m = await master();
  if (!m.ok) return Response.json({ error: "Somente o administrador master vê os erros do sistema." }, { status: 403 });
  try { return Response.json({ errors: await listErrors(800) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Falha ao carregar os erros." }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  const m = await master();
  if (!m.ok) return Response.json({ error: "Somente o administrador master pode alterar os erros." }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { ids?: string[]; note?: string; reopen?: boolean };
  const ids = (b.ids || []).filter(x => typeof x === "string").slice(0, 500);
  if (!ids.length) return Response.json({ error: "Nada selecionado." }, { status: 400 });
  try { return Response.json({ ok: true, n: await resolveErrors(ids, m.u.name || m.u.email || "Master", b.note, !!b.reopen) }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Falha ao salvar." }, { status: 500 }); }
}
