"use client";
// V43 · Entrega prioritária: abre um "chamado" que entra na fila do dia e é anunciado com voz no painel da TV.
import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Play, RotateCcw, Siren, Trash2, Tv } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { activeCall, callQueue, CALL_STATUS } from "@/lib/chamados";
import { todayISO } from "@/lib/metrics";
import DateField from "./DateField";
import Select from "./Select";

const br = (d: string) => d.split("-").reverse().join("/");
export default function PriorityCallBox({ data, p, owners, onRefresh, notify }: { data: State; p: Project; owners: string[]; onRefresh: () => Promise<void> | void; notify: (m: string, err?: boolean) => void }) {
  const cur = activeCall(p), today = todayISO();
  const [open, setOpen] = useState(!!cur);
  const [f, setF] = useState({ date: cur?.date || today, owner: cur?.owner || p.nextActionOwner || "", reason: cur?.reason || p.nextAction || "", tv: cur ? cur.tv : true });
  const [busy, setBusy] = useState("");
  useEffect(() => { const c = activeCall(p); setOpen(!!c); setF({ date: c?.date || todayISO(), owner: c?.owner || p.nextActionOwner || "", reason: c?.reason || p.nextAction || "", tv: c ? c.tv : true }); }, [p.id, p.priorityCall]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = cur ? callQueue(data, today).find(x => x.p.id === p.id) : null;
  const dirty = !cur || f.date !== cur.date || f.owner !== cur.owner || f.reason.trim() !== cur.reason || f.tv !== cur.tv;
  async function act(action: string) {
    setBusy(action);
    try {
      const r = await fetch("/api/chamados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id, action, ...f }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
      await onRefresh();
      notify(action === "abrir" ? (j.queue ? `Entrega prioritária na Fila ${j.queue}${f.tv ? " · chamada na TV" : ""}` : `Entrega prioritária agendada para ${br(f.date)}`) : action === "atender" ? "Atendimento iniciado · saiu da chamada da TV" : action === "concluir" ? "Entrega prioritária concluída" : action === "reabrir" ? "Voltou para a fila" : "Entrega prioritária removida");
    } catch (e) { notify(e instanceof Error ? e.message : "Falha ao salvar", true); } finally { setBusy(""); }
  }
  if (!open) return <section className="v7-box v43-call off">
    <button type="button" className="v43-open" onClick={() => setOpen(true)}><Siren size={18} /><span><b>Entrega prioritária</b><small>Coloca o cliente na fila do dia e chama na TV com voz</small></span></button>
  </section>;
  return <section className={`v7-box v43-call ${cur ? `st-${cur.status}` : "new"}`}>
    <header>
      <h3><Siren size={16} /> Entrega prioritária</h3>
      {cur && <span className="chip">{q ? <><b>Fila {q.queue}</b> · </> : cur.date > today ? <>Entra em {br(cur.date)} · </> : null}{CALL_STATUS[cur.status]}{q?.late ? " · atrasada" : ""}</span>}
    </header>
    <label className="v43-reason"><span>O que precisa ser feito</span><input className="v7-input" value={f.reason} maxLength={220} onChange={e => setF(x => ({ ...x, reason: e.target.value }))} placeholder="Ex.: assinar o termo de integração" /></label>
    <div className="v7-grid2">
      <label><span>Quem vai atender</span><Select value={f.owner} onChange={e => setF(x => ({ ...x, owner: e.target.value }))}><option value="">Selecione</option>{owners.map(o => <option key={o}>{o}</option>)}</Select></label>
      <label><span>Dia na fila</span><DateField value={f.date} onChange={v => setF(x => ({ ...x, date: v || today }))} aria-label="Dia na fila" /></label>
    </div>
    <label className="v43-tv"><input type="checkbox" checked={f.tv} onChange={e => setF(x => ({ ...x, tv: e.target.checked }))} /><Tv size={15} /> Exibir no painel da TV (chamado com voz)</label>
    <div className="v43-actions">
      {!cur && <button type="button" className="btn outline" onClick={() => setOpen(false)} disabled={!!busy}>Cancelar</button>}
      {cur && <button type="button" className="btn outline danger" onClick={() => void act("remover")} disabled={!!busy} title="Tira a entrega prioritária"><Trash2 size={14} /></button>}
      {cur?.status === "aberto" && <button type="button" className="btn outline" onClick={() => void act("atender")} disabled={!!busy}><Play size={14} /> Iniciar atendimento</button>}
      {cur?.status === "atendimento" && <button type="button" className="btn outline" onClick={() => void act("reabrir")} disabled={!!busy}><RotateCcw size={14} /> Voltar para a TV</button>}
      {cur && <button type="button" className="btn outline ok" onClick={() => void act("concluir")} disabled={!!busy}><CheckCircle2 size={14} /> Concluir</button>}
      <span className="sp" />
      {(dirty || !cur) && <button type="button" className="btn primary v43-go" onClick={() => void act("abrir")} disabled={!!busy || !f.owner || !f.reason.trim()}><BellRing size={15} /> {cur ? "Salvar" : "Colocar na fila"}</button>}
    </div>
  </section>;
}
