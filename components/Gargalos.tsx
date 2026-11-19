"use client";
// V17 · Mapa de gargalos: onde todos os projetos travam, quem segura e o que atacar primeiro.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Crosshair, Database, Flame, Gauge, Hand, Monitor, RefreshCw, Timer } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { DIMS, CYCLE_GOAL, PHASE_GOALS, attackFirst, dataQuality, gargalosSummary, heatmap, phaseTimes, type DimKey, type GroupBy } from "@/lib/gargalos";
import { PHASES } from "@/lib/flow";
import { todayISO } from "@/lib/metrics";
import { avatarUrl } from "@/lib/avatars";
import { PersonPhoto } from "./PersonPhoto";
import ConfirmDialog, { type ConfirmBox } from "./ConfirmDialog";

type Props = { data: State; onRefresh: () => Promise<void> | void; onOpen: (p: Project) => void; onNavigate: (path: string) => void };
const VIEWS: { key: GroupBy; label: string }[] = [{ key: "fase", label: "Fase" }, { key: "consultor", label: "Consultor" }, { key: "cliente", label: "Cliente" }, { key: "onda", label: "Onda" }];
const TITLE: Record<GroupBy, string> = { fase: "por fase", consultor: "por dono da fase", cliente: "por cliente (os 12 mais afetados)", onda: "por onda" };
const LEVEL = ["vazio", "ok", "atenção", "alto", "crítico"];

