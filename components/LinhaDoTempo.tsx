"use client";
// V31 · Linha do tempo por consultor ou por projeto: etapas (fase da esteira, agenda, cronograma),
// o que foi feito em cada dia, onde parou e por quê. Também vai para a TV e para o Excel.
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChartGantt, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleDot, FileSpreadsheet, List, Plus, Rows3, ShieldCheck, Sparkles, UserRound, Building2 } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { buildTimeline, addDays, mondayOf, daysBetween, brS, br, PHASE_COLOR, isRealPerson, STATUS_LABEL, type Entry, type Lane, type Seg } from "@/lib/timeline";
import { todayISO } from "@/lib/metrics";
import { PersonPhoto } from "./PersonPhoto";
import Select from "./Select";
import JournalDialog, { type JournalTarget } from "./JournalDialog";
import { ClientLogo } from "./ClientLogo"; // V32
import { logoUrl } from "@/lib/logos";

type Props = { data: State; onRefresh: () => Promise<void> | void; notify: (m: string) => void; canWrite?: boolean; onOpen: (p: Project) => void };
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const KIND_LABEL: Record<string, string> = { fase: "Fase da esteira", agenda: "Agenda", crono: "Cronograma" };

/** Empilha barras que se sobrepõem em linhas diferentes. */
function stack(segs: Seg[]) { const rows: string[] = []; return segs.map(s => { let i = rows.findIndex(end => end < s.start); if (i < 0) { rows.push(s.end); i = rows.length - 1; } else rows[i] = s.end; return { s, row: i }; }); }

