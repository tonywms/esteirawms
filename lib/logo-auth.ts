// V32 · Quem pode trocar o logo de um cliente: quem pode editar clientes (Administrador, Gestor, Analista).
import { authEnabled } from "./auth";
import { currentUser } from "./master";
import { asProfile, canWriteEntity } from "./permissions";

export async function logoEditor() {
  if (!authEnabled()) return { ok: true, who: "Equipe" };
  const u = await currentUser(); const p = asProfile(u.profile);
  return { ok: !!p && p !== "Painel" && canWriteEntity(p, "clients", "PATCH"), who: u.name || u.email };
}
