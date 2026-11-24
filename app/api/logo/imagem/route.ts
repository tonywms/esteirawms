// V32 · Traz uma imagem encontrada no site do cliente para a tela de escolha (evita bloqueio do navegador).
import { problem } from "@/lib/storage";
import { safeFetch } from "@/lib/logo-discover";
import { logoEditor } from "@/lib/logo-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sniff = (b: Buffer) => b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b.subarray(0, 4).toString() === "GIF8" ? "image/gif"
  : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "image/webp" : b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 ? "image/x-icon"
  : /<svg[\s>]/i.test(b.subarray(0, 4096).toString("utf8")) ? "image/svg+xml" : "";

export async function GET(req: Request) {
  const a = await logoEditor(); if (!a.ok) return problem("Seu perfil não pode buscar logos.", 403);
  const raw = new URL(req.url).searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(raw) || raw.length > 2000) return problem("Endereço de imagem inválido.");
  try {
    const r = await safeFetch(raw, { maxBytes: 3_000_000, accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8" });
    const type = sniff(r.body); if (!type) return problem("O endereço não é uma imagem.", 415);
    return new Response(new Uint8Array(r.body), { headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "Content-Disposition": "inline; filename=\"logo\"", "Cache-Control": "private, max-age=600" } });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao trazer a imagem.", 502); }
}
