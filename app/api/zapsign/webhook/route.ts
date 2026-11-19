// V13 · Webhook da ZapSign (público): a ZapSign avisa aqui quando alguém assina/recusa.
// Segurança: exige o cabeçalho X-Esteira-Chave = ZAPSIGN_WEBHOOK_CHAVE e SEMPRE confere o documento na API da ZapSign
// antes de mudar qualquer coisa (o conteúdo do aviso não é usado como verdade).
import { safeEqual } from "@/lib/auth";
import { syncZapsignDoc, zapsignConfigured } from "@/lib/zapsign";
import { logError } from "@/lib/error-log";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const key = (process.env.ZAPSIGN_WEBHOOK_CHAVE || "").trim();
  const got = req.headers.get("x-esteira-chave") || new URL(req.url).searchParams.get("k") || "";
  if (!key || !got || !safeEqual(got, key)) return Response.json({ error: "não autorizado" }, { status: 401 });
  if (!zapsignConfigured()) return Response.json({ ok: false, ignored: "zapsign não configurada" });
  const b = await req.json().catch(() => ({})) as { token?: string; external_id?: string; event_type?: string; doc?: { token?: string } };
  const token = b.token || b.doc?.token;
  if (!token || (b.external_id && !String(b.external_id).startsWith("esteira:"))) return Response.json({ ok: true, ignored: true });
  try { const r = await syncZapsignDoc(token, "ZapSign"); return Response.json(r); }
  catch (e) { console.error("zapsign webhook", e); await logError({ level: "erro", source: "zapsign-webhook", action: "POST /api/zapsign/webhook", status: 500, message: "Falha ao processar aviso da ZapSign", detail: e instanceof Error ? e.message : String(e), context: { token, event: b.event_type, external_id: b.external_id } }); return Response.json({ ok: false, error: e instanceof Error ? e.message : "falha" }, { status: 500 }); }
}
