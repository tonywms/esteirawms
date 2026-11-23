import { AVATARS } from "@/lib/avatars-data";
import { getAvatar } from "@/lib/avatar-store";
export const runtime = "nodejs";

// V18.1 · Foto do consultor (só para quem está logado ou para a TV com a chave).
// V26 · Primeiro a foto enviada pelo app; se não houver, a foto embutida.
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!/^[a-z0-9-]{2,60}$/.test(name)) return new Response("", { status: 404 });
  const up = await getAvatar(name).catch(() => null);
  const b64 = up || (Object.prototype.hasOwnProperty.call(AVATARS, name) ? AVATARS[name] : null);
  if (!b64) return new Response("", { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(Buffer.from(b64, "base64"), { headers: { "Content-Type": "image/jpeg", "Cache-Control": versioned ? "private, max-age=2592000, immutable" : "private, max-age=600" } });
}
