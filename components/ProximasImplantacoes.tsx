"use client";
// V39/V40 · Próximas implantações: calendário por dia (consultor × dia útil), com navegação por semana,
// 1/2/4 semanas na tela, arrastar e soltar, fila de clientes à espera e revisão quando há crítica
// (conflito de agenda, PDF faltando, empecilho, infra). Quem aparece no painel é escolhido pelo gestor.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarCheck2, CalendarPlus, Check, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, EyeOff, Inbox, Search, Trash2, Tv, Users, X } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { KIND_LABEL, STATUS_TXT, TBD, addDaysISO, agendaBars, critiques, inQueueDefault, mondayOf, panelPeople, planQueue, splitPlan, weekDays, type Critique, type Slot } from "@/lib/fila";
import { PHASES, phaseIndex } from "@/lib/flow";
import { todayISO } from "@/lib/metrics";
import { addBD } from "@/lib/forecast";
import { FilaCalendar, FilaLegend } from "./FilaBoard";
import { ClientLogo } from "./ClientLogo";
import { PersonPhoto } from "./PersonPhoto";

type Props = { data: State; onRefresh: () => Promise<void> | void; notify: (m: string) => void; canWrite: boolean; canPeople?: boolean; onOpen: (p: Project) => void };
type Draft = { slot: Slot; start: string; end: string; consultant: string; status: "pre" | "agendado" | "realizado"; fromQueue: boolean };
const br = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const short = (k: string) => PHASES[phaseIndex(k)]?.short || k;
const bdLen = (a: string, b: string) => { let n = 0; for (let d = a; d <= b; d = addDaysISO(d, 1)) { const w = new Date(d + "T12:00:00").getDay(); if (w && w !== 6) n++; } return Math.max(1, n); };

async function saveBooking(d: Draft, notes = "", toAgenda = true, remove = false) {
  const r = await fetch("/api/fila", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: d.slot.p.id, kind: d.slot.kind, booking: remove ? null : { status: d.status, start: d.start, end: d.end, consultant: d.consultant, notes }, toAgenda }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
  return j as { added?: number; removed?: number; conflicts?: string[] };
}

