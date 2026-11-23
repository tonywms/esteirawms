"use client";
// V28 · Checklist de infraestrutura do projeto: marcar OK / Pendente / Não tem / Não se aplica,
// registrar a pendência (tipo, detalhe, responsável, prazo) e validar quando estiver tudo certo.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Clock3, Minus, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import type { InfraCheck, InfraItem, Project, State } from "@/lib/types";
import { BASE_ITEMS, KINDS, STATUS, infraSummary, isOpen, pendText, type Row } from "@/lib/infra";
import { PHASES, phaseOf } from "@/lib/flow";
import { todayISO } from "@/lib/metrics";
import DateField from "./DateField";
import Select from "./Select";
import { PersonPhoto } from "./PersonPhoto";

type Props = { project: Project; data: State; onRefresh: () => Promise<void> | void; notify: (m: string) => void; canWrite?: boolean; compact?: boolean };
const br = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
const ICON: Record<string, typeof Check> = { ok: Check, pend: Clock3, no: AlertTriangle, na: Minus };
const toneOf = (s: string) => STATUS.find(x => x.v === s)?.tone || "none";
const labelOf = (s: string) => STATUS.find(x => x.v === s)?.label || "Não informado";

export default function InfraChecklist({ project: p, data, onRefresh, notify, canWrite = true, compact = false }: Props) {
  const sum = useMemo(() => infraSummary(p), [p]);
  const [edit, setEdit] = useState<Row | "new" | null>(null), [busy, setBusy] = useState(false);
  const [me, setMe] = useState("");
  useEffect(() => { fetch("/api/auth", { cache: "no-store" }).then(r => r.json()).then(j => setMe(j.name || "")).catch(() => {}); }, []);
  const owners = useMemo(() => [...new Set([...data.staff.filter(s => s.active).map(s => s.name), "Cliente", "Time de Implantação", "Dev & Integrações", "ERP Parceiro"])], [data.staff]);
  const today = todayISO();

  async function save(patch: { readiness?: Record<string, string>; infra: InfraCheck }, event: string, ok: string) {
    setBusy(true);
    try {
      const tl = [{ id: crypto.randomUUID(), at: new Date().toISOString(), kind: "infra", author: me || undefined, text: event }, ...(p.timeline || [])];
      const r = await fetch(`/api/records/projects/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, timeline: tl, lastMovement: today }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
      await onRefresh(); notify(ok);
    } catch (e) { notify(`Falha: ${e instanceof Error ? e.message : "não foi possível salvar"}`); throw e; } finally { setBusy(false); }
  }
  async function saveItem(row: Row | null, v: InfraItem & { status: string }) {
    const base = BASE_ITEMS.some(b => b.id === v.id);
    const now = new Date().toISOString();
    const clean: InfraItem = { id: v.id, label: v.label, status: v.status, at: now, by: me || undefined, ...(isOpen(v.status) ? { kind: v.kind || undefined, note: v.note?.trim() || undefined, owner: v.owner || undefined, due: v.due || null } : { note: v.note?.trim() || undefined }) };
    const infra: InfraCheck = { ...(p.infra || {}) };
    let readiness: Record<string, string> | undefined;
    if (base) { readiness = { ...((p.readiness || {}) as unknown as Record<string, string>), [v.id]: v.status }; infra.items = { ...(infra.items || {}), [v.id]: clean }; }
    else { const list = [...(infra.extra || [])]; const i = list.findIndex(x => x.id === v.id); if (i >= 0) list[i] = clean; else list.push(clean); infra.extra = list; }
    // uma pendência nova desfaz a validação
    if (isOpen(v.status) && infra.validatedAt) { infra.validatedAt = null; infra.validatedBy = null; infra.validatedPhase = null; }
    const what = isOpen(v.status) ? `${labelOf(v.status)}${v.kind ? ` · ${v.kind}` : ""}${v.note ? `: ${v.note.trim()}` : ""}${v.owner ? ` · resp. ${v.owner}` : ""}${v.due ? ` até ${br(v.due)}` : ""}` : labelOf(v.status);
    await save({ ...(readiness ? { readiness } : {}), infra }, `Infraestrutura · ${v.label}: ${row && row.status && row.status !== v.status ? `${labelOf(row.status)} → ` : ""}${what}`, `${v.label}: ${labelOf(v.status)}`);
  }
  async function removeExtra(row: Row) {
    const infra: InfraCheck = { ...(p.infra || {}), extra: (p.infra?.extra || []).filter(x => x.id !== row.id) };
    await save({ infra }, `Infraestrutura · item “${row.label}” removido`, `${row.label} removido`);
  }
  async function validate() {
    const ph = phaseOf(p), label = PHASES.find(x => x.key === ph)?.short || ph;
    await save({ infra: { ...(p.infra || {}), validatedAt: new Date().toISOString(), validatedBy: me || "Equipe", validatedPhase: ph } }, `Infraestrutura VALIDADA: tudo ok estruturalmente (${sum.ok.length} itens) · fase ${label}`, "Infraestrutura validada");
  }
  async function reopen() {
    await save({ infra: { ...(p.infra || {}), validatedAt: null, validatedBy: null, validatedPhase: null } }, "Infraestrutura: validação reaberta", "Validação reaberta");
  }

  const st = sum.validated ? "ok" : sum.pending.length ? "pend" : sum.unanswered.length ? "none" : "ready";
  return <div className={`v28 ${compact ? "compact" : ""}`}>
    <header className="v28-head">
      <div><h3><ShieldCheck size={17} /> Checklist de infraestrutura</h3><p>Pode ser validado em qualquer fase — normalmente após o treinamento de endereçamento ou no início do desenvolvimento.</p></div>
      <span className={`v28-state s-${st}`}>{st === "ok" ? <><Check size={13} /> Validada</> : st === "pend" ? <><Clock3 size={13} /> {sum.pending.length} pendência(s)</> : st === "ready" ? <>Pronta para validar</> : <>{sum.unanswered.length} item(ns) sem resposta</>}</span>
    </header>
    {sum.validated && <div className="v28-valid"><ShieldCheck size={16} /><span>Tudo ok estruturalmente · validada por <b>{p.infra?.validatedBy}</b> em {br(p.infra?.validatedAt)}{p.infra?.validatedPhase ? ` (fase ${PHASES.find(x => x.key === p.infra?.validatedPhase)?.short})` : ""}</span>{canWrite && <button type="button" onClick={() => void reopen()} disabled={busy}><RotateCcw size={13} /> Reabrir</button>}</div>}
    <div className="v28-grid">{sum.rows.map(r => { const t = toneOf(r.status), Icon = ICON[t]; const late = isOpen(r.status) && r.due && r.due < today;
      return <button key={r.id} type="button" className={`v28-item t-${t} ${late ? "late" : ""}`} disabled={!canWrite || busy} onClick={() => setEdit(r)} title={canWrite ? "Clique para atualizar" : undefined}>
        <span className="mk">{Icon ? <Icon size={14} /> : <span>·</span>}</span>
        <span className="tx"><b>{r.label}</b><small>{labelOf(r.status)}{isOpen(r.status) && (r.kind || r.note) ? ` · ${[r.kind, r.note].filter(Boolean).join(": ")}` : !isOpen(r.status) && r.note ? ` · ${r.note}` : ""}</small>
          {isOpen(r.status) && (r.owner || r.due) && <small className="who">{r.owner && <><PersonPhoto name={r.owner} size={14} />{r.owner}</>}{r.due && <em className={late ? "late" : ""}>{late ? "venceu" : "até"} {br(r.due)}</em>}</small>}
        </span>
      </button>; })}
      {canWrite && <button type="button" className="v28-item add" onClick={() => setEdit("new")} disabled={busy}><span className="mk"><Plus size={14} /></span><span className="tx"><b>Adicionar item</b><small>Impressora, Wi-Fi, etiquetas…</small></span></button>}
    </div>
    {canWrite && !sum.validated && <div className="v28-foot">
      {sum.pending.length ? <span className="msg pend"><AlertTriangle size={14} /> Pendente: {sum.pending.map(pendText).join(" · ")}</span>
        : sum.unanswered.length ? <span className="msg">Responda todos os itens para validar ({sum.unanswered.map(x => x.label).join(", ")}).</span>
        : <span className="msg ok">Todos os itens ok. Valide para registrar que a infraestrutura está pronta.</span>}
      <button type="button" className="btn primary" disabled={busy || !!sum.pending.length || !!sum.unanswered.length} onClick={() => void validate()}>{busy ? <RefreshCw className="spin" size={14} /> : <ShieldCheck size={14} />} Validar infraestrutura</button>
    </div>}
    {edit && <ItemDialog row={edit === "new" ? null : edit} owners={owners} onClose={() => setEdit(null)} onSave={v => saveItem(edit === "new" ? null : edit, v)} onRemove={edit !== "new" && !edit.base ? () => removeExtra(edit) : undefined} />}
  </div>;
}

function ItemDialog({ row, owners, onClose, onSave, onRemove }: { row: Row | null; owners: string[]; onClose: () => void; onSave: (v: InfraItem & { status: string }) => Promise<void>; onRemove?: () => Promise<void> }) {
  const [label, setLabel] = useState(row?.label || ""), [status, setStatus] = useState(row?.status || "Sim");
  const [kind, setKind] = useState(row?.kind || ""), [note, setNote] = useState(row?.note || ""), [owner, setOwner] = useState(row?.owner || "Cliente"), [due, setDue] = useState(row?.due || "");
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [busy, onClose]);
  const hint = BASE_ITEMS.find(b => b.id === row?.id)?.hint;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!row && label.trim().length < 2) return setErr("Dê um nome ao item (ex.: Impressora de etiquetas).");
    if (isOpen(status) && !kind && note.trim().length < 3) return setErr("Diga qual é a pendência (escolha o tipo ou descreva).");
    setBusy(true); setErr("");
    try { await onSave({ id: row?.id || crypto.randomUUID(), label: row?.label || label.trim(), status, kind, note, owner, due: due || null }); onClose(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Falha ao salvar."); setBusy(false); }
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className="v28-dlg" role="dialog" aria-modal="true" aria-labelledby="v28-dlg-title" onSubmit={e => void submit(e)}>
      <button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button>
      <h2 id="v28-dlg-title">{row ? row.label : "Novo item de infraestrutura"}</h2>
      {hint && <p className="hint">{hint}</p>}
      {!row && <label className="fld"><span>Item</span><input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex.: Impressora de etiquetas, Rede Wi-Fi no armazém" autoFocus /></label>}
      <div className="seg" role="radiogroup" aria-label="Situação">{STATUS.map(s => { const Icon = ICON[s.tone]; return <button key={s.v} type="button" role="radio" aria-checked={status === s.v} className={`t-${s.tone} ${status === s.v ? "on" : ""}`} onClick={() => { if (isOpen(status) !== isOpen(s.v)) { setNote(""); setKind(""); } setStatus(s.v); }}><Icon size={14} />{s.label}</button>; })}</div>
      {isOpen(status) && <div className="pend">
        <span className="lbl">Qual é a pendência?</span>
        <div className="chips">{KINDS.map(k => <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(kind === k ? "" : k)}>{k}</button>)}</div>
        <label className="fld"><span>Detalhe</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: faltam 4 coletores; cliente aguardando orçamento" /></label>
        <div className="grid">
          <label className="fld"><span>Responsável</span><Select value={owner} onChange={e => setOwner(e.target.value)}>{[...new Set([owner, ...owners].filter(Boolean))].map(o => <option key={o}>{o}</option>)}</Select></label>
          <label className="fld"><span>Até quando</span><DateField value={due} onChange={v => setDue(v)} aria-label="Até quando" /></label>
        </div>
      </div>}
      {!isOpen(status) && <label className="fld"><span>Observação (opcional)</span><input value={note} onChange={e => setNote(e.target.value)} placeholder={status === "Sim" ? "Ex.: 6 coletores Zebra configurados" : ""} /></label>}
      {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      <div className="act">
        {onRemove && <button type="button" className="btn outline danger" disabled={busy} onClick={async () => { setBusy(true); try { await onRemove(); onClose(); } catch { setBusy(false); } }}><Trash2 size={14} /> Remover item</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn outline" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? <RefreshCw className="spin" size={14} /> : <Check size={14} />} Salvar</button>
      </div>
    </form>
  </div>, document.body);
}
