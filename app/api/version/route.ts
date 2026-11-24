// V36 · Versão publicada do site. A TV e as telas abertas comparam com a versão que carregaram
// e se atualizam sozinhas quando sai uma versão nova (sem precisar de F5).
import { readFileSync } from "node:fs";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let local: string | null = null;
function buildId() {
  const v = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA;
  if (v) return v;
  if (local) return local;
  for (const dir of [".next", ".next-wms-v2-validation"]) {
    try { local = readFileSync(path.join(process.cwd(), dir, "BUILD_ID"), "utf8").trim(); if (local) return local; } catch { /* sem build */ }
  }
  return (local = "dev");
}
export async function GET() {
  return Response.json({ v: buildId() }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
