// V32 · Salvar / remover o logo de um cliente. Vale para todas as telas, para o PDF do cronograma e para o Escopo em Word.
import { audit, loadState, problem, transact } from "@/lib/storage";
import { deleteLogo, listLogos, setLogo } from "@/lib/avatar-store";
import { logoEditor } from "@/lib/logo-auth";
export const runtime = "nodejs";

export async function GET() { return Response.json({ logos: await listLogos().catch(() => []) }, { headers: { "Cache-Control": "no-store" } }); }

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]), JPG = Buffer.from([0xff, 0xd8, 0xff]);
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { clientId?: string; data?: string; source?: string };
  const clientId = String(b.clientId || "").trim();
  const data = String(b.data || "").replace(/^data:image\/(png|jpeg);base64,/, "");
  if (!clientId) return problem("Informe o cliente.");
  if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 100) return problem("Logo inválido. Escolha uma imagem PNG ou JPG.");
  if (data.length > 390_000) return problem("O logo ficou grande demais. Escolha uma imagem menor.");
  const head = Buffer.from(data.slice(0, 12), "base64");
  if (!head.subarray(0, 4).equals(PNG) && !head.subarray(0, 3).equals(JPG)) return problem("Logo inválido (esperado PNG ou JPG).");
  const a = await logoEditor(); if (!a.ok) return problem("Seu perfil não pode trocar o logo dos clientes.", 403);
  const st = await loadState(); const c = st.clients.find(x => x.id === clientId); if (!c) return problem("Cliente não encontrado.", 404);
  try {
    const key = await setLogo(clientId, data, a.who);
    const src = String(b.source || "").slice(0, 160);
    await transact(s => { audit(s, "clients", "logo", clientId, `${c.name} · logo ${src ? `(${src}) ` : ""}por ${a.who}`); return null; }).catch(() => {});
    return Response.json({ ok: true, key, logos: await listLogos() });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao salvar o logo."); }
}

export async function DELETE(req: Request) {
  const b = await req.json().catch(() => ({})) as { clientId?: string };
  const clientId = String(b.clientId || "").trim(); if (!clientId) return problem("Informe o cliente.");
  const a = await logoEditor(); if (!a.ok) return problem("Seu perfil não pode remover o logo dos clientes.", 403);
  try {
    await deleteLogo(clientId);
    const st = await loadState(); const c = st.clients.find(x => x.id === clientId);
    await transact(s => { audit(s, "clients", "logo removido", clientId, `${c?.name || clientId} · por ${a.who}`); return null; }).catch(() => {});
    return Response.json({ ok: true, logos: await listLogos() });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao remover o logo."); }
}
