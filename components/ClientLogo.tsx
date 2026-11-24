"use client";
// V32 · Logo do cliente: aparece onde o nome do cliente aparece; busca no site da empresa ou envio do arquivo.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Globe, ImagePlus, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { Client, State } from "@/lib/types";
import { clientDomains, cleanDomain, loadImage, logoUrl, normalizeLogo, registerLogos, type LogoEntry } from "@/lib/logos";

const initials = (name: string) => name.split(/\s+/).filter(w => w.length > 2 || /^[A-Z0-9]/.test(w)).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";

/** Logo do cliente numa caixinha branca. Sem logo: nada (ou as iniciais, se fallback). */
export function ClientLogo({ clientId, name, size = 22, wide = false, fallback = false, className = "" }: { clientId?: string | null; name?: string; size?: number; wide?: boolean; fallback?: boolean; className?: string }) {
  const url = logoUrl(clientId);
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [url]);
  const w = wide ? Math.round(size * 2.2) : size;
  if (!url || bad) return fallback ? <span className={`v32-logo ini ${className}`} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }} aria-hidden>{initials(name || "?")}</span> : null;
  return <span className={`v32-logo ${wide ? "wide" : ""} ${className}`} style={{ width: w, height: size }}><img src={url} alt={name ? `Logo ${name}` : ""} loading="lazy" onError={() => setBad(true)} /></span>;
}

type Cand = { url: string; source: string; score: number; domain?: string };
type Found = { domains: string[]; results: { domain: string; site: string; candidates: Cand[]; error?: string }[]; error?: string };
const viaApp = (u: string) => u.startsWith("data:") ? u : `/api/logo/imagem?url=${encodeURIComponent(u)}`;

async function search(clientId: string, site?: string): Promise<{ cands: Cand[]; msg: string; domains: string[] }> {
  const q = site ? `site=${encodeURIComponent(site)}` : `cliente=${encodeURIComponent(clientId)}`;
  const r = await fetch(`/api/logo/buscar?${q}`, { cache: "no-store" }); const j = await r.json().catch(() => ({})) as Found & { error?: string };
  if (!r.ok) throw new Error(j.error || "Falha na busca.");
  const cands = (j.results || []).flatMap(x => x.candidates.map(c => ({ ...c, domain: x.domain }))).sort((a, b) => b.score - a.score);
  const errs = (j.results || []).filter(x => x.error).map(x => x.error!);
  return { cands, domains: j.domains || [], msg: j.error || (!cands.length ? (errs.join(" ") || "Nenhuma imagem de logo encontrada no site.") : "") };
}
async function save(clientId: string, data: string, source: string) {
  const r = await fetch("/api/logo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, data, source }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar o logo.");
  return j.logos as LogoEntry[];
}

