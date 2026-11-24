"use client";
// V29 · Cronograma de implantação do projeto: modelo padrão do escopo, com datas e responsáveis
// (time Expert e pessoas do cliente). Gera PDF igual ao modelo e Excel para enviar ao cliente.
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarRange, Check, Download, Eye, FileSpreadsheet, FileText, Highlighter, Minus, MoreHorizontal, Plus, RefreshCw, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import type { Project, ScheduleRow, State } from "@/lib/types";
import { GROUPS, TEAM_ROLES, clientNames, clientPeople, expertNames, scheduleOf, scheduleStats, templateRows, brDate } from "@/lib/schedule";
import type { ScheduleTeam } from "@/lib/types";
import { phaseOwner } from "@/lib/flow";
import { todayISO } from "@/lib/metrics";
import ConfirmDialog, { type ConfirmBox } from "./ConfirmDialog";
import { ChartGantt as GanttV31 } from "lucide-react";

type Props = { project: Project; data: State; onRefresh: () => Promise<void> | void; notify: (m: string) => void; canWrite?: boolean };
const rid = () => crypto.randomUUID();

export default function Cronograma({ project: p, data, onRefresh, notify, canWrite = true }: Props) {
  const saved = useMemo(() => scheduleOf(p.schedule), [p.schedule]);
  const isNew = !p.schedule?.rows?.length;
  const [team, setTeam] = useState<ScheduleTeam>(saved.team || {});
  const [rows, setRows] = useState<ScheduleRow[]>(saved.rows), [consultant, setConsultant] = useState(saved.consultant || p.implementationOwner || phaseOwner(p));
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [menu, setMenu] = useState<string | null>(null), [open, setOpen] = useState(true);
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null), [me, setMe] = useState("");
  useEffect(() => { if (!dirty) { setRows(saved.rows); setTeam(saved.team || {}); setConsultant(saved.consultant || p.implementationOwner || phaseOwner(p)); } }, [saved, dirty, p]);
  useEffect(() => { fetch("/api/auth", { cache: "no-store" }).then(r => r.json()).then(j => setMe(j.name || "")).catch(() => {}); }, []);
  useEffect(() => { if (!menu) return; const h = () => setMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, [menu]);
  const client = data.clients.find(c => c.id === p.clientId);
  const people = clientPeople(client?.info);
  const staff = useMemo(() => [...new Set([...data.staff.filter(s => s.active !== false).map(s => s.name), ...data.users.filter(u => u.active && u.role !== "Painel").map(u => u.name)])].sort((a, b) => a.localeCompare(b)), [data.staff, data.users]);
  const today = todayISO();
  const st = scheduleStats({ rows }, today);

  const upd = (id: string, v: Partial<ScheduleRow>) => { setRows(rs => rs.map(r => r.id === id ? { ...r, ...v } : r)); setDirty(true); };
  const move = (id: string, d: number) => { setRows(rs => { const i = rs.findIndex(r => r.id === id), j = i + d; if (i < 0 || j < 0 || j >= rs.length || rs[j].group !== rs[i].group) return rs; const n = [...rs]; [n[i], n[j]] = [n[j], n[i]]; return n; }); setDirty(true); };
  const remove = (id: string) => { setRows(rs => rs.filter(r => r.id !== id)); setDirty(true); };
  const add = (group: string) => { setRows(rs => { const last = rs.map(r => r.group).lastIndexOf(group); const row: ScheduleRow = { id: rid(), group, phase: rs[last]?.phase || "", activity: "", expert: "", client: "", start: null, end: null, clientPeople: [] }; const n = [...rs]; n.splice(last + 1, 0, row); return n; }); setDirty(true); };
  const togglePerson = (r: ScheduleRow, k: string) => upd(r.id, { clientPeople: (r.clientPeople || []).includes(k) ? (r.clientPeople || []).filter(x => x !== k) : [...(r.clientPeople || []), k] });

  async function save() {
    const bad = rows.find(r => r.start && r.end && r.end < r.start); if (bad) return notify(`Falha: “${bad.activity || "atividade"}” termina antes de começar.`);
    setBusy(true);
    try {
      const schedule = { rows, consultant, team, updatedAt: new Date().toISOString(), updatedBy: me || undefined };
      const tl = [{ id: rid(), at: new Date().toISOString(), kind: "nota", author: me || undefined, text: `Cronograma ${isNew ? "criado" : "atualizado"}: ${rows.filter(r => r.start || r.end).length} de ${rows.length} atividades com data` }, ...(p.timeline || [])];
      const r = await fetch(`/api/records/projects/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule, timeline: tl }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
      setDirty(false); await onRefresh(); notify("Cronograma salvo");
    } catch (e) { notify(`Falha: ${e instanceof Error ? e.message : "não foi possível salvar"}`); } finally { setBusy(false); }
  }
  const reset = () => setConfirmBox({ title: "Voltar ao modelo padrão?", message: "As atividades voltam a ser as do escopo padrão, sem datas e sem responsáveis. Só vale depois de salvar.", confirmLabel: "Restaurar modelo", tone: "info", onConfirm: () => { setRows(templateRows()); setDirty(true); } });
  const dl = (fmt: "pdf" | "xlsx", ver = false) => { const u = `/api/cronograma/${p.id}?formato=${fmt}${ver ? "&ver=1" : ""}`; if (ver) window.open(u, "_blank"); else window.location.href = u; };

  return <div className="panel v29-crono">
    <header className="v29-ch">
      <button type="button" className="tg" onClick={() => setOpen(o => !o)} aria-expanded={open}><h3><CalendarRange size={17} /> Cronograma de implantação</h3>
        <small>{st.dated} de {st.total} atividades com data{st.late.length ? ` · ${st.late.length} atrasada(s)` : ""}{st.next ? ` · próxima: ${st.next.activity} (${brDate(st.next.start || st.next.end)})` : ""}{p.schedule?.updatedAt ? ` · salvo ${new Date(p.schedule.updatedAt).toLocaleDateString("pt-BR")}${p.schedule.updatedBy ? ` por ${p.schedule.updatedBy}` : ""}` : ""}</small></button>
      <div className="acts">
        <a className="btn outline small v31-link" href={`/linha-do-tempo?projeto=${p.id}`} title="Ver a linha do tempo deste projeto (quem entrou em cada fase, diário e paradas)"><GanttV31 size={14} /> Linha do tempo</a>
        <button type="button" className="btn outline small" disabled={dirty} title={dirty ? "Salve antes de gerar" : "Abrir o PDF"} onClick={() => dl("pdf", true)}><Eye size={14} /> Ver PDF</button>
        <button type="button" className="btn outline small" disabled={dirty} title={dirty ? "Salve antes de gerar" : "Baixar PDF para enviar ao cliente"} onClick={() => dl("pdf")}><FileText size={14} /> PDF</button>
        <button type="button" className="btn outline small" disabled={dirty} title={dirty ? "Salve antes de gerar" : "Baixar Excel para enviar ao cliente"} onClick={() => dl("xlsx")}><FileSpreadsheet size={14} /> Excel</button>
        <button type="button" className="btn outline small v30-word" disabled={dirty} title={dirty ? "Salve antes de gerar" : "Escopo de implantação completo (Word) com o nome do cliente, equipes e cronograma"} onClick={() => { window.location.href = `/api/escopo/${p.id}`; }}><FileText size={14} /> Escopo (Word)</button>
        {canWrite && dirty && <button type="button" className="btn outline small" disabled={busy} onClick={() => { setRows(saved.rows); setDirty(false); }}><Undo2 size={14} /> Descartar</button>}
        {canWrite && <button type="button" className="btn primary small" disabled={busy || !dirty} onClick={() => void save()}>{busy ? <RefreshCw className="spin" size={14} /> : <Save size={14} />} Salvar</button>}
      </div>
    </header>
    {open && <>
      {isNew && !dirty && <div className="v29-note">Este projeto ainda usa o <b>modelo padrão</b> do escopo. Preencha as datas e os responsáveis e clique em <b>Salvar</b>.</div>}
      {!people.length && <div className="v29-note warn">Cadastre o <b>patrocinador</b> e os <b>key users</b> em “Dados do cliente e responsáveis” (acima) para escolher quem é o responsável de cada atividade.</div>}
      <div className="v29-meta">
        <label><span>Consultor WMS Expert (sai no PDF)</span><select value={consultant} disabled={!canWrite} onChange={e => { setConsultant(e.target.value); setDirty(true); }}>{[...new Set([consultant, ...staff].filter(Boolean))].map(n => <option key={n}>{n}</option>)}</select></label>
        {TEAM_ROLES.map(r => <label key={r.key} title={r.hint}><span>{r.label}</span><select value={team[r.key] || ""} disabled={!canWrite} onChange={e => { setTeam(t => ({ ...t, [r.key]: e.target.value || undefined })); setDirty(true); }}><option value="">—</option>{[...new Set([team[r.key] || "", ...staff].filter(Boolean))].map(n => <option key={n}>{n}</option>)}</select></label>)}
        <label title="Sai na capa do escopo"><span>Unidade WMS Expert</span><input className="v30-unit" value={team.unidade || ""} disabled={!canWrite} placeholder="UN01 - WMS Expert Ceará" onChange={e => { setTeam(t => ({ ...t, unidade: e.target.value })); setDirty(true); }} /></label>
        {canWrite && <button type="button" className="v29-link" onClick={reset}><RotateCcw size={13} /> Restaurar modelo padrão</button>}
        <span className="legend"><i className="pk" /> atividade do cliente (rosa no PDF) <i className="cn" /> contínua (“-” nas datas)</span>
      </div>
      <div className="v29-table-wrap"><table className="v29-table">
        <thead><tr><th className="band" /><th>Fase</th><th>Atividades</th><th>Time Expert</th><th className="n">Hrs</th><th>Time cliente · responsáveis</th><th className="n">Hrs</th><th>Início</th><th>Fim</th><th className="n" title="Concluída">✓</th><th /></tr></thead>
        {GROUPS.map(g => { const list = rows.filter(r => r.group === g.key); return <tbody key={g.key}>
          {list.map((r, i) => <tr key={r.id} className={`${r.highlight ? "pk" : ""} ${r.done ? "done" : ""} ${!r.done && r.end && r.end < today ? "late" : ""}`}>
            {i === 0 && <th className="band" rowSpan={list.length + (canWrite ? 1 : 0)} style={{ background: g.color }}><span>{g.label}</span></th>}
            <td><input className="w-fase" value={r.phase} disabled={!canWrite} onChange={e => upd(r.id, { phase: e.target.value })} /></td>
            <td><input className="w-ativ" value={r.activity} disabled={!canWrite} onChange={e => upd(r.id, { activity: e.target.value })} placeholder="Descreva a atividade" /></td>
            <td><input className="w-exp" value={r.expert} disabled={!canWrite} onChange={e => upd(r.id, { expert: e.target.value })} />
              <select className="w-who" value={r.expertPerson || ""} disabled={!canWrite} onChange={e => upd(r.id, { expertPerson: e.target.value })}><option value="">{(() => { const a = expertNames({ ...r, expertPerson: "" }, team, consultant); return a.length ? `auto: ${a.join(", ")}` : "quem? (opcional)"; })()}</option>{staff.map(n => <option key={n}>{n}</option>)}</select></td>
            <td className="n"><input className="w-hrs" value={r.expertHrs || ""} disabled={!canWrite} onChange={e => upd(r.id, { expertHrs: e.target.value })} /></td>
            <td><input className="w-cli" value={r.client} disabled={!canWrite} onChange={e => upd(r.id, { client: e.target.value })} />
              {people.length > 0 && <div className="chips">{people.filter(x => (r.clientPeople || []).includes(x.key)).map(x => <button key={x.key} type="button" disabled={!canWrite} className="on" title={`${x.label}: ${x.person.name} — clique para tirar`} onClick={() => togglePerson(r, x.key)}>{x.person.name.split(" ")[0]} ×</button>)}
                {!(r.clientPeople || []).length && clientNames(r, client?.info).length > 0 && <span className="auto" title="Pela função da linha. Escolha pessoas para trocar.">auto: {clientNames(r, client?.info).map(n => n.split(" ")[0]).join(", ")}</span>}
                {canWrite && people.some(x => !(r.clientPeople || []).includes(x.key)) && <select className="add-p" value="" onChange={e => { if (e.target.value) togglePerson(r, e.target.value); }} aria-label="Adicionar responsável do cliente"><option value="">+ responsável</option>{people.filter(x => !(r.clientPeople || []).includes(x.key)).map(x => <option key={x.key} value={x.key}>{x.label}: {x.person.name}</option>)}</select>}</div>}</td>
            <td className="n"><input className="w-hrs" value={r.clientHrs || ""} disabled={!canWrite} onChange={e => upd(r.id, { clientHrs: e.target.value })} /></td>
            <td><input type="date" value={r.start || ""} disabled={!canWrite} onChange={e => upd(r.id, { start: e.target.value || null })} /></td>
            <td><input type="date" value={r.end || ""} min={r.start || undefined} disabled={!canWrite} onChange={e => upd(r.id, { end: e.target.value || null })} /></td>
            <td className="n"><button type="button" className={`ck ${r.done ? "on" : ""}`} disabled={!canWrite} onClick={() => upd(r.id, { done: !r.done })} aria-label="Concluída">{r.done ? <Check size={13} /> : null}</button></td>
            <td className="mn">{canWrite && <div className="mw"><button type="button" className="dots" onClick={e => { e.stopPropagation(); setMenu(menu === r.id ? null : r.id); }} aria-label="Mais opções"><MoreHorizontal size={15} /></button>
              {menu === r.id && <div className="pop" onClick={e => e.stopPropagation()}>
                <button type="button" onClick={() => { upd(r.id, { highlight: !r.highlight }); setMenu(null); }}><Highlighter size={13} /> {r.highlight ? "Tirar destaque" : "Atividade do cliente (rosa)"}</button>
                <button type="button" onClick={() => { upd(r.id, { continuous: !r.continuous }); setMenu(null); }}><Minus size={13} /> {r.continuous ? "Não é contínua" : "Contínua (datas “-”)"}</button>
                <button type="button" onClick={() => { move(r.id, -1); setMenu(null); }}><ArrowUp size={13} /> Subir</button>
                <button type="button" onClick={() => { move(r.id, 1); setMenu(null); }}><ArrowDown size={13} /> Descer</button>
                <button type="button" className="danger" onClick={() => { remove(r.id); setMenu(null); }}><Trash2 size={13} /> Remover</button>
              </div>}</div>}</td>
          </tr>)}
          {canWrite && <tr className="add"><td colSpan={10}><button type="button" onClick={() => add(g.key)}><Plus size={13} /> Adicionar atividade em {g.label}</button></td></tr>}
        </tbody>; })}
      </table></div>
      {dirty && <div className="v29-dirty"><span>Alterações não salvas.</span><button type="button" className="btn primary small" disabled={busy} onClick={() => void save()}>{busy ? <RefreshCw className="spin" size={14} /> : <Save size={14} />} Salvar cronograma</button></div>}
      {!dirty && <p className="v29-hint"><Download size={12} /> O PDF segue o modelo do escopo (06 · Planejamento · Cronograma) com o nome do cliente, e traz uma página de identificação com CNPJ, patrocinador e key users.</p>}
    </>}
    {confirmBox && <ConfirmDialog box={confirmBox} onClose={() => setConfirmBox(null)} />}
  </div>;
}