export default function ProximasImplantacoes({ data, onRefresh, notify, canWrite, canPeople, onOpen }: Props) {
  const today = todayISO();
  const [monday, setMonday] = useState(() => mondayOf(today)), [weeks, setWeeks] = useState(1), [draft, setDraft] = useState<Draft | null>(null), [peopleOpen, setPeopleOpen] = useState(false), [busy, setBusy] = useState(false);
  const [alloc, setAlloc] = useState<{ person: string; day: string } | null>(null); // V41: alocação rápida
  const tvWeeks = Number((data as State & { config?: { tvWeeks?: number } }).config?.tvWeeks) || 2;
  async function setTvWeeks(w: number) {
    try { const r = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tvWeeks: w }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao salvar."); await onRefresh(); notify(`A TV agora mostra ${w === 1 ? "1 semana" : `${w} semanas`} em Próximas implantações`); }
    catch (e) { notify(e instanceof Error ? e.message : "Falha ao salvar"); }
  }
  const days = useMemo(() => weekDays(monday, weeks), [monday, weeks]);
  const plan = useMemo(() => planQueue(data, today, addDaysISO(today, 400)), [data, today]);
  const { placed, queue } = useMemo(() => splitPlan(plan.all), [plan]);
  const people = useMemo(() => panelPeople(data, placed, days), [data, placed, days]);
  const hidden = useMemo(() => new Set(people.filter(n => { const st = data.staff.find(s => s.name === n); return !st || !inQueueDefault(st); })), [people, data.staff]);
  const skip = useMemo(() => new Set(data.appointments.filter(a => placed.some(s => s.p.id === a.projectId && s.consultant === a.consultant && a.date && a.date >= s.start && a.date <= s.end)).map(a => a.id)), [data.appointments, placed]);
  const agenda = useMemo(() => agendaBars(data, days, people, skip), [data, days, people, skip]);
  const range = `${br(days[0])} – ${br(days[days.length - 1])}`;

  async function move(id: string, person: string, day: string, fromQueue: boolean) {
    const s = plan.all.find(x => x.id === id); if (!s || !canWrite) return;
    const len = fromQueue ? 5 : bdLen(s.start, s.end), end = addBD(day, len - 1);
    const d: Draft = { slot: s, start: day, end, consultant: person, status: s.booking?.status || (s.status === "andamento" ? "agendado" : "pre"), fromQueue };
    const crit = critiques(data, s.p, s.kind, d.start, d.end, person, today);
    if (fromQueue || crit.length) { setDraft(d); return; }
    setBusy(true);
    try { const j = await saveBooking(d, s.booking?.notes || ""); await onRefresh(); notify(`${s.client} · ${KIND_LABEL[s.kind]} movido para ${dm(day)} com ${person}${j.added ? " · agenda atualizada" : ""}${j.conflicts?.length ? ` · já ocupado em ${j.conflicts.join(", ")}` : ""}`); }
    catch (e) { notify(e instanceof Error ? e.message : "Falha ao mover"); }
    setBusy(false);
  }
  const exportCsv = () => {
    const rows = [["Cliente", "Fase atual", "Ida a campo", "Início", "Fim", "Consultor", "Situação"], ...plan.all.map(s => [s.client, short(s.phaseNow), KIND_LABEL[s.kind], br(s.start), br(s.end), s.consultant, STATUS_TXT[s.status]])];
    const q = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const blob = new Blob(["﻿" + rows.map(r => r.map(x => q(String(x ?? ""))).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "proximas-implantacoes.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return <div className="v27 v40">
    <div className="page-header v4-page-header"><div className="v4-heading-copy">
      <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  PRÓXIMAS IMPLANTAÇÕES</div>
      <h1>Próximas implantações</h1>
      <p>Quem vai a campo, onde e em que dia. Arraste da fila para o dia e o consultor, arraste as barras para remarcar ou clique num dia vazio para alocar.</p>
    </div></div>
    <div className="v42-tvcard">
      <span className="ic"><Tv size={20} /></span>
      <span className="tx"><b>Painel da TV</b><small>Quantas semanas a TV mostra em “Próximas implantações”{canPeople ? "" : " · só Administrador e Gestor alteram"}</small></span>
      <div className="opts" role="group" aria-label="Semanas na TV">{[1, 2, 3, 4].map(w => <button key={w} type="button" className={tvWeeks === w ? "on" : ""} disabled={!canPeople} onClick={() => void setTvWeeks(w)}>{w === 1 ? "1 semana" : `${w} semanas`}</button>)}</div>
      <a href="/tv" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir a TV</a>
    </div>
    <div className="v40-bar">
      <div className="nav">
        <button type="button" onClick={() => setMonday(m => addDaysISO(m, -7))} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
        <strong>{range}</strong>
        <button type="button" onClick={() => setMonday(m => addDaysISO(m, 7))} aria-label="Próxima semana"><ChevronRight size={18} /></button>
        <button type="button" className="txt" onClick={() => setMonday(mondayOf(today))} disabled={monday === mondayOf(today)}>Hoje</button>
      </div>
      <div className="seg">{[1, 2, 4].map(w => <button key={w} type="button" className={weeks === w ? "on" : ""} onClick={() => setWeeks(w)}>{w === 1 ? "1 semana" : `${w} semanas`}</button>)}</div>
      <FilaLegend />
      <span className="sp" />
      {canWrite && <button type="button" className="btn primary small v41-add" onClick={() => setAlloc({ person: "", day: today })}><CalendarPlus size={15} /> Alocar</button>}
      <button type="button" className="btn outline small" onClick={() => setPeopleOpen(true)}><Users size={14} /> Pessoas no painel</button>
      <button type="button" className="btn outline small" onClick={exportCsv}><Download size={14} /> Exportar</button>
    </div>
    <div className={`v40-main ${busy ? "busy" : ""} ${weeks === 4 ? "wide" : ""}`}>
      <div className="panel v40-calwrap"><FilaCalendar days={days} people={people} slots={placed} agenda={agenda} today={today} compact={weeks === 4} hidden={hidden}
        onEmpty={canWrite ? (person, day) => setAlloc({ person, day }) : undefined}
        onDropSlot={canWrite ? (id, p, d) => void move(id, p, d, false) : undefined} onDropQueue={canWrite ? (id, p, d) => void move(id, p, d, true) : undefined}
        onSlot={canWrite ? s => setDraft({ slot: s, start: s.start, end: s.end, consultant: s.consultant === TBD ? "" : s.consultant, status: s.booking?.status || (s.status === "andamento" ? "agendado" : "pre"), fromQueue: false }) : undefined} /></div>
      <aside className="panel v40-queue">
        <h3><Inbox size={17} /> Na fila <em>{queue.length}</em></h3>
        <p>Tudo que ainda não foi marcado: fases em andamento, datas prometidas e sugestões pela previsão. Arraste para o dia e o consultor.</p>
        <div className="list">{queue.map(s => <div key={s.id} className={`q ${s.kind}`} draggable={canWrite} onDragStart={e => { e.dataTransfer.setData("text/v40-queue", s.id); e.dataTransfer.effectAllowed = "copy"; }}
          onClick={canWrite ? () => setDraft({ slot: s, start: s.start, end: s.end, consultant: s.consultant === TBD ? "" : s.consultant, status: "pre", fromQueue: true }) : undefined}>
          <em>{s.kind === "golive" ? "GO-LIVE" : "HOMOLOG."}</em>
          <b className="v32-nm"><ClientLogo clientId={s.clientId} size={18} />{s.client}</b>
          <small>{short(s.phaseNow)} · {s.status === "andamento" ? "em andamento agora" : s.status === "prometido" ? `prometido ${dm(s.start)}` : `previsão ${dm(s.start)}`}{s.consultant !== TBD ? ` · ${s.consultant}` : ""}</small>
          {s.status !== "sugerido" && <i className={`st st-${s.status}`}>{s.status === "andamento" ? "Em andamento · marcar dias" : "Data prometida · confirmar"}</i>}
        </div>)}
          {!queue.length && <div className="empty">Fila vazia: tudo com data e consultor.</div>}</div>
      </aside>
    </div>
    {draft && <ReviewDialog data={data} draft={draft} onClose={() => setDraft(null)} onOpen={onOpen} onSaved={async m => { setDraft(null); await onRefresh(); notify(m); }} />}
    {alloc && <AllocDialog data={data} init={alloc} onClose={() => setAlloc(null)} onSaved={async m => { setAlloc(null); await onRefresh(); notify(m); }} />}
    {peopleOpen && <PeopleDialog data={data} canEdit={!!canPeople} onClose={() => setPeopleOpen(false)} onSaved={async () => { await onRefresh(); }} />}
  </div>;
}

/* ---------- Revisar ida a campo (abre ao soltar da fila, ao mover com crítica ou ao clicar) ---------- */
function ReviewDialog({ data, draft, onClose, onSaved, onOpen }: { data: State; draft: Draft; onClose: () => void; onSaved: (m: string) => void; onOpen: (p: Project) => void }) {
  const s = draft.slot, p = s.p;
  const [d, setD] = useState(draft), [notes, setNotes] = useState(s.booking?.notes || ""), [toAgenda, setToAgenda] = useState(true);
  const [blocker, setBlocker] = useState(p.blocker || ""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const crit: Critique[] = useMemo(() => critiques({ ...data, projects: data.projects.map(x => (x.id === p.id ? { ...x, blocker } : x)) }, { ...p, blocker }, s.kind, d.start, d.end, d.consultant), [data, p, s.kind, d, blocker]);
  const staff = [...new Set([...data.staff.filter(x => x.active).map(x => x.name), ...(d.consultant ? [d.consultant] : [])])].sort((a, b) => a.localeCompare(b));
  const reds = crit.filter(c => c.level === "red").length;
  async function save(remove = false) {
    setBusy(true); setErr("");
    try {
      if (blocker !== (p.blocker || "")) { const r = await fetch(`/api/records/projects/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocker }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao salvar o empecilho."); }
      const j = await saveBooking(d, notes, !remove && toAgenda && d.status !== "realizado", remove);
      onSaved(remove ? `Agendamento de ${s.client} removido` : `${KIND_LABEL[s.kind]} de ${s.client}: ${d.status === "agendado" ? "agendado" : d.status === "pre" ? "pré-agendado" : "realizado"} ${dm(d.start)}–${dm(d.end)}${d.consultant ? ` com ${d.consultant}` : ""}${j.added ? ` · ${j.added} dia(s) na agenda` : ""}${j.conflicts?.length ? ` · já ocupado em ${j.conflicts.join(", ")}` : ""}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Falha ao salvar."); setBusy(false); }
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v32-dlg v40-dlg" role="dialog" aria-modal="true" aria-labelledby="v40-t">
      <header><h2 id="v40-t"><span className={`v40-k ${s.kind}`}>{s.kind === "golive" ? "GO-LIVE" : "HOMOLOG."}</span><ClientLogo clientId={s.clientId} size={26} /> {s.client}</h2><button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <p className="lead">Fase atual: <b>{short(s.phaseNow)}</b>{s.status === "sugerido" ? ` · previsão da esteira: ${dm(s.start)}` : ""}</p>
        {crit.length > 0 ? <div className="v40-crit">{crit.map((c, i) => <div key={i} className={c.level}><AlertTriangle size={15} /><span>{c.text}</span>
          {c.kind === "pdf" && <button type="button" onClick={() => onOpen(p)}><ExternalLink size={13} /> Abrir projeto</button>}</div>)}</div>
          : <div className="v40-ok"><Check size={15} /> Sem conflitos: consultor livre, PDFs e empecilhos em dia.</div>}
        <div className="v39-seg3">{(["pre", "agendado", "realizado"] as const).map(k => <button key={k} type="button" className={d.status === k ? "on" : ""} onClick={() => setD(x => ({ ...x, status: k }))}>{k === "pre" ? "Pré-agendado" : k === "agendado" ? "Agendado com o cliente" : "Realizado"}</button>)}</div>
        <div className="v39-grid">
          <label><span>Início</span><input type="date" value={d.start} onChange={e => { const v = e.target.value; setD(x => ({ ...x, start: v, end: x.end < v ? addBD(v, 4) : x.end })); }} /></label>
          <label><span>Fim</span><input type="date" value={d.end} min={d.start} onChange={e => setD(x => ({ ...x, end: e.target.value }))} /></label>
          <label className="wide"><span>Consultor em campo</span><select value={d.consultant} onChange={e => setD(x => ({ ...x, consultant: e.target.value }))}><option value="">A definir</option>{staff.map(n => <option key={n}>{n}</option>)}</select></label>
          {(blocker || crit.some(c => c.kind === "empecilho")) && <label className="wide"><span>Empecilho do projeto (limpe se já foi resolvido)</span><input value={blocker} onChange={e => setBlocker(e.target.value)} placeholder="sem empecilho" /></label>}
          <label className="wide"><span>Observação</span><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex.: cliente confirma coletores até sexta" maxLength={300} /></label>
        </div>
        {d.status !== "realizado" && <label className="v34-ck v39-ck"><input type="checkbox" checked={toAgenda} disabled={!d.consultant} onChange={e => setToAgenda(e.target.checked)} /> Lançar os dias na agenda do consultor (remarcar aqui atualiza a agenda, a TV e a linha do tempo)</label>}
        {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      </div>
      <footer>
        {s.booking && <button type="button" className="btn outline small danger" onClick={() => void save(true)} disabled={busy}><Trash2 size={14} /> Remover</button>}
        <span className="sp" />
        <button type="button" className="btn outline" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !d.start}><CalendarCheck2 size={15} /> {reds ? "Salvar mesmo assim" : "Salvar"}</button>
      </footer>
    </div>
  </div>, document.body);
}

/* ---------- Quem aparece no painel ---------- */
function PeopleDialog({ data, canEdit, onClose, onSaved }: { data: State; canEdit: boolean; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const staff = [...data.staff].filter(s => s.active).sort((a, b) => Number(inQueueDefault(b)) - Number(inQueueDefault(a)) || a.name.localeCompare(b.name));
  async function toggle(id: string, v: boolean) {
    setBusy(id); setErr("");
    try { const r = await fetch(`/api/records/staff/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inQueue: v }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao salvar."); await onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Falha ao salvar."); }
    setBusy("");
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v32-dlg v40-people" role="dialog" aria-modal="true" aria-labelledby="v40-pt">
      <header><h2 id="v40-pt"><Users size={18} /> Pessoas no painel</h2><button type="button" className="p6-confirm-x" onClick={onClose} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <p className="lead">Escolha quem aparece no calendário e na TV. Quem estiver oculto aparece mesmo assim na semana em que tiver uma ida a campo marcada (ex.: comercial indo destravar um cliente).</p>
        <div className="list">{staff.map(s => { const on = inQueueDefault(s); return <button key={s.id} type="button" className={on ? "on" : ""} disabled={!canEdit || !!busy} onClick={() => void toggle(s.id, !on)}>
          <PersonPhoto name={s.name} size={32} /><span><b>{s.name}</b><small>{s.role}{s.inQueue == null ? " · padrão" : ""}</small></span>{on ? <Eye size={17} /> : <EyeOff size={17} />}</button>; })}</div>
        {!canEdit && <p className="hint">Somente Administrador e Gestor alteram quem aparece.</p>}
        {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      </div>
      <footer><span className="sp" /><button type="button" className="btn primary" onClick={onClose}>Pronto</button></footer>
    </div>
  </div>, document.body);
}

/* ---------- V41 · Alocar rápido (botão "Alocar" ou clique num dia vazio) ---------- */
const TYPES = [
  { k: "homolog", t: "Homologação", c: "homolog" }, { k: "golive", t: "Go-live", c: "golive" }, { k: "campo", t: "Implantação", c: "campo" },
  { k: "treino", t: "Treinamento", c: "treino" }, { k: "dev", t: "Integração", c: "dev" }, { k: "office", t: "Escritório", c: "office" },
] as const;
type TypeK = (typeof TYPES)[number]["k"];
function AllocDialog({ data, init, onClose, onSaved }: { data: State; init: { person: string; day: string }; onClose: () => void; onSaved: (m: string) => void }) {
  const [type, setType] = useState<TypeK>("homolog"), [q, setQ] = useState(""), [pid, setPid] = useState(""), [consultant, setConsultant] = useState(init.person);
  const [start, setStart] = useState(init.day), [end, setEnd] = useState(addBD(init.day, 4)), [confirmed, setConfirmed] = useState(false), [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hg = type === "homolog" || type === "golive", office = type === "office";
  const name = (id: string) => data.clients.find(c => c.id === id)?.name || "";
  const projects = useMemo(() => data.projects.filter(p => !p.archivedAt).map(p => ({ p, n: name(p.clientId) || p.name })).sort((a, b) => a.n.localeCompare(b.n)), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const list = projects.filter(x => !q || norm(x.n + " " + x.p.name).includes(norm(q))).slice(0, 40);
  const sel = projects.find(x => x.p.id === pid);
  const staff = [...new Set([...data.staff.filter(x => x.active).sort((a, b) => Number(inQueueDefault(b)) - Number(inQueueDefault(a)) || a.name.localeCompare(b.name)).map(x => x.name), ...(consultant ? [consultant] : [])])];
  const crit: Critique[] = useMemo(() => (hg && sel ? critiques(data, sel.p, type, start, end, consultant) : []), [hg, sel, data, type, start, end, consultant]);
  const existing = hg && sel ? sel.p.phases?.[type]?.booking : null;
  const busyDays = useMemo(() => (consultant ? data.appointments.filter(a => a.consultant === consultant && a.status !== "Cancelado" && a.date && a.date >= start && a.date <= end) : []), [data.appointments, consultant, start, end]);
  function pickType(k: TypeK) { setType(k); setEnd(k === "homolog" || k === "golive" ? addBD(start, 4) : start); }
  async function save() {
    setBusy(true); setErr("");
    try {
      if (!office && !sel) throw new Error("Escolha o cliente.");
      if (!consultant) throw new Error("Escolha quem vai.");
      const body = hg ? { projectId: sel!.p.id, kind: type, booking: { status: confirmed ? "agendado" : "pre", start, end, consultant, notes }, toAgenda: true }
        : { kind: "agenda", type, projectId: sel?.p.id, consultant, start, end, status: confirmed ? "Confirmado com Cliente" : "Planejado", notes };
      const r = await fetch("/api/fila", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
      const lbl = TYPES.find(t => t.k === type)!.t;
      onSaved(`${lbl}${office ? "" : ` · ${sel!.n}`} com ${consultant}: ${dm(start)}–${dm(end)}${j.added ? ` · ${j.added} dia(s) na agenda` : ""}${j.conflicts?.length ? ` · já ocupado em ${j.conflicts.join(", ")}` : ""}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Falha ao salvar."); setBusy(false); }
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v32-dlg v40-dlg v41-alloc" role="dialog" aria-modal="true" aria-labelledby="v41-t">
      <header><h2 id="v41-t"><CalendarPlus size={19} /> Alocar na agenda</h2><button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <div className="v41-types">{TYPES.map(t => <button key={t.k} type="button" className={`${t.c} ${type === t.k ? "on" : ""}`} onClick={() => pickType(t.k)}>{t.t}</button>)}</div>
        {!office && <div className="v41-pick">
          {sel ? <div className="chosen"><ClientLogo clientId={sel.p.clientId} size={26} /><span><b>{sel.n}</b><small>{sel.p.name !== sel.n ? `${sel.p.name} · ` : ""}{short(sel.p.phase || "")}</small></span><button type="button" className="btn outline small" onClick={() => setPid("")}>Trocar</button></div>
            : <><label className="find"><Search size={15} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente…" /></label>
              <div className="opts">{list.map(x => <button key={x.p.id} type="button" onClick={() => setPid(x.p.id)}><ClientLogo clientId={x.p.clientId} size={20} /><b>{x.n}</b><small>{short(x.p.phase || "")}</small></button>)}
                {!list.length && <div className="none">Nenhum cliente com esse nome.</div>}</div></>}
        </div>}
        <div className="v39-grid">
          <label className="wide"><span>Quem vai</span><select value={consultant} onChange={e => setConsultant(e.target.value)}><option value="">Escolha…</option>{staff.map(n => <option key={n}>{n}</option>)}</select></label>
          <label><span>Início</span><input type="date" value={start} onChange={e => { const v = e.target.value; setStart(v); if (end < v) setEnd(hg ? addBD(v, 4) : v); }} /></label>
          <label><span>Fim</span><input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} /></label>
          <label className="wide"><span>Observação</span><input value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="opcional" /></label>
        </div>
        {!office && <label className="v34-ck v39-ck"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Já confirmado com o cliente{hg ? " (grava a data no projeto)" : ""}</label>}
        {existing && <div className="v40-crit"><div className="amber"><AlertTriangle size={15} /><span>Este cliente já tem {type === "golive" ? "go-live" : "homologação"} marcada em {dm(existing.start)}–{dm(existing.end || existing.start)}{existing.consultant ? ` com ${existing.consultant}` : ""}. Salvar vai remarcar (a agenda antiga é refeita).</span></div></div>}
        {crit.length > 0 && <div className="v40-crit">{crit.map((c, i) => <div key={i} className={c.level}><AlertTriangle size={15} /><span>{c.text}</span></div>)}</div>}
        {!hg && busyDays.length > 0 && <div className="v40-crit"><div className="amber"><AlertTriangle size={15} /><span>{consultant} já tem agenda em {[...new Set(busyDays.map(a => dm(a.date!)))].join(", ")}: esses dias serão pulados.</span></div></div>}
        {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      </div>
      <footer><span className="sp" /><button type="button" className="btn outline" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !consultant || (!office && !sel)}><CalendarCheck2 size={15} /> Alocar</button></footer>
    </div>
  </div>, document.body);
}