export default function LinhaDoTempo({ data, onRefresh, notify, canWrite = true, onOpen }: Props) {
  const today = todayISO();
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const [mode, setMode] = useState<"consultor" | "projeto">(q?.get("projeto") ? "projeto" : "consultor");
  const [projectId, setProjectId] = useState(q?.get("projeto") || "");
  const [person, setPerson] = useState(q?.get("consultor") || "");
  const [weeks, setWeeks] = useState(2), [anchor, setAnchor] = useState(mondayOf(today)), [view, setView] = useState<"linha" | "lista">("linha");
  const [me, setMe] = useState(""), [target, setTarget] = useState<JournalTarget | null>(null);
  useEffect(() => { fetch("/api/auth", { cache: "no-store" }).then(r => r.json()).then(j => setMe(j.name || "")).catch(() => {}); }, []);
  const from = addDays(anchor, -7 * (weeks - 1)), to = addDays(anchor, 6);
  const days = daysBetween(from, to);
  const groups = useMemo(() => buildTimeline(data, from, to, { mode, person: mode === "consultor" ? person || undefined : undefined, projectId: mode === "projeto" ? projectId || undefined : undefined, today }), [data, from, to, mode, person, projectId, today]);
  const people = useMemo(() => [...new Set([...data.staff.filter(s => s.active !== false).map(s => s.name), ...data.users.filter(u => u.active && u.role !== "Painel").map(u => u.name)].filter(isRealPerson))].sort((a, b) => a.localeCompare(b)), [data]);
  const cid = (pid?: string) => pid ? data.projects.find(x => x.id === pid)?.clientId : undefined; // V32
  const projects = useMemo(() => data.projects.filter(p => !p.archivedAt).map(p => ({ id: p.id, name: data.clients.find(c => c.id === p.clientId)?.name || p.name })).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const stops = groups.flatMap(g => g.lanes.flatMap(l => l.entries.filter(e => e.status !== "ok").map(e => ({ e, l }))));
  const blockers = mode === "projeto" ? [] : [...new Map(groups.flatMap(g => g.lanes.filter(l => l.blocker).map(l => [l.projectId, l] as const))).values()];
  const nDays = new Set(groups.flatMap(g => g.lanes.flatMap(l => l.entries.map(e => `${l.person}${e.date}`)))).size;
  const termos = new Set(groups.flatMap(g => g.lanes.flatMap(l => l.segs.filter(s => s.termo === "ok" && s.kind !== "crono").map(s => `${s.projectId}-${s.phase}`)))).size;
  const colW = (d: string) => { const w = new Date(d + "T12:00:00").getDay(); return w === 0 || w === 6 ? 0.45 : 1; };
  const totalW = days.reduce((a, d) => a + colW(d), 0);
  const leftOf = (d: string) => { let x = 0; for (const k of days) { if (k >= d) break; x += colW(k); } return (x / totalW) * 100; };
  const widthOf = (a: string, b: string) => { let x = 0; for (const k of days) if (k >= a && k <= b) x += colW(k); return (x / totalW) * 100; };
  const gridCols = days.map(d => `${colW(d)}fr`).join(" ");
  const xlsx = () => { const u = new URLSearchParams({ de: from, ate: to, modo: mode }); if (mode === "consultor" && person) u.set("pessoa", person); if (mode === "projeto" && projectId) u.set("projeto", projectId); window.location.href = `/api/linha-do-tempo/xlsx?${u}`; };
  const openNew = (l?: Lane, d?: string) => canWrite && setTarget({ projectId: l?.projectId, person: l && !l.person.startsWith("Cliente ·") ? l.person : person || me, date: d || today });
  const scroller = useRef<HTMLDivElement>(null);

  const Chip = ({ e }: { e: Entry }) => <button type="button" className={`v31-chip s-${e.status}`} title={`${br(e.date)} · ${e.person}\n${e.text}${e.reason ? `\nParou: ${e.reason} (${e.blockedBy})` : ""}`} onClick={ev => { ev.stopPropagation(); if (canWrite) setTarget({ entry: e }); }}>
    {e.status === "ok" ? <CircleCheck size={11} /> : e.status === "parcial" ? <CircleDot size={11} /> : <CircleAlert size={11} />}<span>{e.text}</span></button>;

  return <div className="v27 v31">
    <div className="page-header v4-page-header"><div className="v4-heading-copy">
      <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  LINHA DO TEMPO</div>
      <h1>Linha do tempo {mode === "consultor" ? "por consultor" : "do projeto"}</h1>
      <p>Quem esteve em qual cliente, em qual etapa, o que fez em cada dia e onde parou. Fases da esteira, agenda e cronograma entram sozinhos; o diário é preenchido aqui.</p>
    </div>
      <div className="v31-ctrl">
        <div className="seg">{([["consultor", "Por consultor", UserRound], ["projeto", "Por projeto", Building2]] as const).map(([k, l, I]) => <button key={k} type="button" className={mode === k ? "on" : ""} onClick={() => setMode(k)}><I size={14} /> {l}</button>)}</div>
        {mode === "consultor" ? <Select value={person} onChange={e => setPerson(e.target.value)} aria-label="Consultor"><option value="">Todos os consultores</option>{people.map(n => <option key={n}>{n}</option>)}</Select>
          : <Select value={projectId} onChange={e => setProjectId(e.target.value)} aria-label="Projeto"><option value="">Todos os projetos</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
      </div>
    </div>

    <div className="v31-bar">
      <div className="nav"><button type="button" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Semana anterior"><ChevronLeft size={16} /></button><b>{brS(from)} – {brS(to)}</b><button type="button" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Próxima semana"><ChevronRight size={16} /></button>{anchor !== mondayOf(today) && <button type="button" className="hoje" onClick={() => setAnchor(mondayOf(today))}>Hoje</button>}</div>
      <div className="seg sm">{[1, 2, 4].map(w => <button key={w} type="button" className={weeks === w ? "on" : ""} onClick={() => setWeeks(w)}>{w} sem</button>)}</div>
      <div className="seg sm">{([["linha", "Linha", ChartGantt], ["lista", "Lista", List]] as const).map(([k, l, I]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setView(k)}><I size={13} /> {l}</button>)}</div>
      <span className="sp" />
      {canWrite && <button type="button" className="btn primary small" onClick={() => openNew()}><Plus size={14} /> Registrar dia</button>}
      <button type="button" className="btn outline small" onClick={xlsx}><FileSpreadsheet size={14} /> Excel</button>
    </div>

    <section className="v31-kpis">
      <div><Rows3 size={16} /><b>{groups.length}</b><span>{mode === "consultor" ? "consultores no período" : "projetos"}</span></div>
      <div><CalendarDays size={16} /><b>{nDays}</b><span>dias registrados no diário</span></div>
      <div className={stops.length ? "bad" : ""}><CircleAlert size={16} /><b>{stops.length}</b><span>paradas / parciais</span></div>
      <div className="good"><ShieldCheck size={16} /><b>{termos}</b><span>termos finais entregues</span></div>
    </section>

    {(stops.length > 0 || blockers.length > 0) && <section className="v31-stops"><h3><CircleAlert size={16} /> Onde parou e por quê</h3><div>
      {stops.map(({ e, l }) => <button key={e.id} type="button" onClick={() => canWrite && setTarget({ entry: e })}><PersonPhoto name={e.person} size={22} /><span><b className="v32-nm"><ClientLogo clientId={cid(l.projectId)} size={18} />{l.client}</b><small>{brS(e.date)} · {e.person}</small><em>{e.reason || e.text}{e.blockedBy ? ` — travou por ${e.blockedBy}` : ""}</em></span><i className={`s-${e.status}`}>{STATUS_LABEL[e.status]}</i></button>)}
      {blockers.map(l => <button key={`b-${l.projectId}`} type="button" onClick={() => { const p = data.projects.find(x => x.id === l.projectId); if (p) onOpen(p); }}><span className="v31-bk">!</span><span><b>{l.client}</b><small>empecilho do projeto</small><em>{l.blocker}</em></span><i className="s-parado">Empecilho</i></button>)}
    </div></section>}

    {!groups.length && <div className="v27-panel v31-empty"><Sparkles size={22} /><b>Nada registrado neste período.</b><span>Preencha o cronograma do projeto, agende na Agenda ou clique em “Registrar dia”.</span></div>}

    {view === "linha" ? <div className="v31-groups" ref={scroller}>{groups.map((g, gi) => <section key={g.person} className="v27-panel v31-group" style={{ animationDelay: `${gi * 60}ms` }}>
      <header>{mode === "consultor" ? <PersonPhoto name={g.person} size={40} /> : (logoUrl(cid(g.lanes[0]?.projectId)) ? <ClientLogo clientId={cid(g.lanes[0]?.projectId)} name={g.person} size={40} wide /> : <span className="v31-cli">{g.person.slice(0, 1)}</span>)}
        <div><h2>{g.person}</h2><small>{mode === "consultor" ? `${new Set(g.lanes.map(l => l.projectId)).size} cliente(s)` : `${g.lanes.length} pessoa(s) / frente(s)`} · {g.days} dia(s) com registro{g.stops.length ? ` · ${g.stops.length} parada(s)` : ""}</small></div>
        {mode === "projeto" && g.lanes[0] && <button type="button" className="v17-link" onClick={() => { const p = data.projects.find(x => x.id === g.lanes[0].projectId); if (p) onOpen(p); }}>Abrir projeto →</button>}</header>
      <div className="v31-gantt">
        <div className="v31-axis"><span className="lbl" /><div className="days" style={{ gridTemplateColumns: gridCols }}>{days.map(d => { const w = new Date(d + "T12:00:00").getDay(); return <span key={d} className={`${d === today ? "today" : ""} ${w === 0 || w === 6 ? "we" : ""} ${w === 1 ? "mon" : ""}`}><b>{WD[w]}</b>{brS(d)}</span>; })}</div></div>
        {g.lanes.map((l, li) => { const st = stack(l.segs), nRows = Math.max(1, ...st.map(x => x.row + 1));
          return <div key={l.key} className="v31-lane" style={{ animationDelay: `${gi * 60 + li * 40}ms` }}>
            <div className="lbl">{mode === "consultor" ? <><b className="v32-nm"><ClientLogo clientId={cid(l.projectId)} size={18} />{l.client}</b><small>{l.segs.filter(s => s.kind !== "crono").slice(0, 2).map(s => s.label).join(" · ") || "sem etapa no período"}</small></>
              : <><span className="who">{l.person.startsWith("Cliente ·") ? <span className="v31-cli sm">C</span> : <PersonPhoto name={l.person} size={22} />}<b>{l.person.replace(/^Cliente · /, "Cliente · ")}</b></span><small>{[...new Set(l.segs.map(s => s.phase ? (s.kind === "fase" ? s.label : "") : "").filter(Boolean))].join(" · ") || `${l.segs.length} etapa(s)`}</small></>}
              {l.blocker && mode === "consultor" && <em title={l.blocker}>empecilho</em>}</div>
            <div className="track">
              <div className="bg" style={{ gridTemplateColumns: gridCols }}>{days.map(d => { const w = new Date(d + "T12:00:00").getDay(); return <button key={d} type="button" className={`${d === today ? "today" : ""} ${w === 0 || w === 6 ? "we" : ""}`} onClick={() => openNew(l, d)} aria-label={`Registrar ${brS(d)}`} disabled={!canWrite} />; })}</div>
              {days.includes(today) && <i className="now" style={{ left: `calc(${leftOf(today) + widthOf(today, today) / 2}% )` }} />}
              <div className="bars" style={{ height: nRows * 24 }}>{st.map(({ s, row }, k) => { const a = s.start < from ? from : s.start, b = s.end > to ? to : s.end;
                return <span key={s.id} className={`v31-seg k-${s.kind}`} style={{ left: `${leftOf(a)}%`, width: `${widthOf(a, b)}%`, top: row * 24, background: s.kind === "crono" ? undefined : PHASE_COLOR[s.phase || "none"], borderColor: PHASE_COLOR[s.phase || "none"], color: s.kind === "crono" ? PHASE_COLOR[s.phase || "none"] : undefined, animationDelay: `${120 + k * 50}ms` }} title={`${KIND_LABEL[s.kind]} · ${s.label}\n${br(s.start)} a ${br(s.end)}${s.detail ? `\n${s.detail}` : ""}${s.termo === "ok" ? "\nTermo final entregue" : s.termo === "pendente" ? "\nTermo final pendente" : ""}`}>
                  <span>{s.label} · {brS(s.start)}{s.end !== s.start ? `–${brS(s.end)}` : ""}</span>{s.termo === "ok" ? <ShieldCheck size={12} className="t-ok" /> : s.termo === "pendente" ? <i className="t-pend">termo</i> : null}</span>; })}</div>
              <div className="entries" style={{ gridTemplateColumns: gridCols }}>{days.map(d => { const es = l.entries.filter(e => e.date === d), ap = l.apps.filter(a => a.date === d);
                return <div key={d} className="cell" onClick={() => openNew(l, d)}>{es.map(e => <Chip key={e.id} e={e} />)}{!es.length && ap.length > 0 && <span className="ap" title={ap.map(a => `${a.title} · ${a.shift} · ${a.status}`).join("\n")}>{ap[0].shift === "Dia Inteiro" ? "●" : "◐"}</span>}</div>; })}</div>
            </div>
          </div>; })}
      </div>
    </section>)}</div>
      : <div className="v31-list">{groups.map(g => <section key={g.person} className="v27-panel v31-lg">
        <header>{mode === "consultor" ? <PersonPhoto name={g.person} size={34} /> : (logoUrl(cid(g.lanes[0]?.projectId)) ? <ClientLogo clientId={cid(g.lanes[0]?.projectId)} name={g.person} size={40} wide /> : <span className="v31-cli">{g.person.slice(0, 1)}</span>)}<h2>{g.person}</h2></header>
        {g.lanes.map(l => <div key={l.key} className="v31-lcli">
          <h4>{mode === "consultor" ? `Cliente ${l.client}` : l.person}</h4>
          {l.segs.filter(s => s.kind !== "crono").map(s => <p key={s.id} className="seg"><i style={{ background: PHASE_COLOR[s.phase || "none"] }} /><b>{s.label}</b> {br(s.start)}{s.end !== s.start ? ` a ${br(s.end)}` : ""}{s.termo === "ok" ? <em className="ok"> (termo final ✓)</em> : s.termo === "pendente" ? <em className="pend"> (termo pendente)</em> : null}</p>)}
          {l.entries.length ? <ul>{l.entries.map(e => <li key={e.id} className={`s-${e.status}`} onClick={() => canWrite && setTarget({ entry: e })}><b>{brS(e.date)}</b> – {e.text}{e.status !== "ok" && <em> · {STATUS_LABEL[e.status].toLowerCase()}: {e.reason}{e.blockedBy ? ` (${e.blockedBy})` : ""}</em>}</li>)}</ul>
            : <p className="none">Sem registros diários no período.{canWrite && <button type="button" onClick={() => openNew(l)}>Registrar</button>}</p>}
          {l.segs.some(s => s.kind === "crono") && <details><summary>{l.segs.filter(s => s.kind === "crono").length} atividade(s) do cronograma no período</summary>{l.segs.filter(s => s.kind === "crono").map(s => <p key={s.id} className="cr">{s.termo === "ok" ? "✔" : "○"} {brS(s.start)}{s.end !== s.start ? `–${brS(s.end)}` : ""} · {s.label}</p>)}</details>}
        </div>)}
      </section>)}</div>}

    <p className="v27-note">Barras cheias: fases da esteira e agenda (cor da fase) · barras vazadas: atividades do Cronograma de implantação · <ShieldCheck size={11} /> termo final da fase entregue · ● agenda dia inteiro / ◐ meio período. Clique num dia para registrar o que foi feito.</p>
    {target && <JournalDialog data={data} target={target} me={me} onClose={() => setTarget(null)} onSaved={async m => { await onRefresh(); notify(m); }} />}
  </div>;
}
