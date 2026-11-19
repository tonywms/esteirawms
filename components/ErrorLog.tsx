"use client";
// V22 · Erros do sistema (somente o administrador master). Mostra cada falha com código, tela, ação,
// mensagem e detalhe técnico; agrupa repetidos; copia pronto para mandar para correção; marca como resolvido.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, Bug, CheckCircle2, ChevronDown, ClipboardCopy, Copy, Layers, RefreshCw, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { errorText } from "@/lib/report-error";
import { PersonPhoto } from "./PersonPhoto";

type Err = { id: string; at: string; level: "erro" | "aviso"; source: string; page?: string; action?: string; status?: number | null; message: string; detail?: string; context?: Record<string, unknown> | null; userName?: string; userEmail?: string; resolvedAt?: string | null; resolvedBy?: string | null; note?: string | null };
const code = (id: string) => `E-${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
const when = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
const SRC: Record<string, string> = { sistema: "Sistema", upload: "Envio de arquivo", rede: "Rede", tela: "Tela", "zapsign-webhook": "ZapSign (aviso)", navegador: "Navegador" };

export default function ErrorLog() {
  const [list, setList] = useState<Err[] | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [state, setState] = useState<"abertos" | "resolvidos" | "todos">("abertos"), [lvl, setLvl] = useState<"todos" | "erro" | "aviso">("erro"), [q, setQ] = useState("");
  const [group, setGroup] = useState(true), [open, setOpen] = useState<string | null>(null), [sel, setSel] = useState<Set<string>>(new Set()), [flash, setFlash] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { const r = await fetch("/api/errors", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao carregar."); setList(j.errors || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar."); setList([]); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const say = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(""), 2400); };

  const filtered = useMemo(() => (list || []).filter(e => (state === "todos" || (state === "abertos" ? !e.resolvedAt : !!e.resolvedAt)) && (lvl === "todos" || e.level === lvl)
    && (!q || `${e.message} ${e.detail} ${e.action} ${e.page} ${e.userName} ${code(e.id)}`.toLowerCase().includes(q.toLowerCase()))), [list, state, lvl, q]);
  const rows = useMemo(() => {
    if (!group) return filtered.map(e => ({ key: e.id, items: [e] }));
    const m = new Map<string, Err[]>();
    for (const e of filtered) { const k = `${e.level}|${e.action || e.source}|${e.message}`; const a = m.get(k) || []; a.push(e); m.set(k, a); }
    return [...m.entries()].map(([key, items]) => ({ key, items })).sort((a, b) => (a.items[0].at < b.items[0].at ? 1 : -1));
  }, [filtered, group]);
  const all = list || [];
  const openErr = all.filter(e => !e.resolvedAt && e.level === "erro").length, openWarn = all.filter(e => !e.resolvedAt && e.level === "aviso").length;
  const day = all.filter(e => Date.now() - new Date(e.at).getTime() < 864e5).length;

  async function resolve(ids: string[], reopen = false) {
    const r = await fetch("/api/errors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, reopen }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) return say(j.error || "Falha ao salvar.");
    setSel(new Set()); await load(); say(reopen ? "Reaberto" : `${ids.length} marcado${ids.length > 1 ? "s" : ""} como resolvido${ids.length > 1 ? "s" : ""}`);
  }
  const copy = (txt: string, m = "Copiado — cole no chat para correção") => { void navigator.clipboard?.writeText(txt); say(m); };
  const textOf = (items: Err[]) => { const e = items[0]; return `${errorText({ ...e, code: code(e.id) })}${items.length > 1 ? `\nOcorrências: ${items.length} (de ${when(items[items.length - 1].at)} a ${when(e.at)}) · usuários: ${[...new Set(items.map(x => x.userName).filter(Boolean))].join(", ") || "—"}` : ""}`; };

  return <div className="v22">
    <div className="page-header v4-page-header">
      <div className="v4-heading-copy">
        <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  ADMINISTRAÇÃO</div>
        <h1>Erros do sistema</h1>
        <p>Tudo o que falhou para os usuários, com código, tela e detalhe técnico. Visível só para o administrador master.</p>
      </div>
      <div className="header-actions">
        <button className="btn ghost v4-secondary-action" onClick={() => void load()}><RefreshCw size={16} className={busy ? "spin" : ""} /> Atualizar</button>
        <button className="btn primary v4-primary-action" disabled={!filtered.length} onClick={() => copy(rows.slice(0, 30).map(r => textOf(r.items)).join("\n\n———\n\n"), `${Math.min(rows.length, 30)} erro(s) copiado(s) — cole no chat para correção`)}><ClipboardCopy size={16} /> Copiar lista para correção</button>
      </div>
    </div>
    <section className="v22-kpis">
      <div className="v22-kpi red"><span><AlertOctagon size={18} /></span><div><strong>{openErr}</strong><em>Erros em aberto</em></div></div>
      <div className="v22-kpi amber"><span><AlertTriangle size={18} /></span><div><strong>{openWarn}</strong><em>Avisos em aberto (validação)</em></div></div>
      <div className="v22-kpi cyan"><span><Bug size={18} /></span><div><strong>{day}</strong><em>Registrados nas últimas 24 h</em></div></div>
      <div className="v22-kpi green"><span><CheckCircle2 size={18} /></span><div><strong>{all.filter(e => e.resolvedAt).length}</strong><em>Resolvidos</em></div></div>
    </section>
    <div className="v18-toolbar">
      <div className="v17-seg" role="group" aria-label="Situação">{(["abertos", "resolvidos", "todos"] as const).map(k => <button key={k} type="button" className={state === k ? "on" : ""} onClick={() => setState(k)}>{k === "abertos" ? "Em aberto" : k === "resolvidos" ? "Resolvidos" : "Todos"}</button>)}</div>
      <div className="v17-seg" role="group" aria-label="Tipo">{(["erro", "aviso", "todos"] as const).map(k => <button key={k} type="button" className={lvl === k ? "on" : ""} onClick={() => setLvl(k)}>{k === "erro" ? "Erros" : k === "aviso" ? "Avisos" : "Tudo"}</button>)}</div>
      <label className="v21-search v22-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código, mensagem, tela ou usuário" /></label>
      <button type="button" className={`v11-toggle v22-group ${group ? "on" : ""}`} onClick={() => setGroup(v => !v)}><Layers size={15} /> Agrupar iguais</button>
      {sel.size > 0 && <button type="button" className="btn primary v22-bulk" onClick={() => void resolve([...sel])}><CheckCircle2 size={15} /> Resolver {sel.size}</button>}
    </div>
    {flash && <div className="v22-flash">{flash}</div>}
    {error ? <div className="v7-empty"><ShieldAlert /> {error}</div> : list === null ? <div className="v16-skel"><div className="v16-sk" style={{ height: 300 }} /></div> :
      !rows.length ? <div className="v7-empty"><CheckCircle2 /> {state === "abertos" ? "Nenhum erro em aberto. Tudo funcionando." : "Nada por aqui."}</div> :
      <div className="v22-list">{rows.map(({ key, items }) => { const e = items[0], ids = items.map(x => x.id), on = ids.every(i => sel.has(i)), isOpen = open === key;
        return <article key={key} className={`v22-item ${e.level} ${e.resolvedAt ? "done" : ""} ${isOpen ? "open" : ""}`}>
          <header onClick={() => setOpen(isOpen ? null : key)}>
            {!e.resolvedAt && <input type="checkbox" checked={on} onClick={ev => ev.stopPropagation()} onChange={() => setSel(s => { const n = new Set(s); ids.forEach(i => (on ? n.delete(i) : n.add(i))); return n; })} aria-label="Selecionar" />}
            <span className={`lv ${e.level}`}>{e.level === "erro" ? <AlertOctagon size={16} /> : <AlertTriangle size={16} />}</span>
            <div className="v22-main"><b>{e.message}</b>
              <small><code>{code(e.id)}</code> · {e.action || SRC[e.source] || e.source}{e.status ? ` · HTTP ${e.status}` : ""} · {e.page || "—"}</small></div>
            <div className="v22-meta">{items.length > 1 && <em className="count">{items.length}×</em>}<span className="who">{e.userName && <PersonPhoto name={e.userName} size={20} />}{e.userName || "—"}</span><time title={when(e.at)}>{ago(e.at)}</time>{e.resolvedAt && <em className="ok">resolvido</em>}</div>
            <ChevronDown size={16} className="chev" />
          </header>
          {isOpen && <div className="v22-body">
            {e.detail && e.detail !== e.message && <><h4>Detalhe técnico</h4><pre>{e.detail}</pre></>}
            {e.context && Object.keys(e.context).length > 0 && <><h4>Contexto</h4><pre>{JSON.stringify(e.context, null, 2)}</pre></>}
            {items.length > 1 && <><h4>Ocorrências</h4><ul>{items.slice(0, 12).map(x => <li key={x.id}><code>{code(x.id)}</code> {when(x.at)} · {x.userName || "—"} · {x.page || ""}</li>)}{items.length > 12 && <li>+{items.length - 12}</li>}</ul></>}
            {e.resolvedAt && <p className="res">Resolvido por {e.resolvedBy || "—"} em {when(e.resolvedAt)}{e.note ? ` · ${e.note}` : ""}</p>}
            <div className="act">
              <button type="button" className="v7-mini-btn primary" onClick={() => copy(textOf(items))}><Copy size={14} /> Copiar para correção</button>
              {e.resolvedAt ? <button type="button" className="v7-mini-btn" onClick={() => void resolve(ids, true)}><RotateCcw size={14} /> Reabrir</button>
                : <button type="button" className="v7-mini-btn zs" onClick={() => void resolve(ids)}><CheckCircle2 size={14} /> Marcar como resolvido</button>}
            </div>
          </div>}
        </article>; })}</div>}
  </div>;
}
