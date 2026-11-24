// V32 · Logos dos clientes: registro no navegador (vem junto com /api/state) e domínios do site da empresa.
import type { Client } from "./types";

export type LogoEntry = { clientId: string; key: string; v: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
let byId = new Map<string, LogoEntry>();
let byName = new Map<string, LogoEntry>();
let sig = "";
let lastClients: Client[] = [];

/** Chave de armazenamento do logo de um cliente (mesma tabela das fotos de perfil). */
export const logoKey = (clientId: string) => ("logo-" + clientId.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).slice(0, 60).replace(/-+$/, "");

/** Recebe a lista de logos e os clientes (para achar o logo também pelo nome do cliente/projeto). */
export function registerLogos(list?: LogoEntry[] | null, clients?: Client[] | null) {
  if (!Array.isArray(list)) return;
  if (Array.isArray(clients)) lastClients = clients;
  const s = list.map(l => `${l.clientId}:${l.v}`).join("|") + "#" + lastClients.map(c => `${c.id}=${c.name}/${c.info?.tradeName || ""}`).join(","); if (s === sig) return; sig = s;
  byId = new Map(list.map(l => [l.clientId, l]));
  byName = new Map();
  for (const c of lastClients) {
    const l = byId.get(c.id); if (!l) continue;
    for (const n of [c.name, c.info?.tradeName]) if (n && norm(n)) byName.set(norm(n), l);
  }
}
const url = (l?: LogoEntry | null) => l ? `/api/logo/${l.key}?v=${l.v}` : null;
export const logoUrl = (clientId?: string | null) => url(clientId ? byId.get(clientId) : null);
/** Pelo nome do cliente ou do projeto ("Via Sul", "Tropical"...). */
export const logoUrlByName = (name?: string | null) => url(name ? byName.get(norm(name)) : null);

const FREE = /(^|\.)(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|bol|uol|terra|ig|icloud|me|aol|protonmail|zoho)\.(com|com\.br|net|br)$/i;
export const cleanDomain = (v?: string | null) => {
  let d = String(v || "").trim().toLowerCase();
  if (!d) return "";
  if (d.includes("@")) d = d.split("@").pop() || "";
  d = d.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0].replace(/^www\./, "").replace(/\.$/, "");
  return /^(?=.{4,190}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d) ? d : "";
};
export const isFreeMail = (d: string) => FREE.test(d);

/** Sites prováveis do cliente: o site cadastrado e os domínios dos e-mails de patrocinador, key users, TI, dono e gerente. */
export function clientDomains(c?: Client | null): string[] {
  if (!c) return [];
  const i = c.info || {};
  const raw = [i.site, i.sponsor?.email, ...(i.keyUsers || []).map(k => k.email), i.itSupport?.email, i.owner?.email, i.manager?.email, ...(c.signers || []).map(s => s.email)];
  const out: string[] = [];
  for (const r of raw) { const d = cleanDomain(r); if (d && !isFreeMail(d) && !/wmsexpert/.test(d) && !out.includes(d)) out.push(d); }
  return out;
}

/** Corta as bordas vazias/brancas, reduz para no máximo 480×240 e devolve PNG (ou JPEG se ficar grande). Só no navegador. */
export function normalizeLogo(img: HTMLImageElement): string {
  let w = img.naturalWidth || 0, h = img.naturalHeight || 0;
  if (!w || !h) { w = 600; h = 240; } // SVG sem tamanho
  const scale0 = Math.min(1, 1200 / Math.max(w, h));
  const W0 = Math.max(1, Math.round(w * scale0)), H0 = Math.max(1, Math.round(h * scale0));
  const c0 = document.createElement("canvas"); c0.width = W0; c0.height = H0;
  const g0 = c0.getContext("2d", { willReadFrequently: true })!; g0.drawImage(img, 0, 0, W0, H0);
  const px = g0.getImageData(0, 0, W0, H0).data;
  let x1 = W0, y1 = H0, x2 = -1, y2 = -1;
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
    const o = (y * W0 + x) * 4, a = px[o + 3];
    if (a > 16 && !(px[o] > 244 && px[o + 1] > 244 && px[o + 2] > 244)) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  }
  if (x2 < x1 || y2 < y1) { x1 = 0; y1 = 0; x2 = W0 - 1; y2 = H0 - 1; }
  const pad = Math.round(Math.max(x2 - x1, y2 - y1) * 0.04);
  x1 = Math.max(0, x1 - pad); y1 = Math.max(0, y1 - pad); x2 = Math.min(W0 - 1, x2 + pad); y2 = Math.min(H0 - 1, y2 + pad);
  const cw = x2 - x1 + 1, ch = y2 - y1 + 1, k = Math.min(1, 480 / cw, 240 / ch);
  const W = Math.max(1, Math.round(cw * k)), H = Math.max(1, Math.round(ch * k));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(c0, x1, y1, cw, ch, 0, 0, W, H);
  let data = c.toDataURL("image/png");
  if (data.length > 370_000) {
    const j = document.createElement("canvas"); j.width = W; j.height = H;
    const gj = j.getContext("2d")!; gj.fillStyle = "#fff"; gj.fillRect(0, 0, W, H); gj.drawImage(c, 0, 0);
    data = j.toDataURL("image/jpeg", 0.9);
  }
  return data;
}

/** Carrega uma imagem (do próprio app) e espera terminar. */
export const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error("Não foi possível ler esta imagem.")); i.src = src; });
