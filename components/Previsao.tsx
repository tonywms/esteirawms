"use client";
// V27 · Previsão de go-live: quando cada projeto deve virar, comparado com a data prometida ao cliente.
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck2, CalendarClock, CheckCircle2, Gauge, Rocket, Target } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { forecastAll, paceByOwner, STATUS_LABEL, addBD, br, brShort, type Forecast } from "@/lib/forecast";
import { PHASES } from "@/lib/flow";
import { todayISO } from "@/lib/metrics";
import { PersonPhoto } from "./PersonPhoto";
import ConfirmDialog, { type ConfirmBox } from "./ConfirmDialog";

type Props = { data: State; onRefresh: () => Promise<void> | void; onOpen: (p: Project) => void };
type Filter = "todos" | "30" | "risco" | "sem-data" | "virou";
const PH_COLOR: Record<string, string> = { kickoff: "#8b6cf6", dev: "#3b82f6", homolog: "#16b8d4", campo: "#f2994a", golive: "#2fbf71" };
const short = (k: string) => PHASES.find(p => p.key === k)?.short || k;
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const dayN = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5);
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function Previsao({ data, onRefresh, onOpen }: Props) {
  const today = todayISO();
  const all = useMemo(() => [...forecastAll(data, today).values()], [data, today]);
  const pace = useMemo(() => paceByOwner(data, today), [data, today]);
  const [filter, setFilter] = useState<Filter>("todos"), [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null);
  const in30 = addDays(today, 30);
  const open = all.filter(f => f.status !== "virou");
  const counts = { todos: all.length, "30": open.filter(f => f.forecast <= in30).length, risco: open.filter(f => f.status === "risco" || f.status === "atrasado").length, "sem-data": open.filter(f => f.status === "sem-data").length, virou: all.filter(f => f.status === "virou").length };
  const list = all.filter(f => filter === "todos" ? true : filter === "30" ? f.status !== "virou" && f.forecast <= in30 : filter === "risco" ? f.status === "risco" || f.status === "atrasado" : f.status === filter)
    .sort((a, b) => (a.status === "virou" ? 1 : 0) - (b.status === "virou" ? 1 : 0) || a.forecast.localeCompare(b.forecast));
  const end = (() => { const m = [addDays(today, 42), ...list.map(f => f.forecast), ...list.map(f => f.promised || today)].sort().pop()!; return m > addDays(today, 150) ? addDays(today, 150) : addDays(m, 4); })();
  const span = Math.max(14, dayN(today, end));
  const x = (d: string) => `${Math.max(0, Math.min(100, (dayN(today, d) / span) * 100))}%`;
  const ticks: { d: string; label: string; month: boolean }[] = [];
  for (let d = today, i = 0; d <= end && i < 400; d = addDays(d, 1), i++) { const dt = new Date(d + "T12:00:00"); if (dt.getDate() === 1) ticks.push({ d, label: MONTHS[dt.getMonth()], month: true }); else if (dt.getDay() === 1 && span <= 70 && dayN(today, d) >= 3 && dt.getDate() > 3) ticks.push({ d, label: String(dt.getDate()), month: false }); }
  const noDate = open.filter(f => !f.promised);

  function promise(fs: Forecast[]) {
    if (!fs.length) return;
    setConfirmBox({
      title: fs.length === 1 ? `Prometer ${br(fs[0].forecast)} para ${fs[0].client}?` : `Usar a previsão como data prometida em ${fs.length} projetos?`,
      message: "A data prevista vira a data de go-live combinada (campo Go-live do projeto). A partir daí a tela mostra se o projeto está no prazo, em risco ou atrasado em relação a ela. Dá para mudar depois em Editar projeto.",
      details: fs.slice(0, 6).map(f => ({ label: f.client, value: br(f.forecast) })),
      note: fs.length > 6 ? `+${fs.length - 6} projetos` : undefined,
      confirmLabel: fs.length === 1 ? "Prometer esta data" : `Prometer ${fs.length} datas`, tone: "info",
      onConfirm: async () => {
        for (const f of fs) {
          const tl = [{ id: crypto.randomUUID(), at: new Date().toISOString(), kind: "nota", text: `Go-live prometido para ${br(f.forecast)} (previsão da esteira)` }, ...(f.p.timeline || [])];
          const r = await fetch(`/api/records/projects/${f.p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goLiveDate: f.forecast, timeline: tl }) });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Não foi possível salvar ${f.client}.`); }
        }
        await onRefresh();
      },
    });
  }

  return <div className="v27">
    <div className="page-header v4-page-header"><div className="v4-heading-copy">
      <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  PREVISÃO DE GO-LIVE</div>
      <h1>Quando cada cliente vai virar</h1>
      <p>Previsão calculada pela fase atual, pelas metas de cada fase e pelo ritmo real de quem é dono da fase. Compare com a data prometida ao cliente.</p>
    </div></div>

    <section className="v27-kpis">
      <div className="v27-kpi"><span className="i c"><Rocket size={18} /></span><div><strong>{counts["30"]}</strong><em>Viradas previstas em 30 dias</em></div></div>
      <div className="v27-kpi"><span className={`i ${counts.risco ? "r" : "g"}`}><AlertTriangle size={18} /></span><div><strong>{counts.risco}</strong><em>Em risco ou atrasados vs prometido</em></div></div>
      <div className="v27-kpi"><span className={`i ${counts["sem-data"] ? "a" : "g"}`}><CalendarClock size={18} /></span><div><strong>{counts["sem-data"]}</strong><em>Sem data prometida ao cliente</em></div></div>
      <div className="v27-kpi"><span className="i v"><Gauge size={18} /></span><div><strong>{pace.global.toFixed(1).replace(".", ",")}×</strong><em>Ritmo da equipe vs meta{pace.samples ? ` (${pace.samples} fases)` : " (sem histórico: usando a meta)"}</em></div></div>
    </section>

    {noDate.length > 0 && <div className="v27-banner"><CalendarCheck2 size={18} /><span><b>{noDate.length} projeto(s) sem data de go-live prometida.</b> Sem ela não dá para saber se está no prazo. Você pode adotar a previsão como ponto de partida e ajustar depois.</span><button type="button" className="btn primary" onClick={() => promise(noDate)}>Prometer as previsões</button></div>}

    <section className="v27-panel">
      <header>
        <div className="v27-filters" role="tablist">{([["todos", "Todos"], ["30", "Próximos 30 dias"], ["risco", "Em risco"], ["sem-data", "Sem data prometida"], ["virou", "Já viraram"]] as [Filter, string][]).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}<em>{counts[k]}</em></button>)}</div>
        <div className="v27-legend">{PHASES.filter(p => PH_COLOR[p.key] && p.key !== "golive").map(p => <span key={p.key}><i style={{ background: PH_COLOR[p.key] }} />{p.short}</span>)}<span><i className="dia" />Prometido</span><span><Rocket size={12} />Previsto</span></div>
      </header>
      <div className="v27-gantt">
        <div className="v27-axis"><span className="lbl" /><div className="track">{ticks.map(t => <span key={t.d} className={t.month ? "m" : ""} style={{ left: x(t.d) }}>{t.label}</span>)}<span className="today" style={{ left: 0 }}>hoje</span></div><span className="col">Previsto</span><span className="col">Prometido</span></div>
        {list.map(f => {
          let cur = today;
          const segs = f.steps.map(s => { const a = cur; cur = addBD(cur, s.days); return { ...s, a, b: cur }; });
          return <div key={f.p.id} className={`v27-row s-${f.status}`}>
            <button type="button" className="lbl" onClick={() => onOpen(f.p)} title="Abrir o projeto"><b>{f.client}</b><small><PersonPhoto name={f.owner} size={16} />{short(f.phase)} · {f.owner}</small></button>
            <div className="track" title={f.reason}>
              {ticks.filter(t => t.month).map(t => <i key={t.d} className="grid" style={{ left: x(t.d) }} />)}
              {f.status === "virou" ? <span className="done-flag" style={{ left: 0 }}><CheckCircle2 size={13} /> virou {brShort(f.forecast)}</span>
                : segs.map((s, i) => <span key={i} className={`seg ${s.current ? "cur" : ""}`} style={{ left: x(s.a), width: `calc(${x(s.b)} - ${x(s.a)})`, background: PH_COLOR[s.phase] }} title={`${short(s.phase)}: ${s.days} dias úteis`} />)}
              {f.status !== "virou" && <span className="rocket" style={{ left: x(f.forecast) }}><Rocket size={13} /></span>}
              {f.promised && <span className="dia" style={{ left: x(f.promised) }} title={`Prometido ${br(f.promised)}`} />}
            </div>
            <span className="col fc"><b>{br(f.forecast)}</b><small className={`conf c-${f.confidence}`}>confiança {f.confidence}</small></span>
            <span className="col pr">{f.promised ? <><b>{br(f.promised)}</b><small className={`st s-${f.status}`}>{f.status === "virou" ? STATUS_LABEL.virou : f.diff! > 0 ? `${f.diff} du depois` : f.diff! < 0 ? `${-f.diff!} du antes` : "no dia"}</small></>
              : f.status === "virou" ? <small className="st s-virou">—</small> : <button type="button" className="v27-promise" onClick={() => promise([f])}><Target size={12} /> Prometer</button>}</span>
          </div>;
        })}
        {!list.length && <div className="v7-empty"><CheckCircle2 /> Nenhum projeto neste filtro</div>}
      </div>
      <p className="v27-note">Como é calculado: dias úteis que faltam na fase atual (meta × ritmo do dono − dias já gastos; se já passou da meta, conta mais metade) + metas das fases seguintes até a virada (Kickoff 1 · Dev 10 · Homologação 5 · Implantação 5). Empecilho aberto soma 2 dias. Passe o mouse na barra para ver o motivo.</p>
    </section>
    {confirmBox && <ConfirmDialog box={confirmBox} onClose={() => setConfirmBox(null)} />}
  </div>;
}