/** Janela do logo de um cliente: buscar no site, enviar arquivo, remover. */
export function LogoDialog({ client, clients, onClose, onSaved }: { client: Client; clients?: Client[]; onClose: () => void; onSaved: (msg: string) => void | Promise<void> }) {
  const doms = useMemo(() => clientDomains(client), [client]);
  const [site, setSite] = useState(doms[0] || ""), [cands, setCands] = useState<Cand[] | null>(null), [msg, setMsg] = useState("");
  const [sel, setSel] = useState<{ data: string; source: string } | null>(null), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [mounted, setMounted] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const pick = useRef<HTMLInputElement>(null);
  const current = logoUrl(client.id);
  useEffect(() => { setMounted(true); const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [busy, onClose]);

  async function find(typed?: string) {
    setBusy("Procurando no site…"); setErr(""); setMsg(""); setCands(null); setSel(null); setBroken(new Set());
    try { const r = await search(client.id, typed); setCands(r.cands); setMsg(r.msg); }
    catch (e) { setErr(e instanceof Error ? e.message : "Falha na busca."); }
    setBusy("");
  }
  async function choose(c: Cand) {
    setErr(""); setBusy("Preparando…");
    try { const img = await loadImage(viaApp(c.url)); setSel({ data: normalizeLogo(img), source: `site ${c.domain || ""}`.trim() }); }
    catch { setErr("Não consegui usar esta imagem. Escolha outra ou envie o arquivo."); setBroken(b => new Set(b).add(c.url)); }
    setBusy("");
  }
  function file(f?: File | null) {
    if (!f) return; if (!f.type.startsWith("image/")) return setErr("Escolha uma imagem (PNG, JPG ou SVG).");
    setErr(""); const u = URL.createObjectURL(f);
    loadImage(u).then(img => setSel({ data: normalizeLogo(img), source: "arquivo enviado" })).catch(() => setErr("Não foi possível ler esta imagem.")).finally(() => URL.revokeObjectURL(u));
  }
  async function confirm() {
    if (!sel) return; setBusy("Salvando…"); setErr("");
    try { registerLogos(await save(client.id, sel.data, sel.source), clients); await onSaved(`Logo de ${client.name} salvo em todas as telas`); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Falha ao salvar."); setBusy(""); }
  }
  async function remove() {
    setBusy("Removendo…"); setErr("");
    try {
      const r = await fetch("/api/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao remover.");
      registerLogos(j.logos, clients); await onSaved(`Logo de ${client.name} removido`); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Falha ao remover."); setBusy(""); }
  }
  if (!mounted) return null;
  const shown = (cands || []).filter(c => !broken.has(c.url));
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v32-dlg" role="dialog" aria-modal="true" aria-labelledby="v32-dlg-t">
      <header><h2 id="v32-dlg-t"><ImagePlus size={18} /> Logo · {client.name}</h2><button type="button" className="p6-confirm-x" onClick={onClose} disabled={!!busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <p className="lead">Aparece na esteira, TV, linha do tempo, Raio-X, previsão, ficha do cliente, no PDF do cronograma e na capa do Escopo em Word.</p>
        <div className="prev">
          <div className="box light">{sel ? <img src={sel.data} alt="" /> : current ? <img src={current} alt="" /> : <span className="none">Sem logo</span>}</div>
          <div className="box dark">{sel ? <span className="chip"><img src={sel.data} alt="" /></span> : current ? <span className="chip"><img src={current} alt="" /></span> : <span className="none">Como fica na TV</span>}</div>
        </div>
        <form className="site" onSubmit={e => { e.preventDefault(); const d = cleanDomain(site); if (!d) return setErr("Digite um site válido (ex.: empresa.com.br)."); void find(d); }}>
          <label><Globe size={15} /><input value={site} onChange={e => setSite(e.target.value)} placeholder="site da empresa (ex.: empresa.com.br)" aria-label="Site da empresa" /></label>
          <button type="submit" className="btn outline small" disabled={!!busy}><Search size={14} /> Buscar no site</button>
          {doms.length > 1 && <button type="button" className="btn outline small" disabled={!!busy} onClick={() => void find()} title={doms.join(", ")}>Todos os domínios ({doms.length})</button>}
        </form>
        {!doms.length && !cands && <p className="hint">Este cliente não tem site nem e-mail com domínio próprio cadastrado. Digite o site acima ou envie o arquivo do logo.</p>}
        {busy && <p className="hint"><RefreshCw size={13} className="spin" /> {busy}</p>}
        {msg && <p className="hint warn">{msg}</p>}
        {shown.length > 0 && <div className="grid">{shown.map(c => <button key={c.url} type="button" onClick={() => void choose(c)} title={`${c.source} · ${c.url.slice(0, 140)}`} disabled={!!busy}>
          <img src={viaApp(c.url)} alt="" onError={() => setBroken(b => new Set(b).add(c.url))} /><small>{c.source}</small></button>)}</div>}
        {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      </div>
      <footer>
        <button type="button" className="btn outline small" onClick={() => pick.current?.click()} disabled={!!busy}><ImagePlus size={14} /> Enviar arquivo</button>
        {current && !sel && <button type="button" className="btn outline small danger" onClick={() => void remove()} disabled={!!busy}><Trash2 size={14} /> Remover</button>}
        <span className="sp" />
        <button type="button" className="btn outline" onClick={onClose} disabled={!!busy}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void confirm()} disabled={!!busy || !sel}><Check size={15} /> Salvar logo</button>
      </footer>
      <input ref={pick} type="file" accept="image/*,.svg" hidden onChange={e => { file(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  </div>, document.body);
}

type Row = { c: Client; doms: string[]; st: "fila" | "buscando" | "ok" | "nada" | "erro" | "salvo"; cands: Cand[]; i: number; msg?: string; on: boolean };

/** Busca dos logos de vários clientes de uma vez, com revisão antes de salvar. */
export function LogoBulk({ data, onClose, onSaved }: { data: State; onClose: () => void; onSaved: (msg: string) => void | Promise<void> }) {
  const ids = useMemo(() => new Set(data.projects.filter(p => !p.archivedAt).map(p => p.clientId)), [data]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const base = useMemo(() => data.clients.filter(c => ids.has(c.id)).map(c => ({ c, doms: clientDomains(c) })).sort((a, b) => a.c.name.localeCompare(b.c.name)), [data, ids]);
  const [rows, setRows] = useState<Row[]>([]), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [mounted, setMounted] = useState(false), [broken, setBroken] = useState<Set<string>>(new Set());
  const stop = useRef(false);
  useEffect(() => { setMounted(true); return () => { stop.current = true; }; }, []);
  useEffect(() => { if (!busy) setRows(base.filter(x => x.doms.length && (!onlyMissing || !logoUrl(x.c.id))).map(x => ({ ...x, st: "fila", cands: [], i: 0, on: false }))); }, [base, onlyMissing]); // eslint-disable-line react-hooks/exhaustive-deps
  const noSite = base.filter(x => !x.doms.length && (!onlyMissing || !logoUrl(x.c.id))).length;
  const upd = (id: string, f: (r: Row) => Row) => setRows(rs => rs.map(r => r.c.id === id ? f(r) : r));

  async function runAll() {
    setBusy("Procurando nos sites…"); setErr(""); stop.current = false;
    const queue = rows.filter(r => r.st === "fila" || r.st === "erro").map(r => r.c.id);
    const worker = async () => { for (;;) { const id = queue.shift(); if (!id || stop.current) return; upd(id, r => ({ ...r, st: "buscando" }));
      try { const r = await search(id); upd(id, x => ({ ...x, cands: r.cands, i: 0, st: r.cands.length ? "ok" : "nada", msg: r.msg, on: r.cands.length > 0 && r.cands[0].score >= 60 })); }
      catch (e) { upd(id, x => ({ ...x, st: "erro", msg: e instanceof Error ? e.message : "Falha" })); } } };
    await Promise.all([worker(), worker(), worker()]);
    setBusy("");
  }
  async function saveSel() {
    const sel = rows.filter(r => r.on && curOf(r)); if (!sel.length) return setErr("Marque ao menos um logo para salvar.");
    setBusy(`Salvando 0 de ${sel.length}…`); setErr(""); let ok = 0, fail = 0, last: LogoEntry[] | null = null;
    for (const r of sel) {
      try { const c = curOf(r)!; const img = await loadImage(viaApp(c.url)); last = await save(r.c.id, normalizeLogo(img), `site ${c.domain || ""}`.trim()); ok++; upd(r.c.id, x => ({ ...x, st: "salvo", on: false })); }
      catch (e) { fail++; upd(r.c.id, x => ({ ...x, msg: e instanceof Error ? e.message : "Falha ao salvar", on: false })); }
      setBusy(`Salvando ${ok + fail} de ${sel.length}…`);
    }
    if (last) registerLogos(last, data.clients);
    setBusy(""); await onSaved(`${ok} logo(s) salvo(s)${fail ? ` · ${fail} com falha` : ""}`);
  }
  const visible = (r: Row) => r.cands.filter(c => !broken.has(c.url));
  const curOf = (r: Row) => r.cands[r.i] && !broken.has(r.cands[r.i].url) ? r.cands[r.i] : visible(r)[0];
  if (!mounted) return null;
  const marked = rows.filter(r => r.on).length, searched = rows.some(r => r.st !== "fila");
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v32-dlg bulk" role="dialog" aria-modal="true" aria-labelledby="v32-bulk-t">
      <header><h2 id="v32-bulk-t"><ImagePlus size={18} /> Logos dos clientes</h2><button type="button" className="p6-confirm-x" onClick={onClose} disabled={!!busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <p className="lead">Procura o logo no site de cada cliente (pelo site cadastrado ou pelo domínio dos e-mails). Confira, troque com as setas e marque os que estão certos. Nada é salvo sem a sua marcação.</p>
        <div className="bar">
          <label className="ck"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} disabled={!!busy} /> Só clientes sem logo</label>
          <span>{rows.length} com site · {noSite} sem site (enviar arquivo na ficha do cliente)</span>
        </div>
        {busy && <p className="hint"><RefreshCw size={13} className="spin" /> {busy}</p>}
        <div className="list">{rows.map(r => { const vs = visible(r), cur = curOf(r);
          return <div key={r.c.id} className={`it st-${r.st} ${r.on ? "on" : ""}`}>
            <label className="ck"><input type="checkbox" checked={r.on} disabled={!cur || !!busy || r.st === "salvo"} onChange={e => upd(r.c.id, x => ({ ...x, on: e.target.checked, i: x.cands.indexOf(cur) }))} aria-label={`Usar o logo de ${r.c.name}`} /></label>
            <div className="nm"><b>{r.c.name}</b><small>{r.doms.join(" · ")}</small></div>
            <div className="pic">{r.st === "buscando" ? <RefreshCw size={16} className="spin" /> : r.st === "salvo" ? <span className="ok"><Check size={15} /> salvo</span>
              : cur ? <><button type="button" className="nav" disabled={vs.length < 2 || !!busy} onClick={() => upd(r.c.id, x => { const j = (vs.indexOf(cur) - 1 + vs.length) % vs.length; return { ...x, i: x.cands.indexOf(vs[j]) }; })} aria-label="Anterior"><ChevronLeft size={15} /></button>
                <span className="img" title={`${cur.source} · ${cur.url.slice(0, 120)}`}><img src={viaApp(cur.url)} alt="" onError={() => setBroken(b => new Set(b).add(cur.url))} /></span>
                <button type="button" className="nav" disabled={vs.length < 2 || !!busy} onClick={() => upd(r.c.id, x => { const j = (vs.indexOf(cur) + 1) % vs.length; return { ...x, i: x.cands.indexOf(vs[j]) }; })} aria-label="Próximo"><ChevronRight size={15} /></button>
                <small>{vs.indexOf(cur) + 1}/{vs.length} · {cur.source}</small></>
              : <small className="muted">{r.st === "fila" ? "aguardando busca" : r.msg || "nenhum logo encontrado"}</small>}</div>
          </div>; })}
          {!rows.length && <p className="hint">Nenhum cliente {onlyMissing ? "sem logo " : ""}com site ou e-mail de domínio próprio.</p>}</div>
        {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      </div>
      <footer>
        <button type="button" className="btn outline" onClick={() => void runAll()} disabled={!!busy || !rows.some(r => r.st === "fila" || r.st === "erro")}><Search size={15} /> {searched ? "Buscar os que faltam" : `Buscar ${rows.length} site(s)`}</button>
        <span className="sp" />
        <button type="button" className="btn outline" onClick={onClose} disabled={!!busy}>Fechar</button>
        <button type="button" className="btn primary" onClick={() => void saveSel()} disabled={!!busy || !marked}><Check size={15} /> Salvar {marked || ""} marcado(s)</button>
      </footer>
    </div>
  </div>, document.body);
}
