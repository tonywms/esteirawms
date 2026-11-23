// V26 · Enviar / remover foto de perfil. Pode quem gerencia Usuários ou Equipe, ou a própria pessoa.
import { authEnabled } from "@/lib/auth";
import { currentUser } from "@/lib/master";
import { asProfile, canWriteEntity } from "@/lib/permissions";
import { audit, problem, transact } from "@/lib/storage";
import { deleteAvatar, listAvatars, setAvatar } from "@/lib/avatar-store";
export const runtime = "nodejs";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
async function allowed(name: string) {
  if (!authEnabled()) return { ok: true, who: "Equipe" };
  const u = await currentUser(); const p = asProfile(u.profile);
  const ok = !!p && p !== "Painel" && (canWriteEntity(p, "users", "PATCH") || canWriteEntity(p, "staff", "PATCH") || (!!u.name && norm(u.name) === norm(name)));
  return { ok, who: u.name || u.email };
}

export async function GET() { return Response.json({ avatars: await listAvatars().catch(() => []) }, { headers: { "Cache-Control": "no-store" } }); }

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { name?: string; data?: string };
  const name = (b.name || "").trim().slice(0, 120);
  const data = String(b.data || "").replace(/^data:image\/jpeg;base64,/, "");
  if (!name) return problem("Informe de quem é a foto.");
  if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 200) return problem("Foto inválida. Escolha uma imagem JPG ou PNG.");
  if (data.length > 380_000) return problem("A foto ficou grande demais. Escolha outra imagem.");
  if (!Buffer.from(data.slice(0, 8), "base64").subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return problem("Foto inválida (esperado JPEG).");
  const a = await allowed(name); if (!a.ok) return problem("Você só pode trocar a sua própria foto. Peça a um Administrador ou Gestor.", 403);
  try {
    const key = await setAvatar(name, data, a.who);
    await transact(s => { audit(s, "users", "foto de perfil", key, `${name} · por ${a.who}`); return null; }).catch(() => {});
    return Response.json({ ok: true, key, avatars: await listAvatars() });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao salvar a foto."); }
}

export async function DELETE(req: Request) {
  const b = await req.json().catch(() => ({})) as { name?: string };
  const name = (b.name || "").trim(); if (!name) return problem("Informe de quem é a foto.");
  const a = await allowed(name); if (!a.ok) return problem("Você só pode remover a sua própria foto.", 403);
  try {
    const key = await deleteAvatar(name);
    await transact(s => { audit(s, "users", "foto de perfil removida", key, `${name} · por ${a.who}`); return null; }).catch(() => {});
    return Response.json({ ok: true, avatars: await listAvatars() });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha ao remover a foto."); }
}
