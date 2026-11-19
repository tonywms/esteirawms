"use client";
// V22 · Envia um erro para o registro do sistema e devolve o código (ex.: E-7F3A2C) para mostrar ao usuário.
export type ReportInput = { message: string; detail?: string; action?: string; status?: number | null; level?: "erro" | "aviso"; source?: string; context?: Record<string, unknown> };
export type Reported = ReportInput & { code: string; at: string; page: string };
let origFetch: typeof fetch | null = null;
export const setOrigFetch = (f: typeof fetch) => { origFetch = f; };

export async function reportError(e: ReportInput, notify = true): Promise<Reported | null> {
  const page = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
  try {
    const f = origFetch || fetch;
    const r = await f("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...e, page }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) return null;
    const rep: Reported = { ...e, code: j.code, at: new Date().toISOString(), page };
    if (notify && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("v22-error", { detail: rep }));
    return rep;
  } catch { return null; }
}

/** Texto pronto para colar no chat com o Claude ou mandar ao suporte. */
export function errorText(x: { code?: string; at?: string; page?: string; action?: string; status?: number | null; message: string; detail?: string; userName?: string; context?: unknown }) {
  return [
    `Erro ${x.code || ""} · Esteira WMS Expert`,
    `Quando: ${x.at ? new Date(x.at).toLocaleString("pt-BR") : "agora"}${x.userName ? ` · Usuário: ${x.userName}` : ""}`,
    x.page ? `Tela: ${x.page}` : "",
    x.action ? `Ação: ${x.action}${x.status ? ` (HTTP ${x.status})` : ""}` : "",
    `Mensagem: ${x.message}`,
    x.detail && x.detail !== x.message ? `Detalhe técnico: ${x.detail}` : "",
    x.context && Object.keys(x.context as object).length ? `Contexto: ${JSON.stringify(x.context).slice(0, 1500)}` : "",
  ].filter(Boolean).join("\n");
}
