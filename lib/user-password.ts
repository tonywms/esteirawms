import { storageMode } from "./storage";
import { sbSetPassword } from "./supabase-store";
export const passwordsAvailable = () => storageMode() === "supabase";
export async function setUserPassword(id: string, password: string) {
  if (!passwordsAvailable()) throw new Error("Senhas exigem o Supabase configurado.");
  await sbSetPassword(id, password);
}
