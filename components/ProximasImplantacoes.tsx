"use client";
// V39 · Próximas implantações: quem vai a campo, onde e quando (Homologação e Go-live) até o fim do ano.
// A fila é montada sozinha (agendamentos, fase em andamento, datas prometidas e sugestão pela previsão + semana
// livre do consultor) e aqui a equipe confirma: Pré-agendado → Agendado (grava a data no projeto e na agenda).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarCheck2, CalendarRange, Check, Download, Rocket, Trash2, Wand2, X } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { KIND_LABEL, STATUS_TXT, TBD, planQueue, type Slot } from "@/lib/fila";
import { PHASES, phaseIndex } from "@/lib/flow";
import { todayISO } from "@/lib/metrics";
import { addBD } from "@/lib/forecast";
import { FilaBoard, FilaLegend } from "./FilaBoard";
import { ClientLogo } from "./ClientLogo";
import { PersonPhoto } from "./PersonPhoto";

type Props = { data: State; onRefresh: () => Promise<void> | void; notify: (m: string) => void; canWrite: boolean; onOpen: (p: Project) => void };
const br = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const short = (k: string) => PHASES[phaseIndex(k)]?.short || k;

export default function ProximasImplantacoes({ data, onRefresh, notify, canWrite, onOpen }: Props) {
  const today = todayISO();
  const [horizon, setHorizon] = useState<"ano" | "90">("ano"), [who, setWho] = useState(""), [edit, setEdit] = useState<Slot | null>(null);
  const until = horizon === "ano" ? `${today.slice(0, 4)}-12-31` : new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const plan = useMemo(() => planQueue(data, today, until), [data, today, until]);
  const slots = plan.inRange.filter(s => !who || s.consultant === who);
  const consultants = who ? plan.consultants.filter(c => c === who) : plan.consultants;
  const count = (st: Slot["status"][]) => plan.inRange.filter(s => st.includes(s.status)).length;
  const exportCsv = () => {
    const rows = [["Cliente", "Fase atual", "Ida a campo", "Início", "Fim", "Consultor", "Situação", "Observação"], ...plan.all.map(s => [s.client, short(s.phaseNow), KIND_LABEL[s.kind], br(s.start), br(s.end), s.consultant, STATUS_TXT[s.status], s.note])];
    const q = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const blob = new Blob(["﻿" + rows.map(r => r.map(x => q(String(x ?? ""))).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "proximas-implantacoes.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return <div className="v27 v39">
    <div className="page-header v4-page-header"><div className="v4-heading-copy">
      <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  PRÓXIMAS IMPLANTAÇÕES</div>
      <h1>Próximas implantações</h1>
      <p>Quem vai a campo, em qual cliente e em que semana — homologações e go-lives até {horizon === "ano" ? "o fim do ano" : "os próximos 90 dias"}. A fila se monta sozinha; confirme com Pré-agendado ou Agendado.</p>
    </div></div>
    <div className="v39-kpis">
      <div><CalendarCheck2 size={18} /><b>{count(["agendado"])}</b><span>Agendados</span></div>
      <div><CalendarRange size={18} /><b>{count(["pre", "prometido"])}</b><span>Pré-agendados / data prometida</span></div>
      <div><Wand2 size={18} /><b>{count(["sugerido"])}</b><span>Sugestões a confirmar</span></div>
      <div><Rocket size={18} /><b>{plan.inRange.filter(s => s.kind === "golive").length}</b><span>Go-lives no período</span></div>
      <div className="warn"><b>{plan.inRange.filter(s => s.consultant === TBD).length}</b><span>Sem consultor definido</span></div>
    </div>
    <div className="v39-bar">
      <div className="seg"><button type="button" className={horizon === "ano" ? "on" : ""} onClick={() => setHorizon("ano")}>Até o fim do ano</button><button type="button" className={horizon === "90" ? "on" : ""} onClick={() => setHorizon("90")}>Próximos 90 dias</button></div>
      <select value={who} onChange={e => setWho(e.target.value)} aria-label="Consultor"><option value="">Todos os consultores</option>{plan.consultants.map(c => <option key={c}>{c}</option>)}</select>
      <FilaLegend />
      <button type="button" className="btn outline small" onClick={exportCsv}><Download size={14} /> Exportar</button>
    </div>
    <div className="panel v39-boardwrap"><FilaBoard weeks={plan.weeks} consultants={consultants} slots={slots} today={today} onSlot={canWrite ? setEdit : undefined} maxPerCell={6} /></div>
    <div className="panel">
      <h3 className="v39-h3">Fila completa <small>clique em uma linha para agendar · {plan.all.length} idas a campo</small></h3>
      <div className="v39-table"><table><thead><tr><th>Cliente</th><th>Fase atual</th><th>Ida a campo</th><th>Semana</th><th>Consultor</th><th>Situação</th><th /></tr></thead>
        <tbody>{plan.all.filter(s => !who || s.consultant === who).map(s => <tr key={s.id} className={`st-${s.status}`}>
          <td><button type="button" className="v39-link v32-nm" onClick={() => onOpen(s.p)}><ClientLogo clientId={s.clientId} size={20} />{s.client}</button></td>
          <td>{short(s.phaseNow)}</td>
          <td><span className={`v39-kind ${s.kind}`}>{s.kind === "golive" ? "G" : "H"}</span> {KIND_LABEL[s.kind]}</td>
          <td>{br(s.start)} – {br(s.end)}{s.start > until && <em className="later"> depois do período</em>}</td>
          <td><span className="v39-who">{s.consultant === TBD ? <i>?</i> : <PersonPhoto name={s.consultant} size={22} />}{s.consultant}</span></td>
          <td><span className={`v39-st st-${s.status}`}>{STATUS_TXT[s.status]}</span><small>{s.booking?.by ? `por ${s.booking.by}` : s.note}</small></td>
          <td>{canWrite && <button type="button" className="btn outline small" onClick={() => setEdit(s)}>{s.booking ? "Editar" : "Agendar"}</button>}</td>
        </tr>)}</tbody></table></div>
    </div>
    {edit && <BookingDialog slot={edit} data={data} onClose={() => setEdit(null)} onSaved={async m => { setEdit(null); await onRefresh(); notify(m); }} />}
  </div>;
}

function BookingDialog({ slot, data, onClose, onSaved }: { slot: Slot; data: State; onClose: () => void; onSaved: (m: string) => void }) {
  const b = slot.booking;
  const [status, setStatus] = useState<"pre" | "agendado" | "realizado">(b?.status || "pre");
  const [start, setStart] = useState(b?.start || slot.start), [end, setEnd] = useState(b?.end || slot.end);
  const [consultant, setConsultant] = useState(b?.consultant || (slot.consultant === TBD ? "" : slot.consultant)), [notes, setNotes] = useState(b?.notes || "");
  const [toAgenda, setToAgenda] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (status === "agendado" && consultant) setToAgenda(true); }, [status, consultant]);
  const staff = [...new Set([...data.staff.filter(s => s.active).map(s => s.name), ...(consultant ? [consultant] : [])])].sort((a, z) => a.localeCompare(z));
  async function save(remove = false) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/fila", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: slot.p.id, kind: slot.kind, booking: remove ? null : { status, start, end, consultant, notes }, toAgenda: !remove && toAgenda }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
      onSaved(remove ? "Agendamento removido" : `${KIND_LABEL[slot.kind]} de ${slot.client} ${status === "agendado" ? "agendado" : status === "pre" ? "pré-agendado" : "marcado como realizado"}${j.added ? ` · ${j.added} dia(s) lançados na agenda` : ""}${j.conflicts?.length ? ` · já ocupado em ${j.conflicts.join(", ")}` : ""}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Falha ao salvar."); setBusy(false); }
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v32-dlg v39-dlg" role="dialog" aria-modal="true" aria-labelledby="v39-t">
      <header><h2 id="v39-t"><CalendarCheck2 size={18} /> {KIND_LABEL[slot.kind]} · {slot.client}</h2><button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <p className="lead">Fase atual: {short(slot.phaseNow)}. {slot.status === "sugerido" ? `Sugestão do sistema: ${br(slot.start)} a ${br(slot.end)} com ${slot.consultant}.` : slot.note}</p>
        <div className="v39-seg3">{(["pre", "agendado", "realizado"] as const).map(k => <button key={k} type="button" className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{k === "pre" ? "Pré-agendado" : k === "agendado" ? "Agendado (confirmado com o cliente)" : "Realizado"}</button>)}</div>
        <div className="v39-grid">
          <label><span>Início</span><input type="date" value={start} onChange={e => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(addBD(e.target.value, 4)); }} /></label>
          <label><span>Fim</span><input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} /></label>
          <label className="wide"><span>Consultor em campo</span><select value={consultant} onChange={e => setConsultant(e.target.value)}><option value="">A definir</option>{staff.map(n => <option key={n}>{n}</option>)}</select></label>
          <label className="wide"><span>Observação</span><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex.: aguardando o cliente confirmar coletores" maxLength={300} /></label>
        </div>
        {status !== "realizado" && <label className="v34-ck v39-ck"><input type="checkbox" checked={toAgenda} disabled={!consultant} onChange={e => setToAgenda(e.target.checked)} /> Lançar os dias úteis na agenda do consultor (dia inteiro, presencial){!consultant && " — escolha o consultor"}</label>}
        {status === "agendado" && <p className="hint">Agendado também grava a data de {slot.kind === "golive" ? "go-live" : "homologação"} no projeto ({br(start)}).</p>}
        {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      </div>
      <footer>
        {b && <button type="button" className="btn outline small danger" onClick={() => void save(true)} disabled={busy}><Trash2 size={14} /> Remover agendamento</button>}
        <span className="sp" />
        <button type="button" className="btn outline" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !start}><Check size={15} /> Salvar</button>
      </footer>
    </div>
  </div>, document.body);
}
