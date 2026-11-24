// V32 · Busca do logo no site da empresa (só no servidor).
// Lê a página inicial e junta as imagens que parecem logo: marcação "logo" do site (JSON-LD/itemprop),
// <img> com "logo" no nome/classe/alt, ícones da página e a imagem de compartilhamento. Nada é salvo aqui.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cleanDomain } from "./logos";

export type LogoCandidate = { url: string; source: string; score: number };

function privateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}
async function assertPublic(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Endereço inválido.");
  if (u.username || u.password) throw new Error("Endereço inválido.");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("Endereço inválido.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) { if (privateIp(host)) throw new Error("Endereço não permitido."); return; }
  if (!/\./.test(host) || /(^|\.)(localhost|local|internal|intranet|lan)$/i.test(host)) throw new Error("Endereço não permitido.");
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => privateIp(a.address))) throw new Error("Endereço não permitido.");
}

/** fetch com verificação de endereço público em cada redirecionamento, tempo e tamanho limitados. */
export async function safeFetch(raw: string, opts: { maxBytes: number; accept: string; timeoutMs?: number }) {
  let u = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 7000);
    try {
      const r = await fetch(u, { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; WMSExpertEsteira/1.0; +logo)", Accept: opts.accept, "Accept-Language": "pt-BR,pt;q=0.9" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = new URL(r.headers.get("location")!, u); continue; }
      if (!r.ok || !r.body) throw new Error(`O site respondeu ${r.status}.`);
      const len = Number(r.headers.get("content-length") || 0); if (len > opts.maxBytes) throw new Error("Arquivo grande demais.");
      const reader = r.body.getReader(), parts: Uint8Array[] = []; let size = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > opts.maxBytes) { await reader.cancel(); throw new Error("Arquivo grande demais."); } parts.push(value); }
      return { url: u, type: (r.headers.get("content-type") || "").toLowerCase(), body: Buffer.concat(parts) };
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error("O site demorou demais para responder.");
      throw e;
    } finally { clearTimeout(t); }
  }
  throw new Error("Redirecionamentos demais.");
}

const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : ""; };
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/g, '"');

/** Procura imagens de logo na página inicial de um domínio. */
export async function discoverLogos(domainRaw: string): Promise<{ site: string; candidates: LogoCandidate[] }> {
  const domain = cleanDomain(domainRaw); if (!domain) throw new Error("Informe um site válido (ex.: empresa.com.br).");
  let page: Awaited<ReturnType<typeof safeFetch>> | null = null, lastErr: unknown = null;
  for (const base of [`https://${domain}/`, `https://www.${domain}/`, `http://www.${domain}/`]) {
    try { page = await safeFetch(base, { maxBytes: 2_500_000, accept: "text/html,application/xhtml+xml" }); if (/html|text\/plain|^$/.test(page.type)) break; page = null; } catch (e) { lastErr = e; }
  }
  if (!page) {
    const m = lastErr instanceof Error ? lastErr.message : "";
    const why = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m) ? "o endereço não existe" : /fetch failed|ECONNREFUSED|ECONNRESET|certificate|CERT/i.test(m) ? "o site não respondeu" : m;
    throw new Error(`Não consegui abrir o site ${domain}${why ? ` (${why})` : ""}. Confira o endereço ou envie o arquivo do logo.`);
  }
  return { site: page.url.origin, candidates: parseLogoCandidates(page.body.toString("utf8").slice(0, 2_500_000), page.url) };
}

/** Lê o HTML e devolve as imagens que parecem logo, das mais prováveis para as menos. */
export function parseLogoCandidates(html: string, at: URL): LogoCandidate[] {
  const found = new Map<string, LogoCandidate>();
  const add = (src: string, source: string, score: number) => {
    src = decode(src || "").trim(); if (!src || src.startsWith("data:") && src.length > 300_000) return;
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)/i.test(src)) { /* imagem embutida: pode ser o logo */ }
    else if (/^(javascript|about|blob):/i.test(src)) return;
    let abs: string; try { abs = src.startsWith("data:") ? src : new URL(src, at).toString(); } catch { return; }
    if (!src.startsWith("data:") && !/^https?:/i.test(abs)) return;
    const prev = found.get(abs); if (!prev || prev.score < score) found.set(abs, { url: abs, source, score });
  };
  // 1) marcação estruturada do site
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const l of m[1].matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/g)) add(l[1].replace(/\\\//g, "/"), "Marcação do site", 120);
  }
  for (const m of html.matchAll(/<(?:img|meta|link)\b[^>]*itemprop\s*=\s*["']?logo[^>]*>/gi)) add(attr(m[0], "src") || attr(m[0], "content") || attr(m[0], "href"), "Marcação do site", 115);
  // 2) <img> que parecem logo (no topo da página valem mais)
  let n = 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    n++; const tag = m[0];
    const src = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src") || (attr(tag, "srcset") || attr(tag, "data-srcset")).split(",")[0]?.trim().split(/\s+/)[0] || "";
    const hay = `${src} ${attr(tag, "class")} ${attr(tag, "id")} ${attr(tag, "alt")} ${attr(tag, "title")}`.toLowerCase();
    if (!/logo|marca|brand/.test(hay)) continue;
    let sc = 90 - Math.min(30, n * 2);
    if (/logo/.test(src.toLowerCase())) sc += 8;
    if (/\.svg(\?|$)/i.test(src)) sc += 6;
    if (/footer|rodape|white|branc|negativ|parceir|partner|client|selo|cert|payment|pagamento|whats|insta|facebook|google|apple|play/i.test(hay)) sc -= 35;
    add(src, "Imagem do site", sc);
  }
  // 3) <a> com classe logo e imagem de fundo inline
  for (const m of html.matchAll(/class\s*=\s*["'][^"']*logo[^"']*["'][^>]*style\s*=\s*["'][^"']*url\(([^)]+)\)/gi)) add(m[1].replace(/["']/g, ""), "Imagem do site", 70);
  // 4) ícones e imagem de compartilhamento
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0], rel = attr(tag, "rel").toLowerCase(), href = attr(tag, "href"); if (!href) continue;
    const size = Number((attr(tag, "sizes").match(/(\d+)x/) || [])[1] || 0);
    if (rel.includes("apple-touch-icon")) add(href, "Ícone do site", 55 + Math.min(10, size / 20));
    else if (/\bicon\b/.test(rel) || rel.includes("shortcut")) add(href, "Ícone do site", (size >= 96 ? 45 : 25) + (/\.svg/i.test(href) ? 8 : 0));
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0], p = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    if (p === "og:logo") add(attr(tag, "content"), "Marcação do site", 110);
    else if (p === "og:image" || p === "twitter:image") add(attr(tag, "content"), "Imagem de compartilhamento", /logo/i.test(attr(tag, "content")) ? 75 : 35);
    else if (p === "msapplication-tileimage") add(attr(tag, "content"), "Ícone do site", 30);
  }
  add("/favicon.ico", "Ícone do site", 8);
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}
