// V21 · Contatos para assinatura: normalização, aviso de duplicado e sugestão de cliente.
import type { Client, ClientSigner } from "./types";

export type ZsPerson = { name: string; email: string; phone: string; docs: number; lastAt: string; docNames: string[] };
export const normEmail = (e?: string | null) => (e || "").trim().toLowerCase();
export function normPhone(p?: string | null) {
  let d = (p || "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d : "";
}
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GENERIC = /^(gmail|hotmail|outlook|live|yahoo|uol|bol|icloud|terra|ig|msn|globo|protonmail)\./;

export type Dup = { clientId: string; clientName: string; signer: ClientSigner; by: "e-mail" | "celular" };
/** Procura o mesmo e-mail ou celular nos contatos de todos os clientes. */
export function findDup(clients: Client[], who: { email?: string; phone?: string }, except?: { clientId?: string; signerId?: string }): Dup | null {
  const e = normEmail(who.email), ph = normPhone(who.phone);
  if (!e && !ph) return null;
  for (const c of clients) for (const s of c.signers || []) {
    if (except?.signerId && s.id === except.signerId && (!except.clientId || except.clientId === c.id)) continue;
    if (e && normEmail(s.email) === e) return { clientId: c.id, clientName: c.name, signer: s, by: "e-mail" };
    if (ph && normPhone(s.phone) === ph) return { clientId: c.id, clientName: c.name, signer: s, by: "celular" };
  }
  return null;
}
export const dupText = (d: Dup, currentClientId?: string) => `${d.by === "e-mail" ? "E-mail" : "Celular"} já cadastrado ${d.clientId === currentClientId ? "neste cliente" : `em ${d.clientName}`} como ${d.signer.name || "contato sem nome"}`;

/** Sugere o cliente de uma pessoa da ZapSign: domínio do e-mail ou nome do cliente no nome dos documentos. */
export function suggestClient(p: { email?: string; docNames?: string[] }, clients: Client[]): Client | null {
  const dom = normEmail(p.email).split("@")[1] || "";
  if (dom && !GENERIC.test(dom)) {
    const byDomain = clients.find(c => (c.signers || []).some(s => normEmail(s.email).endsWith("@" + dom)));
    if (byDomain) return byDomain;
    const base = plain(dom.split(".")[0]);
    const byName = clients.find(c => { const n = plain(c.name).replace(/[^a-z0-9]/g, ""); return n.length >= 4 && (base.includes(n) || n.includes(base) && base.length >= 4); });
    if (byName) return byName;
  }
  const docs = (p.docNames || []).map(plain).join(" | ");
  if (docs) {
    const hit = clients.filter(c => plain(c.name).length >= 4).sort((a, b) => b.name.length - a.name.length).find(c => docs.includes(plain(c.name)));
    if (hit) return hit;
  }
  return null;
}
export const newSignerId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
export const fmtPhone = (p?: string) => { const d = normPhone(p); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p || ""; };
