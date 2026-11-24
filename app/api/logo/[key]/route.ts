// V32 · Imagem do logo do cliente (para quem está logado e para a TV).
import { getAvatar } from "@/lib/avatar-store";
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!/^logo-[a-z0-9-]{1,55}$/.test(key)) return new Response("", { status: 404 });
  const b64 = await getAvatar(key).catch(() => null);
  if (!b64) return new Response("", { status: 404 });
  const buf = Buffer.from(b64, "base64"), png = buf[0] === 0x89 && buf[1] === 0x50;
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": png ? "image/png" : "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": versioned ? "private, max-age=2592000, immutable" : "private, max-age=600" } });
}
