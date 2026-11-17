// V7.1 · Acesso por usuário (e-mail + senha cadastrados em Usuários, senha com bcrypt no Supabase).
// Perfis: Administrador = tudo, inclusive usuários | Gestor/Analista/Consultor = edita a esteira
//         Visualizador = só consulta | TV = link secreto, só /tv.
// Variáveis: ESTEIRA_SEGREDO (assina o cookie), ESTEIRA_TV_CHAVE (link da TV).
export const COOKIE = "esteira_sessao_v2"; // v2: sessao carrega o perfil (parametros de acesso)
export type Role = "admin" | "editor" | "viewer" | "tv";
export type Session = { r: Role; p?: string; u?: string; n?: string; e?: string; exp: number };
const enc = new TextEncoder();
const env = (k: string) => (process.env[k] || "").trim();
const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; bytes.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};
export const teamPassword = () => env("ESTEIRA_SENHA"); // legado (opcional)
export const tvKey = () => env("ESTEIRA_TV_CHAVE");
const secret = () => env("ESTEIRA_SEGREDO") || teamPassword();
export const authEnabled = () => Boolean(secret());
export const onVercel = () => process.env.VERCEL === "1";
export const roleFromProfile = (profile: string): "admin" | "editor" | "viewer" => profile === "Administrador" ? "admin" : profile === "Visualizador" || profile === "Painel" ? "viewer" : "editor";
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function signSession(s: Omit<Session, "exp">, days: number) {
  const payload = b64url(enc.encode(JSON.stringify({ ...s, exp: Date.now() + days * 864e5 })));
  return `${payload}.${await hmac(payload)}`;
}
export async function readSession(token?: string | null): Promise<Session | null> {
  if (!token || !secret()) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(payload))) return null;
  try {
    const data = JSON.parse(fromB64url(payload)) as Session;
    if (!data.exp || data.exp < Date.now()) return null;
    return ["admin", "editor", "viewer", "tv"].includes(data.r) ? data : null;
  } catch { return null; }
}