export default function Gargalos({ data, onRefresh, onOpen, onNavigate }: Props) {
  const [by, setBy] = useState<GroupBy>("fase");
  const [sel, setSel] = useState<{ row: string; dim: DimKey } | null>(null);
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null);
  useEffect(() => { // /gargalos?fase=dev abre o mapa já na fase
    const f = new URLSearchParams(window.location.search).get("fase");
    if (f && PHASES.some(p => p.key === f)) { setBy("fase"); setSel({ row: f, dim: "meta" }); }
  }, []);
  const map = useMemo(() => heatmap(data, by), [data, by]);
  const sum = useMemo(() => gargalosSummary(data), [data]);
  const attack = useMemo(() => attackFirst(map.heats), [map.heats]);
  const times = useMemo(() => phaseTimes(data, map.heats), [data, map.heats]);
  const dq = useMemo(() => dataQuality(data, map.heats), [data, map.heats]);

  // seleção padrão: a célula mais quente
  const current = useMemo(() => {
    if (sel && map.rows.some(r => r.key === sel.row)) return sel;
    let best: { row: string; dim: DimKey; lv: number; n: number } | null = null;
    for (const r of map.rows) for (const d of DIMS) { const c = r.cells[d.key]; if (!best || c.level > best.lv || (c.level === best.lv && c.hits.length > best.n)) best = { row: r.key, dim: d.key, lv: c.level, n: c.hits.length }; }
    return best ? { row: best.row, dim: best.dim } : null;
  }, [sel, map.rows]);
  const selRow = current ? map.rows.find(r => r.key === current.row) : null;
  const selDim = current ? DIMS.find(d => d.key === current.dim)! : null;
  const selCell = selRow && selDim ? selRow.cells[selDim.key] : null;
  function startClock(list: typeof dq.noStartList) {
    if (!list.length) return;
    const today = todayISO();
    setConfirmBox({
      title: `Começar a contar a meta hoje (${list.length} projeto${list.length > 1 ? "s" : ""})?`,
      message: "Esses projetos não têm a data de início da fase atual, então ainda não entram no “Fora da meta”. A data de hoje vira o início da fase de cada um, e a contagem em dias úteis começa a partir de agora.",
      details: list.slice(0, 6).map(h => ({ label: h.client, value: PHASES.find(p => p.key === h.phase)?.short || "" })),
      note: list.length > 6 ? `+${list.length - 6} projetos. Você pode ajustar a data de qualquer um depois, no card da esteira.` : "Você pode ajustar a data de qualquer um depois, no card da esteira.",
      confirmLabel: "Começar a contar",
      tone: "info",
      onConfirm: async () => {
        for (const h of list) {
          const phases = { ...(h.p.phases || {}), [h.phase]: { ...(h.p.phases?.[h.phase] || {}), start: today } };
          const r = await fetch(`/api/records/projects/${h.p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phases }) });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Não foi possível salvar ${h.client}.`); }
        }
        await onRefresh();
      },
    });
  }
  const maxTime = Math.max(12, ...times.map(t => Math.max(t.avg ?? 0, t.goal.limit))) * 1.1;

  return <div className="v17">
    <div className="page-header v4-page-header">
      <div className="v4-heading-copy">
        <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  MAPA DE GARGALOS</div>
        <h1>Onde a esteira está travando</h1>
        <p>Atrasos, tempo parado, empecilhos, estouro de meta, retrabalho e bola fora de todos os projetos, num só lugar.</p>
      </div>
      <div className="header-actions">
        <button className="btn ghost v4-secondary-action" onClick={() => void onRefresh()}><RefreshCw size={16} /> Atualizar</button>
        <a className="btn primary v4-primary-action" href="/tv" target="_blank" rel="noreferrer"><Monitor size={17} /> Modo TV</a>
      </div>
    </div>

    <section className="v17-kpis">
      <div className="v17-kpi"><span className="ic cyan"><Gauge size={19} /></span><div><em>Dentro da meta da fase</em><strong>{sum.pctInGoal === null ? "—" : `${sum.pctInGoal}%`}</strong><small>{sum.withGoal ? `${sum.inGoal} de ${sum.withGoal} com data de início · ${sum.overDays} dias úteis acima` : "Nenhum projeto com data de início da fase"}</small></div></div>
      <div className="v17-kpi"><span className="ic red"><Flame size={19} /></span><div><em>Maior gargalo agora</em><strong className="txt">{sum.worst?.label || "—"}</strong><small>{sum.worst ? `${sum.worst.total} projeto(s) · ${sum.hot.filter(h => h.row === sum.worst!.label).map(h => h.dim.toLowerCase()).join(", ") || "sem célula crítica"}` : "Nenhum projeto ativo"}</small></div></div>
      <div className="v17-kpi"><span className="ic amber"><Hand size={19} /></span><div><em>Tempo parado fora da WMS</em><strong>{sum.idleOutPct}%</strong><small>dos dias parados estão com cliente ou ERP parceiro</small></div></div>
      <div className="v17-kpi"><span className="ic navy"><Timer size={19} /></span><div><em>Ciclo kickoff → go-live</em><strong>{sum.cycle.avg === null ? "—" : `${sum.cycle.avg}du`}</strong><small>{sum.cycle.n ? `média de ${sum.cycle.n} projeto(s) · meta até ${CYCLE_GOAL} dias úteis` : `meta até ${CYCLE_GOAL} dias úteis · histórico começa a contar agora`}</small></div></div>
    </section>

    <div className="v17-toolbar">
      <div className="v17-seg" role="group" aria-label="Ver por"><span>Ver por</span>{VIEWS.map(v => <button key={v.key} type="button" className={by === v.key ? "on" : ""} aria-pressed={by === v.key} onClick={() => { setBy(v.key); setSel(null); }}>{v.label}</button>)}</div>
      <div className="v17-scale"><em>Intensidade</em><i className="l1">ok</i><i className="l2">atenção</i><i className="l3">alto</i><i className="l4">crítico</i></div>
    </div>

    <div className="v17-main">
      <section className="v17-panel v17-heat">
        <header><h2>Mapa de calor · {TITLE[by]}</h2><small>Clique numa célula para ver os projetos</small></header>
        <div className="v17-grid-wrap">
          <div className="v17-grid" style={{ gridTemplateColumns: `minmax(150px,1.3fr) repeat(${DIMS.length}, minmax(86px,1fr))` }}>
            <span />
            {DIMS.map(d => <span key={d.key} className="v17-colh"><b>{d.label}</b><small>{d.sub}</small></span>)}
            {map.rows.map(r => <div key={r.key} className="v17-row" style={{ display: "contents" }}>
              <span className={`v17-rowh ${by === "consultor" && avatarUrl(r.label) ? "v19-rowh" : ""}`}>{by === "consultor" && <PersonPhoto name={r.label} size={30} />}<span><b title={r.label}>{r.label}</b><small>{r.sub}</small></span></span>
              {DIMS.map(d => { const c = r.cells[d.key]; const on = current?.row === r.key && current?.dim === d.key;
                return <button key={d.key} type="button" className={`v17-cell l${c.level} ${on ? "on" : ""}`} disabled={!c.hits.length && !c.missing.length && c.level === 0} aria-label={`${r.label}, ${d.label}: ${c.text} (${LEVEL[c.level]})`} onClick={() => setSel({ row: r.key, dim: d.key })}><b>{c.text}</b><small>{c.sub}</small></button>; })}
            </div>)}
          </div>
          {!map.rows.length && <div className="v7-empty"><CheckCircle2 /> Nenhum projeto ativo na esteira</div>}
        </div>

        {selRow && selDim && selCell && <div className="v17-drill">
          <header><h3>{selRow.label} × {selDim.label} — {selCell.hits.length ? `${selCell.hits.length} projeto${selCell.hits.length > 1 ? "s" : ""}` : "nenhum projeto"}</h3><span className={`v17-badge l${selCell.level}`}>{LEVEL[selCell.level]}</span></header>
          {selCell.hits.length ? <div className="v17-list">
            {selCell.hits.slice(0, 12).map(h => <button key={h.p.id} type="button" className="v17-item" onClick={() => onOpen(h.p)}>
              <span className="who"><b>{h.client}</b><small>{PHASES.find(p => p.key === h.phase)?.short} · {h.owner}</small></span>
              <span className={`val l${h.dims[selDim.key].sev}`}>{h.dims[selDim.key].text}</span>
              <span className="why">{h.dims[selDim.key].reason}</span>
              <span className={`ball ${h.ball === "WMS Expert" ? "wms" : h.ball === "Cliente" ? "cli" : "erp"}`}><Hand size={12} />{h.ball}</span>
              <ArrowRight size={15} className="go" />
            </button>)}
            {selCell.hits.length > 12 && <small className="v17-more">+{selCell.hits.length - 12} projetos</small>}
          </div> : !selCell.missing.length && <div className="v7-empty"><CheckCircle2 /> Nada travando aqui</div>}
          {selCell.missing.length > 0 && <div className="v17-missing">
            <span><b>{selCell.missing.length} projeto{selCell.missing.length > 1 ? "s" : ""} sem data de início da fase</b> · ainda não entram na conta da meta: {selCell.missing.slice(0, 6).map(h => h.client).join(", ")}{selCell.missing.length > 6 ? "…" : ""}</span>
            <button type="button" onClick={() => startClock(selCell.missing)}>Começar a contar hoje</button>
          </div>}
        </div>}
      </section>

      <aside className="v17-side">
        <section className="v17-panel v17-attack">
          <header><h2><Crosshair size={17} /> Atacar primeiro</h2><small>Gravidade, dias perdidos e proximidade do go-live</small></header>
          {attack.length ? attack.map((a, i) => <button key={a.h.p.id} type="button" className="v17-target" onClick={() => onOpen(a.h.p)}>
            <span className={`rank r${i < 2 ? 1 : i < 4 ? 2 : 3}`}>{i + 1}</span>
            <span className="txt"><b>{a.h.client} <small>· {PHASES.find(p => p.key === a.h.phase)?.short}</small></b><em>{a.problem}</em><i>→ {a.next}</i></span>
          </button>) : <div className="v7-empty"><CheckCircle2 /> Nenhum projeto com problema</div>}
        </section>
        <section className="v17-panel v17-dq">
          <header><h2><Database size={16} /> Qualidade dos dados</h2><small>O mapa só é confiável com a esteira alimentada</small></header>
          <div className="row"><span>Projetos sem próxima ação</span><b className={dq.noNext ? "bad" : "good"}>{dq.noNext} de {dq.total}</b></div>
          <div className="row"><span>Atividades abertas sem prazo</span><b className={dq.noDue ? "warn" : "good"}>{dq.noDue}</b></div>
          <div className="row"><span>Fase atual sem data de início</span><b className={dq.noStart ? "warn" : "good"}>{dq.noStart}</b></div>
          {dq.noStart > 0 && <button type="button" className="v17-link" onClick={() => startClock(dq.noStartList)}>Começar a contar a meta hoje <ArrowRight size={14} /></button>}
          <button type="button" className="v17-link" onClick={() => onNavigate("/esteira")}>Completar na esteira <ArrowRight size={14} /></button>
        </section>
      </aside>
    </div>

    <section className="v17-panel v17-times">
      <header><h2><Clock3 size={17} /> Tempo real por fase × meta</h2><small>Dias úteis · projetos na fase agora + fases concluídas nos últimos 90 dias</small></header>
      {times.map(t => { const over = t.avg !== null && t.avg > t.goal.limit, tol = t.avg !== null && t.avg > t.goal.goal && !over;
        return <div key={t.key} className="v17-time">
          <span className="lbl"><b>{t.label}</b><small>meta {t.goal.text}</small></span>
          <span className="track">
            {t.goal.limit > t.goal.goal && <i className="tol" style={{ left: `${t.goal.goal / maxTime * 100}%`, width: `${(t.goal.limit - t.goal.goal) / maxTime * 100}%` }} />}
            {t.avg !== null && <i className={`bar ${over ? "over" : tol ? "tol" : "ok"}`} style={{ width: `${Math.max(2, Math.min(100, t.avg / maxTime * 100))}%` }} />}
            <i className="goal" style={{ left: `${t.goal.limit / maxTime * 100}%` }} />
          </span>
          <span className={`val ${over ? "over" : tol ? "tol" : "ok"}`}>{t.avg === null ? "sem dados" : `${t.avg} du`}<small>{t.n ? `${t.n} proj.${t.over ? ` · ${t.over} acima` : ""}` : ""}</small></span>
        </div>; })}
      <p className="v17-foot"><AlertTriangle size={13} /> A linha escura marca o limite da fase; na Implantação a faixa clara é a tolerância (5 a 10 dias úteis). Kickoff/endereçamento: {PHASE_GOALS.kickoff.text}.</p>
    </section>
    {confirmBox && <ConfirmDialog box={confirmBox} onClose={() => setConfirmBox(null)} />}
  </div>;
}
