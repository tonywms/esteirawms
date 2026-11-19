import { AVATARS } from "@/lib/avatars-data";
export const runtime = "nodejs";

// V18.1 · Foto do consultor (só para quem está logado ou para a TV com a chave).
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const b64 = Object.prototype.hasOwnProperty.call(AVATARS, name) ? AVATARS[name] : null;
  if (!b64) return new Response("", { status: 404 });
  return new Response(Buffer.from(b64, "base64"), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
}
