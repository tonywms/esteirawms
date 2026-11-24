// V32 · Procura o logo no site do cliente (site cadastrado ou domínio dos e-mails). Só sugere: nada é salvo aqui.
import { loadState, problem } from "@/lib/storage";
import { clientDomains, cleanDomain } from "@/lib/logos";
import { discoverLogos } from "@/lib/logo-discover";
import { logoEditor } from "@/lib/logo-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const a = await logoEditor(); if (!a.ok) return problem("Seu perfil não pode buscar logos.", 403);
  const u = new URL(req.url), typed = cleanDomain(u.searchParams.get("site")), clientId = u.searchParams.get("cliente") || "";
  let domains: string[] = typed ? [typed] : [];
  if (!typed) {
    if (!clientId) return problem("Informe o cliente ou o site.");
    const st = await loadState(); const c = st.clients.find(x => x.id === clientId); if (!c) return problem("Cliente não encontrado.", 404);
    domains = clientDomains(c);
    if (!domains.length) return Response.json({ domains, results: [], error: "Este cliente não tem site nem e-mail com domínio próprio. Digite o site ou envie o arquivo do logo." });
  }
  const results = await Promise.all(domains.slice(0, 3).map(async d => {
    try { const r = await discoverLogos(d); return { domain: d, site: r.site, candidates: r.candidates }; }
    catch (e) { return { domain: d, site: "", candidates: [], error: e instanceof Error ? e.message : "Falha ao abrir o site." }; }
  }));
  return Response.json({ domains, results }, { headers: { "Cache-Control": "no-store" } });
}
