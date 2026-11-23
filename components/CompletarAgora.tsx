"use client";
// V24 · "Completar agora": define a próxima ação de vários projetos de uma vez, sem abrir card por card.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, RefreshCw, Save, Target, X } from "lucide-react";
import type { ProjectHeat } from "@/lib/gargalos";
import type { State } from "@/lib/types";
import { PHASES } from "@/lib/flow";
import DateField from "./DateField";
import { plusBusinessDays } from "./NextActionDialog";
import { PersonPhoto } from "./PersonPhoto";

type Row = { text: string; owner: string; due: string; state: "" | "saving" | "ok" | "err"; error?: string };

export default function CompletarAgora({ data, list: initial, onClose, onSaved }: { data: State; list: ProjectHeat[]; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [mounted, setMounted] = useState(false), [busy, setBusy] = useState(false);
  const [list] = useState(initial); // a lista fica fixa enquanto o editor está aberto (os salvos ficam marcados)
  const owners = useMemo(() => [...new Set([...data.staff.filter(s => s.active).map(s => s.name), "Time de Implantação", "Dev & Integrações", "Cliente", "ERP Parceiro"])], [data.staff]);
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(list.map(h => [h.p.id, { text: "", owner: h.owner, due: plusBusinessDays(3), state: "" }])));
  useEffect(() => { setMounted(true); const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [busy, onClose]);
  const set = (id: string, v: Partial<Row>) => setRows(r => ({ ...r, [id]: { ...r[id], ...v } }));
  const filled = list.filter(h => rows[h.p.id]?.text.trim().length >= 4 && rows[h.p.id].state !== "ok");
  const done = list.filter(h => rows[h.p.id]?.state === "ok").length;

  async function saveOne(h: ProjectHeat) {
    const r = rows[h.p.id]; set(h.p.id, { state: "saving", error: "" });
    const text = `Próxima ação: ${r.text.trim()} (${r.owner}${r.due ? `, até ${r.due.split("-").reverse().join("/")}` : ""})`;
    const timeline = [{ id: crypto.randomUUID(), at: new Date().toISOString(), text, kind: "nota" }, ...(h.p.timeline || [])];
    const res = await fetch(`/api/records/projects/${h.p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nextAction: r.text.trim(), nextActionOwner: r.owner, nextActionDue: r.due || null, timeline }) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); set(h.p.id, { state: "err", error: j.error || "Falha ao salvar" }); return false; }
    set(h.p.id, { state: "ok" }); return true;
  }
  async function saveAll() {
    if (!filled.length) return;
    setBusy(true);
    for (const h of filled) await saveOne(h);
    setBusy(false);
    await onSaved();
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v24-bulk" role="dialog" aria-modal="true" aria-labelledby="v24-bulk-title">
      <header><div><h2 id="v24-bulk-title"><Target size={18} /> Completar próximas ações</h2><p>{list.length} projeto(s) sem próxima ação. Preencha os que você já sabe e salve tudo de uma vez — os vazios ficam para depois.</p></div>
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="v24-bulk-list">
        {list.map(h => { const r = rows[h.p.id]; return <div key={h.p.id} className={`v24-bulk-row s-${r.state || "idle"}`}>
          <div className="who"><b>{h.client}</b><small>{PHASES.find(x => x.key === h.phase)?.short} · <PersonPhoto name={h.owner} size={16} /> {h.owner}</small></div>
          <input className="txt" value={r.text} onChange={e => set(h.p.id, { text: e.target.value, state: r.state === "ok" ? "ok" : "" })} disabled={busy || r.state === "ok"} placeholder="O que precisa acontecer?" aria-label={`Próxima ação de ${h.client}`} />
          <select value={r.owner} onChange={e => set(h.p.id, { owner: e.target.value })} disabled={busy || r.state === "ok"} aria-label="Responsável">{[...new Set([h.owner, ...owners])].map(o => <option key={o}>{o}</option>)}</select>
          <DateField value={r.due} onChange={v => set(h.p.id, { due: v })} aria-label="Até quando" />
          <span className="st">{r.state === "ok" ? <CheckCircle2 size={16} /> : r.state === "saving" ? <RefreshCw className="spin" size={15} /> : r.state === "err" ? <em title={r.error}>!</em> : null}</span>
          {r.state === "err" && <div className="err">{r.error}</div>}
        </div>; })}
      </div>
      <footer><span>{done ? `${done} salvo(s)` : `${filled.length} preenchido(s)`}</span>
        <button type="button" className="btn outline" onClick={onClose} disabled={busy}>Fechar</button>
        <button type="button" className="btn primary" onClick={() => void saveAll()} disabled={busy || !filled.length}>{busy ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}Salvar {filled.length || ""}</button></footer>
    </div>
  </div>, document.body);
}
