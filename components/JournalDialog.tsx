"use client";
// V31 · Diário do dia: o que o consultor fez no cliente, se avançou, parou (e por quê) — e já marca
// a atividade correspondente do Cronograma de implantação como concluída.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, CircleCheck, CircleDot, RefreshCw, Trash2, X } from "lucide-react";
import type { JournalEntry, Project, ScheduleRow, State } from "@/lib/types";
import { scheduleOf, brDate } from "@/lib/schedule";
import { isRealPerson } from "@/lib/timeline";
import DateField from "./DateField";
import Select from "./Select";

export type JournalTarget = { projectId?: string; person?: string; date?: string; entry?: JournalEntry & { projectId: string } };
const QUICK = ["Endereçamento", "Mapeamento", "Acomp. endereçamento", "Recebimento e armazenamento", "Expedição / conferência / embarque", "Treinamento de cadastros", "Homologação", "Inventário", "Reunião com o cliente", "Integração / testes", "Acompanhamento remoto"];
const BY = ["Cliente", "WMS Expert", "ERP parceiro", "Infraestrutura", "Outro"];

export default function JournalDialog({ data, target, me, onClose, onSaved }: { data: State; target: JournalTarget; me: string; onClose: () => void; onSaved: (msg: string) => Promise<void> | void }) {
  const e0 = target.entry;
  const [projectId, setProjectId] = useState(e0?.projectId || target.projectId || "");
  const [person, setPerson] = useState(e0?.person || target.person || me || "");
  const [date, setDate] = useState(e0?.date || target.date || new Date().toISOString().slice(0, 10));
  const [text, setText] = useState(e0?.text || ""), [status, setStatus] = useState<JournalEntry["status"]>(e0?.status || "ok");
  const [reason, setReason] = useState(e0?.reason || ""), [blockedBy, setBlockedBy] = useState(e0?.blockedBy || "Cliente");
  const [doneRows, setDoneRows] = useState<string[]>(e0?.rowId ? [e0.rowId] : []);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [busy, onClose]);
  const projects = useMemo(() => data.projects.filter(p => !p.archivedAt).map(p => ({ p, name: data.clients.find(c => c.id === p.clientId)?.name || p.name })).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const people = useMemo(() => [...new Set([...data.staff.filter(s => s.active !== false).map(s => s.name), ...data.users.filter(u => u.active && u.role !== "Painel").map(u => u.name)].filter(isRealPerson))].sort((a, b) => a.localeCompare(b)), [data]);
  const project: Project | undefined = data.projects.find(p => p.id === projectId);
  const rows: ScheduleRow[] = project?.schedule?.rows?.length ? scheduleOf(project.schedule).rows.filter(r => (r.start || r.end) && (r.start || r.end)! <= date && (r.end || r.start)! >= date) : [];

  async function save(del = false) {
    if (!project) return setErr("Escolha o cliente / projeto.");
    if (!del && text.trim().length < 3) return setErr("Escreva o que foi feito no dia.");
    if (!del && status !== "ok" && reason.trim().length < 3) return setErr("Conte o motivo / a objeção que fez parar.");
    setBusy(true); setErr("");
    try {
      const now = new Date().toISOString();
      const entry: JournalEntry = { id: e0?.id || crypto.randomUUID(), date, person, text: text.trim(), status, reason: status !== "ok" ? reason.trim() : undefined, blockedBy: status !== "ok" ? blockedBy : undefined, rowId: doneRows[0] || null, at: now, by: me || undefined };
      // se mudou de projeto ao editar, remove do anterior
      if (e0 && e0.projectId !== projectId) {
        const old = data.projects.find(p => p.id === e0.projectId);
        if (old) await fetch(`/api/records/projects/${old.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journal: (Array.isArray(old.journal) ? old.journal : []).filter(x => x.id !== e0.id) }) });
      }
      const list = (Array.isArray(project.journal) ? project.journal : []).filter(x => x.id !== entry.id);
      const journal = del ? list : [...list, entry].sort((a, b) => a.date.localeCompare(b.date));
      const body: Record<string, unknown> = { journal };
      if (!del && doneRows.length && project.schedule?.rows?.length) body.schedule = { ...project.schedule, rows: project.schedule.rows.map(r => doneRows.includes(r.id) ? { ...r, done: true } : r), updatedAt: now, updatedBy: me || undefined };
      if (!del) {
        const icon = status === "ok" ? "✔" : status === "parcial" ? "◐" : "⛔";
        body.timeline = [{ id: crypto.randomUUID(), at: now, kind: status === "parado" ? "bloqueio" : "nota", author: me || undefined, text: `${icon} ${brDate(date)} · ${person}: ${entry.text}${entry.reason ? ` — parou: ${entry.reason} (${entry.blockedBy})` : ""}` }, ...(project.timeline || [])];
        if (status !== "parado") body.lastMovement = date > (project.lastMovement || "") ? date : project.lastMovement;
      }
      const r = await fetch(`/api/records/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
      await onSaved(del ? "Registro removido" : `Dia ${brDate(date)} registrado${doneRows.length ? ` · ${doneRows.length} atividade(s) do cronograma concluída(s)` : ""}`);
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Falha ao salvar."); setBusy(false); }
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className="v31-dlg" role="dialog" aria-modal="true" aria-labelledby="v31-dlg-t" onSubmit={e => { e.preventDefault(); void save(); }}>
      <header><h2 id="v31-dlg-t">{e0 ? "Editar registro do dia" : "Registrar o dia"}</h2><p>O que foi feito no cliente — aparece na linha do tempo, na TV e no Excel.</p>
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <div className="grid3">
          <label><span>Cliente / projeto</span><Select value={projectId} onChange={e => { setProjectId(e.target.value); setDoneRows([]); }}><option value="">Escolha…</option>{projects.map(x => <option key={x.p.id} value={x.p.id}>{x.name}</option>)}</Select></label>
          <label><span>Quem</span><Select value={person} onChange={e => setPerson(e.target.value)}>{[...new Set([person, ...people].filter(Boolean))].map(n => <option key={n}>{n}</option>)}</Select></label>
          <label><span>Dia</span><DateField value={date} onChange={v => { setDate(v); setDoneRows([]); }} aria-label="Dia" /></label>
        </div>
        <label><span>O que foi feito</span><input value={text} onChange={e => setText(e.target.value)} placeholder="Ex.: Recebimento e armazenamento com a equipe do turno da manhã" autoFocus /></label>
        <div className="chips">{QUICK.map(q => <button key={q} type="button" className={text === q ? "on" : ""} onClick={() => setText(q)}>{q}</button>)}</div>
        <div className="st" role="radiogroup" aria-label="Como foi">
          {([["ok", "Avançou", CircleCheck], ["parcial", "Parcial", CircleDot], ["parado", "Parou", CircleAlert]] as const).map(([v, l, I]) => <button key={v} type="button" role="radio" aria-checked={status === v} className={`s-${v} ${status === v ? "on" : ""}`} onClick={() => setStatus(v)}><I size={16} /> {l}</button>)}
        </div>
        {status !== "ok" && <div className="stop">
          <label><span>Motivo / objeção</span><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: cliente sem coletores carregados; gerente pediu para adiar a expedição" /></label>
          <div className="by"><span>Travou por</span>{BY.map(b => <button key={b} type="button" className={blockedBy === b ? "on" : ""} onClick={() => setBlockedBy(b)}>{b}</button>)}</div>
        </div>}
        {project && <div className="sync">
          <span className="lbl">Cronograma de implantação · atividades deste dia</span>
          {rows.length ? rows.map(r => <label key={r.id} className={`row ${r.done ? "done" : ""}`}><input type="checkbox" checked={r.done || doneRows.includes(r.id)} disabled={r.done} onChange={e => setDoneRows(d => e.target.checked ? [...d, r.id] : d.filter(x => x !== r.id))} /><b>{r.activity}</b><small>{r.phase} · {brDate(r.start)}{r.end && r.end !== r.start ? ` a ${brDate(r.end)}` : ""}{r.done ? " · já concluída" : ""}</small></label>)
            : <small className="none">{project.schedule?.rows?.length ? "Nenhuma atividade do cronograma neste dia." : "Este projeto ainda não tem cronograma com datas."}</small>}
        </div>}
      </div>
      {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      <footer>
        {e0 && <button type="button" className="btn outline danger" disabled={busy} onClick={() => void save(true)}><Trash2 size={14} /> Remover</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn outline" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? <RefreshCw className="spin" size={14} /> : <Check size={14} />} Salvar</button>
      </footer>
    </form>
  </div>, document.body);
}
