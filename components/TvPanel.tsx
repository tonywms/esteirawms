"use client";
// V7 · Painel de TV: tela cheia, leitura à distância, atualiza a cada 30s e alterna 2 visões a cada 20s.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, FileX2, Hand, Maximize2, Rocket, Timer } from "lucide-react";
import type { State } from "@/lib/types";
import { PHASES, ballOf, docStates, flowSummary, phaseOwner, type Health } from "@/lib/flow";
import { fmtDate, todayISO } from "@/lib/metrics";

const ROTATE_MS = 20000, REFRESH_MS = 30000;
const empty: State = { version: 1, importedAt: "", sourceFile: "", clients: [], projects: [], tasks: [], appointments: [], staff: [], users: [], audit: [] };
const order: Record<Health, number> = { red: 0, amber: 1, green: 2, done: 3 };

export default function TvPanel() {
  const [data, setData] = useState<State>(empty), [updated, setUpdated] = useState<Date | null>(null), [err, setErr] = useState("");
  const [view, setView] = useState(0), [now, setNow] = useState(() => new Date());
  const load = useCallback(async () => {
    try { const r = await fetch("/api/state", { cache: "no-store" }); if (!r.ok) throw new Error(r.status === 401 ? "Link da TV expirado: abra novamente o link com a chave." : "Falha ao carregar"); setData(await r.json()); setUpdated(new Date()); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Sem conexão"); }
  }, []);
  useEffect(() => { void load(); const a = setInterval(() => void load(), REFRESH_MS), b = setInterval(() => setView(v => (v + 1) % 2), ROTATE_MS), c = setInterval(() => setNow(new Date()), 1000); return () => { clearInterval(a); clearInterval(b); clearInterval(c); }; }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") setView(v => (v + 1) % 2); if (e.key === "f") void document.documentElement.requestFullscreen?.(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const s = useMemo(() => flowSummary(data), [data]);
  const name = (id: string) => data.clients.find(c => c.id === id)?.name || "Cliente";
  const today = todayISO();
  const agenda = data.appointments.filter(a => a.date === today && a.status !== "Cancelado").sort((a, b) => a.consultant.localeCompare(b.consultant));
  const active = s.reports.filter(r => r.h.health !== "done").length;

  return <div className="v7-tv" onDoubleClick={() => void document.documentElement.requestFullscreen?.()}>
    <header className="v7-tv-head">
      <img src="/wms-expert-logo.png" alt="WMS Expert" />
      <div className="v7-tv-title"><span>ESTEIRA DE ENTREGAS · AO VIVO</span><strong>{view === 0 ? "Esteira por fases" : "Gargalos, go-lives e agenda"}</strong></div>
      <div className="v7-tv-views">{[0, 1].map(i => <i key={i} className={view === i ? "on" : ""} />)}</div>
      <div className="v7-tv-clock"><strong>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong><small>{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</small></div>
      <button className="v7-tv-full" onClick={() => void document.documentElement.requestFullscreen?.()} aria-label="Tela cheia"><Maximize2 size={18} /></button>
    </header>

    <section className="v7-tv-kpis">
      <div className="k red"><AlertTriangle /><strong>{s.red}</strong><span>Críticos</span></div>
      <div className="k amber"><Clock3 /><strong>{s.amber}</strong><span>Atenção</span></div>
      <div className="k green"><CheckCircle2 /><strong>{s.green}</strong><span>No fluxo</span></div>
      <div className="k cyan"><Rocket /><strong>{s.goLives.length}</strong><span>Go-lives em 7 dias</span></div>
      <div className="k ball"><Hand /><div>{s.ball.map(b => <b key={b.name}><i>{b.count}</i>{b.name}</b>)}</div><span>Bola com · {active} ativos</span></div>
    </section>

    {view === 0 ? <section className="v7-tv-flow" style={{ gridTemplateColumns: `repeat(${PHASES.length}, minmax(0,1fr))` }}>
      {s.byPhase.map((ph, i) => <div key={ph.key} className={`col ${ph.key === "fim" ? "done" : ""}`}>
        <header><span>{i + 1}</span><strong>{ph.short}</strong><em>{ph.items.length}</em></header>
        <div className="list">{[...ph.items].sort((a, b) => order[a.h.health] - order[b.h.health]).slice(0, 8).map(({ p, h }) =>
          <div key={p.id} className={`c ${h.health}`}><strong>{name(p.clientId)}</strong><small>{phaseOwner(p)} · {h.inPhase ?? 0}d</small>{h.health !== "done" && docStates(p).some(d => d.state === "pending" || d.state === "missing") && <em className="pdf" title="Documento pendente"><FileX2 />PDF</em>}</div>)}
          {ph.items.length > 8 && <div className="more">+{ph.items.length - 8} projetos</div>}
        </div>
      </div>)}
    </section> : <section className="v7-tv-split">
      <div className="panel-tv">
        <h3><AlertTriangle /> Gargalos e empecilhos <em>{s.critical.length + s.attention.length}</em></h3>
        <div className="rows">{[...s.critical, ...s.attention].slice(0, 7).map(({ p, h }) => <div key={p.id} className={`row ${h.health}`}>
          <i />
          <div><strong>{name(p.clientId)}</strong><small>{h.reasons[0] || ""}</small></div>
          <span className="ball"><Hand size={15} />{ballOf(p)}</span>
          <span className="days"><Timer size={15} />{h.idle ?? 0}d</span>
        </div>)}
          {!s.critical.length && !s.attention.length && <div className="ok"><CheckCircle2 /> Nenhum gargalo agora</div>}</div>
      </div>
      <div className="stack">
        <div className="panel-tv">
          <h3><Rocket /> Go-lives próximos 7 dias <em>{s.goLives.length}</em></h3>
          <div className="rows">{s.goLives.slice(0, 4).map(({ p }) => <div key={p.id} className="row golive"><i /><div><strong>{name(p.clientId)}</strong><small>{phaseOwner(p)}</small></div><span className="date">{fmtDate(p.goLiveDate)}</span></div>)}
            {!s.goLives.length && <div className="muted">Nenhum go-live previsto para a semana</div>}</div>
        </div>
        <div className="panel-tv">
          <h3><CalendarClock /> Agenda de hoje <em>{agenda.length}</em></h3>
          <div className="rows">{agenda.slice(0, 5).map(a => <div key={a.id} className="row agenda"><i /><div><strong>{a.consultant}</strong><small>{name(a.clientId)} · {a.title}</small></div><span className="date">{a.shift}</span></div>)}
            {!agenda.length && <div className="muted">Sem consultores alocados hoje</div>}</div>
        </div>
      </div>
    </section>}

    <footer className="v7-tv-foot">
      <span className={`live ${err ? "off" : ""}`} />{err || `Atualizado ${updated ? updated.toLocaleTimeString("pt-BR") : "—"} · atualização automática a cada 30s · troca de visão a cada 20s`}
      <span className="bar" key={view} />
    </footer>
  </div>;
}
