"use client";
// V29 · Raio-X: consultores × clientes × ondas lado a lado.
import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Download, Lightbulb, ScanSearch, Users, Building2, Waves } from "lucide-react";
import type { Project, State } from "@/lib/types";
import type { Snap } from "@/lib/evolucao";
import { raioX, type Trend } from "@/lib/raiox";
import { PHASES, healthLabel } from "@/lib/flow";
import { todayISO } from "@/lib/metrics";
import { brShort } from "@/lib/forecast";
import { PersonPhoto } from "./PersonPhoto";

type Props = { data: State; onOpen: (p: Project) => void; onNavigate: (path: string) => void };
type Tab = "consultores" | "clientes" | "ondas";
const short = (k: string) => PHASES.find(p => p.key === k)?.short || k;
const TrendTag = ({ t }: { t: Trend }) => !t ? <span className="v29-na">—</span> : <i className={`v27-trend ${t.d >= 3 ? "up" : t.d <= -3 ? "down" : "flat"}`} title={`${t.a} → ${t.b}`}>{t.d >= 3 ? "▲" : t.d <= -3 ? "▼" : "■"} {t.d > 0 ? `+${t.d}` : t.d}</i>;
const tone = (v: number | null, good: number, bad: number, inverse = false) => v === null ? "" : (inverse ? v <= good : v >= good) ? "good" : (inverse ? v >= bad : v <= bad) ? "bad" : "warn";
function csv(name: string, head: string[], rows: (string | number | null)[][]) {
  const q = (v: string | number | null) => { const s = v === null || v === undefined ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(["﻿" + [head, ...rows].map(r => r.map(q).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function RaioX({ data, onOpen, onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>("consultores"), [days, setDays] = useState(30), [snaps, setSnaps] = useState<{ today: string; rows: Snap[] } | null>(null);
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 }>({ k: "", d: -1 }), [openRow, setOpenRow] = useState<string | null>(null);
  useEffect(() => { fetch("/api/evolucao?dias=95", { cache: "no-store" }).then(r => r.json()).then(j => setSnaps({ today: j.today, rows: (j.rows || []).filter((r: Snap & { est?: boolean }) => !r.est) })).catch(() => setSnaps({ today: todayISO(), rows: [] })); }, []);
  const today = todayISO();
  const past = useMemo(() => { if (!snaps) return []; const lim = new Date(new Date(today + "T12:00:00").getTime() - days * 864e5).toISOString().slice(0, 10); const ds = [...new Set(snaps.rows.map(r => r.day))].sort(); const d = ds.filter(x => x >= lim)[0]; return d && d < today ? snaps.rows.filter(r => r.day === d) : []; }, [snaps, days, today]);
  const rx = useMemo(() => raioX(data, past, snaps?.rows || [], days, today), [data, past, snaps, days, today]);
  const sorted = <T,>(list: T[], get: Record<string, (x: T) => number | string | null>) => { if (!sort.k || !get[sort.k]) return list; const g = get[sort.k]; return [...list].sort((a, b) => { const x = g(a), y = g(b); if (x === y) return 0; if (x === null) return 1; if (y === null) return -1; return (x > y ? 1 : -1) * sort.d; }); };
  const Th = ({ k, children, title }: { k: string; children: React.ReactNode; title?: string }) => <th title={title}><button type="button" className={sort.k === k ? "on" : ""} onClick={() => setSort(s => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : -1 }))}>{children}{sort.k === k && <ArrowDownUp size={11} />}</button></th>;
  const sinceTxt = past[0]?.day ? `desde ${brShort(past[0].day)}` : "sem fotos suficientes ainda";

  const exportTab = () => {
    if (tab === "consultores") csv("raio-x-consultores.csv", ["Consultor", "Projetos", "Críticos", "Ritmo x meta", "Atividades abertas", "Vencidas", "Próximas ações", "% em dia", "Documentos a entregar", "Turnos semana", "Capacidade", "Carga %", "Saúde", "Tendência", "Visitas no período"],
      rx.consultants.map(c => [c.name, c.projects.length, c.red, c.pace.toFixed(2), c.openTasks, c.late, c.actions, c.actionsOkPct, c.docs, c.slots, c.cap, c.loadPct, c.health, c.trend?.d ?? null, c.visits]));
    else if (tab === "clientes") csv("raio-x-clientes.csv", ["Cliente", "Fase", "Dono da fase", "Onda", "Semáforo", "Dias úteis de projeto", "Dias sem movimento", "Go-live previsto", "Prometido", "Diferença (du)", "% bola fora", "Voltas de fase", "Pendências infra", "Docs faltando", "Atividades vencidas", "Visitas", "Risco", "Motivos"],
      rx.clients.map(c => [c.name, short(c.phase), c.owner, c.wave, healthLabel[c.health], c.ageBD, c.idle, c.forecast, c.promised, c.diff, c.ballOut, c.rework, c.infra, c.docsMissing, c.late, c.visits, c.risk, c.why.join(" | ")]));
    else csv("raio-x-ondas.csv", ["Onda", "Projetos", "Avanço médio", "Saúde", "Tendência", "Críticos", "Go-lives 30d", "Docs OK %", "Dias parados (média)", "% bola fora", ...PHASES.filter(p => p.key !== "fim").map(p => p.short)],
      rx.waves.map(w => [w.wave, w.count, w.progress, w.health, w.trend?.d ?? null, w.red, w.goLives, w.docsPct, w.idleAvg, w.ballOut, ...w.funnel.map(f => f.n)]));
  };

  return <div className="v27 v29-rx">
    <div className="page-header v4-page-header"><div className="v4-heading-copy">
      <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  RAIO-X</div>
      <h1>Raio-X da carteira</h1>
      <p>Consultores, clientes e ondas lado a lado: quem está sobrecarregado, quem trava, onde o funil entope.</p>
    </div>
      <div className="v29-rx-ctrl">
        <div className="seg">{[7, 30, 90].map(d => <button key={d} type="button" className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d} dias</button>)}</div>
        <button type="button" className="btn outline small v29-exp" onClick={exportTab}><Download size={14} /> Exportar CSV</button>
      </div>
    </div>
    <div className="v29-tabs" role="tablist">{([["consultores", "Consultores", Users, rx.consultants.length], ["clientes", "Clientes", Building2, rx.clients.length], ["ondas", "Ondas", Waves, rx.waves.length]] as const).map(([k, l, I, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setSort({ k: "", d: -1 }); setOpenRow(null); }}><I size={15} /> {l}<em>{n}</em></button>)}</div>
    <section className="v29-insight"><span className="ic"><Lightbulb size={18} /></span><div><b>Raio-X em 3 frases</b>{rx.tops[tab].slice(0, 3).map((t, i) => <p key={i}>{t}</p>)}</div></section>

    {tab === "consultores" && <section className="v27-panel"><div className="v29-tw"><table className="v29-rt">
      <thead><tr><th>Consultor</th><Th k="proj">Projetos</Th><Th k="red">Críticos</Th><Th k="pace" title="Dias reais ÷ meta nas fases concluídas (180 dias)">Ritmo</Th><Th k="late">Vencidas</Th><Th k="act" title="Próximas ações sob responsabilidade dele que estão no prazo">Ações em dia</Th><Th k="docs">Docs a entregar</Th><Th k="load" title="Turnos agendados na semana ÷ capacidade">Carga semana</Th><Th k="health">Saúde</Th><th>Tendência <small>{sinceTxt}</small></th><Th k="visits">Visitas</Th></tr></thead>
      <tbody>{sorted(rx.consultants, { proj: c => c.projects.length, red: c => c.red, pace: c => c.pace, late: c => c.late, act: c => c.actionsOkPct, docs: c => c.docs, load: c => c.loadPct, health: c => c.health, visits: c => c.visits }).map(c => <Fragment key={c.name}>
        <tr className={openRow === c.name ? "open" : ""} onClick={() => setOpenRow(openRow === c.name ? null : c.name)}>
          <td className="who"><PersonPhoto name={c.name} size={28} /><b>{c.name}</b></td>
          <td className="n">{c.projects.length}</td><td className={`n ${c.red ? "bad" : ""}`}>{c.red}</td>
          <td className={`n ${tone(c.pace, 1.1, 1.6, true)}`}>{c.pace.toFixed(1).replace(".", ",")}×{c.paceN < 2 && <small title="Sem histórico suficiente: média da equipe"> *</small>}</td>
          <td className={`n ${c.late ? "bad" : "good"}`}>{c.late}<small> / {c.openTasks}</small></td>
          <td className={`n ${tone(c.actionsOkPct, 80, 50)}`}>{c.actionsOkPct === null ? "—" : `${c.actionsOkPct}%`}<small> ({c.actions})</small></td>
          <td className={`n ${c.docsBlocking ? "bad" : c.docs ? "warn" : "good"}`}>{c.docs}{c.docsBlocking ? <small> · {c.docsBlocking} travando</small> : null}</td>
          <td className="bar">{c.loadPct === null ? <span className="v29-na">sem capacidade</span> : <><i><s className={c.loadPct > 100 ? "bad" : c.loadPct > 80 ? "warn" : "good"} style={{ width: `${Math.min(100, c.loadPct)}%` }} /></i><span>{c.slots}/{c.cap} · {c.loadPct}%</span></>}</td>
          <td className={`n ${tone(c.health, 70, 45)}`}>{c.health ?? "—"}</td><td><TrendTag t={c.trend} /></td><td className="n">{c.visits}</td>
        </tr>
        {openRow === c.name && <tr className="det"><td colSpan={11}><div className="v29-det">{c.projects.length ? c.projects.map(p => { const cl = rx.clients.find(x => x.p.id === p.id); return <button key={p.id} type="button" className={`v27-proj h-${cl?.health}`} onClick={() => onOpen(p)}><span className="top"><b>{cl?.name}</b><i className={`dot h-${cl?.health}`} /></span><small>{short(cl?.phase || "")} · risco {cl?.risk}/100</small>{cl?.why[0] && <em>{cl.why[0]}</em>}</button>; }) : <span className="v29-na">Nenhum projeto como dono da fase.</span>}</div></td></tr>}
      </Fragment>)}</tbody></table></div>
      <p className="v27-note">* ritmo sem histórico próprio: usa a média da equipe. Clique na linha para ver os projetos.</p></section>}

    {tab === "clientes" && <section className="v27-panel"><div className="v29-tw"><table className="v29-rt">
      <thead><tr><th>Cliente</th><th>Fase · dono</th><Th k="risk">Risco</Th><Th k="age">Dias de projeto</Th><Th k="idle">Parado</Th><Th k="diff">Previsto × prometido</Th><Th k="ball" title={`% do tempo com a bola fora da WMS Expert nos últimos ${days} dias`}>Bola fora</Th><Th k="rw">Voltas</Th><Th k="infra">Infra</Th><Th k="docs">Docs</Th><Th k="late">Vencidas</Th><Th k="vis">Visitas</Th></tr></thead>
      <tbody>{sorted(rx.clients, { risk: c => c.risk, age: c => c.ageBD, idle: c => c.idle, diff: c => c.diff, ball: c => c.ballOut, rw: c => c.rework, infra: c => c.infra, docs: c => c.docsMissing, late: c => c.late, vis: c => c.visits }).map((c, i) => <tr key={c.p.id} className={!sort.k && i < 5 ? "top5" : ""} onClick={() => onOpen(c.p)}>
        <td><b>{c.name}</b><small className="why">{c.why.join(" · ") || "sem alertas"}</small></td>
        <td><small>{short(c.phase)} · {c.wave}</small><span className="own"><PersonPhoto name={c.owner} size={16} />{c.owner}</span></td>
        <td className="risk"><span className={`rk ${c.risk >= 60 ? "bad" : c.risk >= 30 ? "warn" : "good"}`}>{c.risk}</span></td>
        <td className="n">{c.ageBD ?? "—"}</td><td className={`n ${tone(c.idle, 3, 7, true)}`}>{c.idle ?? "—"}d</td>
        <td className={`n ${c.diff === null ? "" : c.diff > 0 ? "bad" : "good"}`}>{c.forecast ? brShort(c.forecast) : "—"}{c.promised ? <small> × {brShort(c.promised)}</small> : <small> · sem data</small>}</td>
        <td className={`n ${tone(c.ballOut, 30, 60, true)}`}>{c.ballOut}%</td><td className={`n ${c.rework ? "bad" : ""}`}>{c.rework}</td>
        <td className={`n ${c.infra ? "warn" : ""}`}>{c.infra}</td><td className={`n ${c.docsMissing ? "warn" : ""}`}>{c.docsMissing}</td><td className={`n ${c.late ? "bad" : ""}`}>{c.late}</td><td className="n">{c.visits}</td>
      </tr>)}</tbody></table></div>
      <p className="v27-note">Risco 0–100 soma: semáforo, dias parado, atraso vs data prometida, bola fora, voltas de fase, pendências de infra, documentos e atividades vencidas. Os 5 maiores ficam destacados.</p></section>}

    {tab === "ondas" && <section className="v29-waves">{rx.waves.map(w => { const max = Math.max(1, ...w.funnel.map(f => f.n)); return <div key={w.wave} className="v27-panel v29-wave">
      <header><h2><Waves size={16} /> {w.wave}</h2><span className="cnt">{w.count} projeto(s)</span></header>
      <div className="kp"><div><small>Avanço médio</small><b>{w.progress ?? "—"}%</b></div><div><small>Saúde</small><b className={tone(w.health, 70, 45)}>{w.health ?? "—"}</b><TrendTag t={w.trend} /></div><div><small>Críticos</small><b className={w.red ? "bad" : "good"}>{w.red}</b></div><div><small>Go-lives 30d</small><b>{w.goLives}</b></div><div><small>Docs OK</small><b className={tone(w.docsPct, 80, 50)}>{w.docsPct ?? "—"}%</b></div><div><small>Parado (média)</small><b className={tone(w.idleAvg, 3, 7, true)}>{w.idleAvg ?? "—"}d</b></div></div>
      <div className="fn">{w.funnel.map(f => <div key={f.key} className="fr"><span>{f.short}</span><i><s style={{ width: `${f.n / max * 100}%` }} /></i><b>{f.n}</b></div>)}</div>
      <p className="v29-wball">Bola fora da WMS Expert em {w.ballOut}% dos projetos agora.</p>
      <button type="button" className="v17-link" onClick={() => onNavigate("/esteira")}>Abrir na esteira →</button>
    </div>; })}</section>}
    {!snaps && <p className="v27-note"><ScanSearch size={12} /> Carregando o histórico…</p>}
  </div>;
}
