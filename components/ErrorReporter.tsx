"use client";
// V22 · Vigia as chamadas do sistema: quando algo falha, registra o erro (com código) para o administrador
// e mostra um aviso com o código e o botão "Copiar detalhes" — pronto para mandar para correção.
// Erros de validação (4xx) são registrados como "aviso", sem aviso na tela (a própria tela já mostra a mensagem).
import { useEffect, useState } from "react";
import { AlertOctagon, Copy, X } from "lucide-react";
import { errorText, reportError, setOrigFetch, type Reported } from "@/lib/report-error";

const SKIP = /^\/api\/(errors|avatar|auth)\b/;
const pathOf = (u: string) => { try { const x = new URL(u, window.location.origin); return x.origin === window.location.origin ? x.pathname : `${x.host}${x.pathname}`; } catch { return u.split("?")[0]; } };
function bodySummary(b: unknown) {
  if (typeof b !== "string") return b instanceof FormData ? "[formulário]" : b ? "[arquivo]" : undefined;
  try { return JSON.parse(b); } catch { return b.slice(0, 300); }
}
const recent = new Map<string, number>();
const seenRecently = (k: string) => { const t = recent.get(k) || 0, now = Date.now(); recent.set(k, now); return now - t < 30_000; };

export default function ErrorReporter() {
  const [notice, setNotice] = useState<Reported | null>(null), [copied, setCopied] = useState(false);
  useEffect(() => {
    const w = window as unknown as { __v22?: boolean };
    const onReport = (e: Event) => { setNotice((e as CustomEvent<Reported>).detail); setCopied(false); };
    window.addEventListener("v22-error", onReport);
    if (!w.__v22) {
      w.__v22 = true;
      const orig = window.fetch.bind(window); setOrigFetch(orig);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = (init?.method || (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
        const path = pathOf(url);
        try {
          const res = await orig(input, init);
          if (!res.ok && path.startsWith("/api/") && !SKIP.test(path) && res.status !== 401) {
            res.clone().json().catch(() => ({})).then((j: { error?: string; detail?: string }) => {
              const message = j.error || `${res.status} ${res.statusText}`;
              if (seenRecently(`${method}${path}${message}`)) return;
              void reportError({ message, detail: j.detail, action: `${method} ${path}`, status: res.status, source: "sistema", context: { pedido: bodySummary(init?.body) } }, res.status >= 500);
            });
          }
          return res;
        } catch (err) {
          if (path.startsWith("/api/") && !SKIP.test(path) && !seenRecently(`${method}${path}net`)) void reportError({ message: "Sem conexão com o servidor (falha de rede)", detail: err instanceof Error ? err.message : String(err), action: `${method} ${path}`, status: 0, source: "rede" });
          throw err;
        }
      };
      // Envio de arquivos (PDF, fotos) usa XMLHttpRequest direto para o armazenamento
      const send = XMLHttpRequest.prototype.send, open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __v22?: string }, m: string, u: string | URL, ...rest: unknown[]) { this.__v22 = `${m.toUpperCase()} ${pathOf(String(u))}`; return (open as (...a: unknown[]) => void).call(this, m, u, ...rest); } as typeof XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __v22?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
        this.addEventListener("loadend", () => {
          if (this.status >= 400 || this.status === 0) {
            const action = this.__v22 || "envio de arquivo";
            if (seenRecently(action + this.status)) return;
            void reportError({ message: this.status ? `Falha no envio de arquivo (HTTP ${this.status})` : "Falha de rede no envio de arquivo", detail: (this.responseText || "").slice(0, 800), action, status: this.status, source: "upload", context: { tamanho: body instanceof Blob ? body.size : undefined, tipo: body instanceof Blob ? body.type : undefined } }, true);
          }
        });
        return send.call(this, body);
      };
      window.addEventListener("error", e => { if (!e.message || /ResizeObserver/.test(e.message) || seenRecently(e.message)) return; void reportError({ message: `Erro na tela: ${e.message}`, detail: `${e.filename || ""}:${e.lineno || ""}:${e.colno || ""}\n${(e.error as Error | undefined)?.stack?.slice(0, 1500) || ""}`, source: "tela" }, true); });
      window.addEventListener("unhandledrejection", e => { const r = e.reason as Error | undefined; const m = r?.message || String(e.reason); if (!m || /AbortError|Load failed|Failed to fetch/i.test(m) || seenRecently(m)) return; void reportError({ message: `Erro na tela: ${m}`, detail: r?.stack?.slice(0, 1500), source: "tela" }, true); });
    }
    return () => window.removeEventListener("v22-error", onReport);
  }, []);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 20000); return () => window.clearTimeout(t); }, [notice]);
  if (!notice) return null;
  return <div className="v22-notice" role="alert">
    <span className="ic"><AlertOctagon size={18} /></span>
    <div className="txt"><b>Algo deu errado · código {notice.code}</b><span>{notice.message}</span><small>O erro foi registrado para o administrador. Copie os detalhes se quiser mandar para correção.</small></div>
    <div className="act">
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(errorText(notice)); setCopied(true); }}><Copy size={13} /> {copied ? "Copiado" : "Copiar detalhes"}</button>
      <button type="button" className="x" onClick={() => setNotice(null)} aria-label="Fechar"><X size={14} /></button>
    </div>
  </div>;
}
