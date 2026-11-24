"use client";
// V7/V8.1 · Painel de TV: tela cheia, leitura à distância, atualiza a cada 30s e alterna 3 visões a cada 20s:
// Esteira por fases · Destravar a onda (PDFs) · Gargalos, go-lives e agenda · Mapa de gargalos (V17).
// V32 · Logo do cliente ao lado do nome.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FileClock, FileX2, Hand, LockKeyhole, Maximize2, Rocket, Timer, TrendingUp, Unlock, Users } from "lucide-react";
import type { State } from "@/lib/types";
import { PHASES, ballOf, docStates, flowSummary, phaseIndex, phaseOwner, unlockSummary, type Health } from "@/lib/flow";
import { fmtDate, todayISO } from "@/lib/metrics";
import { avatarUrl, registerAvatars } from "@/lib/avatars";
import { registerLogos } from "@/lib/logos";
import { ClientLogo } from "./ClientLogo";
import { PersonPhoto } from "./PersonPhoto";
import { DIMS, attackFirst, gargalosSummary, heatmap } from "@/lib/gargalos";
import { buildTimeline, mondayOf, addDays, daysBetween, brS, PHASE_COLOR } from "@/lib/timeline";

const ROTATE_MS = 20000, REFRESH_MS = 30000;
const empty: State = { version: 1, importedAt: "", sourceFile: "", clients: [], projects: [], tasks: [], appointments: [], staff: [], users: [], audit: [] };
const order: Record<Health, number> = { red: 0, amber: 1, green: 2, done: 3 };
const VIEWS = ["Esteira por fases", "Destravar a onda", "Gargalos, go-lives e agenda", "Mapa de gargalos", "Linha do tempo da semana"];
const N = VIEWS.length;

export default function TvPanel() {
  const [data, setData] = useState<State>(empty), [updated, setUpdated] = useState<Date | null>(null), [err, setErr] = useState("");
  const [view, setView] = useState(0), [now, setNow] = useState(() => new Date());
  const load = useCallback(async () => {
    try { const r = await fetch("/api/state", { cache: "no-store" }); if (!r.ok) throw new Error(r.status === 401 ? "Link da TV expirado: abra novamente o link com a chave." : "Falha ao carregar"); const j = await r.json(); registerAvatars(j.avatars); registerLogos(j.logos, j.clients); setData(j); setUpdated(new Date()); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Sem conexão"); }
  }, []);
  useEffect(() => { void load(); const a = setInterval(() => void load(), REFRESH_MS), b = setInterval(() => setView(v => (v + 1) % N), ROTATE_MS), c = setInterval(() => setNow(new Date()), 1000); return () => { clearInterval(a); clearInterval(b); clearInterval(c); }; }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") setView(v => (v + 1) % N); if (e.key === "f") void document.documentElement.requestFullscreen?.(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const s = useMemo(() => flowSummary(data), [data]);
  const u = useMemo(() => unlockSummary(data), [data]);
  // V28.1 · Documentos anexados nas últimas 48 h (mostra na TV que o anexo entrou)
  const recent = useMemo(() => {
    const lim = Date.now() - 48 * 3600e3, out: { id: string; client: string; letter: string; doc: string; at: string; by?: string }[] = [];
    for (const p of data.projects) {
      const client = data.clients.find(c => c.id === p.clientId)?.name || p.name;
      for (const ph of PHASES) { const d = p.phases?.[ph.key]?.doc; if (d?.uploadedAt && new Date(d.uploadedAt).getTime() >= lim) out.push({ id: `${p.id}-${ph.key}`, client, letter: ph.letter, doc: ph.doc.replace("Documento de ", ""), at: d.uploadedAt, by: d.uploadedBy }); }
      for (const x of p.extraDocs || []) { const t = x.signed?.uploadedAt; if (t && new Date(t).getTime() >= lim) out.push({ id: `${p.id}-${x.id}`, client, letter: "+", doc: x.title, at: t, by: x.manual?.by || x.uploadedBy }); }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  }, [data]);
  const hm = useMemo(() => heatmap(data, "fase"), [data]);
  const gs = useMemo(() => gargalosSummary(data), [data]);
  const atk = useMemo(() => attackFirst(hm.heats, 5), [hm.heats]);
  const name = (id: string) => data.clients.find(c => c.id === id)?.name || "Cliente";
  const today = todayISO();
  const agenda = data.appointments.filter(a => a.date === today && a.status !== "Cancelado").sort((a, b) => a.consultant.localeCompare(b.consultant));
  const active = s.reports.filter(r => r.h.health !== "done").length;

  return <div className="v7-tv" onDoubleClick={() => void document.documentElement.requestFullscreen?.()}>
    <header className="v7-tv-head">
      <img src="/wms-expert-logo.png" alt="WMS Expert" />
      <div className="v7-tv-title"><span>ESTEIRA DE ENTREGAS · AO VIVO</span><strong>{VIEWS[view]}</strong></div>
      <div className="v7-tv-views">{VIEWS.map((_, i) => <i key={i} className={view === i ? "on" : ""} />)}</div>
      <div className="v7-tv-clock"><strong>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong><small>{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</small></div>
      <button className="v7-tv-full" onClick={() => void document.documentElement.requestFullscreen?.()} aria-label="Tela cheia"><Maximize2 size={18} /></button>
    </header>

    <section className="v7-tv-kpis">
      <div className="k red"><LockKeyhole /><strong>{u.blocked.length}</strong><span>Travados por PDF<small>{u.blocked.filter(g => g.state === "sent").length} aguardando assinatura</small></span></div>
      <div className="k green"><Unlock /><strong>{u.ready.length}</strong><span>Prontos para avançar<small>PDF OK · falta mover</small></span></div>
      <div className="k cyan"><TrendingUp /><strong>{u.movedWeek}</strong><span>Avançaram em 7 dias<small>{s.goLives.length ? `${s.goLives.length} go-live(s) na semana` : "mudanças de fase"}</small></span></div>
      <div className="k amber"><AlertTriangle /><strong>{s.red}</strong><span>Críticos<small>{s.amber} em atenção</small></span></div>
      <div className="k ball"><Hand /><div>{s.ball.map(b => <b key={b.name}><i>{b.count}</i>{b.name}</b>)}</div><span>Bola com · {active} ativos</span></div>
    </section>

    {view === 0 ? <section className="v7-tv-flow" style={{ gridTemplateColumns: `repeat(${PHASES.length - 1}, minmax(0,1fr))` }}>
      {s.byPhase.filter(ph => ph.key !== "fim").map((ph, i) => <div key={ph.key} className="col">
        <header><span>{i + 1}</span><strong>{ph.short}</strong><em>{ph.items.length}</em></header>
        <div className="list">{[...ph.items].sort((a, b) => order[a.h.health] - order[b.h.health]).slice(0, 8).map(({ p, h }) =>
          <div key={p.id} className={`c ${h.health}`}><strong className="v32-nm"><ClientLogo clientId={p.clientId} size={28} />{name(p.clientId)}</strong><small>{phaseOwner(p)} · {h.inPhase ?? 0}d</small>{h.health !== "done" && (docStates(p).some(d => d.state === "pending" || d.state === "missing") ? <em className="pdf" title="Documento pendente"><FileX2 />PDF</em> : docStates(p).some(d => d.state === "sent") ? <em className="pdf sent" title="Aguardando assinatura do cliente"><FileClock />ASSIN.</em> : null)}</div>)}
          {ph.items.length > 8 && <div className="more">+{ph.items.length - 8} projetos</div>}
        </div>
      </div>)}
    </section> : view === 1 ? <section className="v8-tv-unlock">
      <div className="v8-cov">{u.coverage.map(c => <div key={c.key} className={c.pct >= 80 ? "good" : c.pct >= 50 ? "mid" : "bad"}>
        <b>{c.letter}</b><div><strong>{c.short}</strong><small>{c.ok}/{c.need} PDFs OK{c.sent ? ` · ${c.sent} na assinatura` : ""}</small></div><em>{c.pct}%</em><i><s style={{ width: `${c.pct}%` }} /></i>
      </div>)}</div>
      {recent.length > 0 && <div className="v281-recent"><span className="t"><CheckCircle2 size={16} /> Anexados nas últimas 48h</span>{recent.map(r => <span key={r.id} className="it"><b>{r.letter}</b>{r.client} · {r.doc}<small>{new Date(r.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></span>)}</div>}
      <div className="v8-unlock-grid">
        <div className="panel-tv">
          <h3><Unlock /> Prontos para avançar <em>{u.ready.length}</em></h3>
          <div className="rows">{u.ready.slice(0, 6).map(({ p, from, to }) => <div key={p.id} className="row ready"><i /><div><strong className="v32-nm"><ClientLogo clientId={p.clientId} size={28} />{name(p.clientId)}</strong><small>{PHASES[phaseIndex(from)].short} <ArrowRight size={12} /> {from === "homolog" ? "Implantação / Go-live" : PHASES[phaseIndex(to)].short}</small></div><span className="ball">{phaseOwner(p)}</span></div>)}
            {u.ready.length > 6 && <div className="more">+{u.ready.length - 6} projetos</div>}
            {!u.ready.length && <div className="muted">Nenhum card com PDF OK parado na fase</div>}</div>
        </div>
        <div className="panel-tv">
          <h3><FileX2 /> Falta PDF para avançar <em>{u.blocked.length}</em></h3>
          <div className="rows">{u.blocked.slice(0, 6).map(g => <div key={g.p.id + g.key} className={`row ${g.state === "sent" ? "sent" : "red"}`}><i /><div><strong className="v32-nm"><ClientLogo clientId={g.p.clientId} size={28} />{name(g.p.clientId)}</strong><small>{g.state === "sent" ? <FileClock size={13} /> : <FileX2 size={13} />} {g.doc}</small></div><span className="ball">{g.state === "sent" ? "Assinatura do cliente" : g.owner}</span><span className="days"><Timer size={15} />{g.days}d</span></div>)}
            {u.blocked.length > 6 && <div className="more">+{u.blocked.length - 6} projetos · os mais antigos aparecem primeiro</div>}
            {!u.blocked.length && <div className="ok"><CheckCircle2 /> Todas as fases atuais com PDF</div>}</div>
        </div>
        <div className="panel-tv">
          <h3><Users /> Quem precisa entregar <em>{u.gaps.length}</em></h3>
          <div className="rows">{u.owners.slice(0, 5).map(o => <div key={o.name} className={`row owner ${o.name.startsWith("Cliente") ? "sent" : o.blocks ? "red" : "amber"}`}><i /><div><strong>{o.name}</strong><small>{Object.entries(o.letters).sort((a, b) => "KDHIG".indexOf(a[0]) - "KDHIG".indexOf(b[0])).map(([l, n]) => `${n}× ${l}`).join(" · ")}{o.total - o.blocks ? ` · ${o.total - o.blocks} retroativo(s)` : ""}</small></div><span className="count">{o.blocks}<small>travando</small></span></div>)}
            {u.owners.length > 5 && <div className="more">+{u.owners.length - 5} responsáveis</div>}
            {!u.owners.length && <div className="ok"><CheckCircle2 /> Nenhum documento pendente</div>}</div>
          <p className="v8-legend">K endereçamento · D integração · H homologação · I implantação · G go-live</p>
        </div>
      </div>
    </section> : view === 4 ? <TvTimeline data={data} />
    : view === 3 ? <section className="v17-tv">
      <div className="panel-tv v17-tv-heat">
        <h3><AlertTriangle /> Onde a esteira está travando <em>{gs.pctInGoal === null ? "—" : `${gs.pctInGoal}% na meta`}</em></h3>
        <div className="v17-tv-grid" style={{ gridTemplateColumns: `minmax(0,1.3fr) repeat(${DIMS.length}, minmax(0,1fr))` }}>
          <span />{DIMS.map(d => <span key={d.key} className="h">{d.label}</span>)}
          {hm.rows.map(r => <div key={r.key} style={{ display: "contents" }}><span className="r"><b>{r.label}</b><small>{r.total} proj.</small></span>
            {DIMS.map(d => { const c = r.cells[d.key]; return <span key={d.key} className={`c l${c.level}`}><b>{c.text}</b><small>{c.sub}</small></span>; })}</div>)}
        </div>
      </div>
      <div className="panel-tv">
        <h3><Rocket /> Atacar primeiro <em>{atk.length}</em></h3>
        <div className="rows">{atk.map((a, i) => <div key={a.h.p.id} className={`row ${i < 2 ? "red" : "amber"}`}><i /><div><strong>{i + 1}. {a.h.client}</strong><small>{a.problem}</small></div></div>)}
          {!atk.length && <div className="ok"><CheckCircle2 /> Nenhum gargalo agora</div>}</div>
      </div>
    </section> : <section className="v7-tv-split">
      <div className="panel-tv">
        <h3><AlertTriangle /> Gargalos e empecilhos <em>{s.critical.length + s.attention.length}</em></h3>
        <div className="rows">{[...s.critical, ...s.attention].slice(0, 7).map(({ p, h }) => <div key={p.id} className={`row ${h.health}`}>
          <i />
          <div><strong className="v32-nm"><ClientLogo clientId={p.clientId} size={28} />{name(p.clientId)}</strong><small>{h.reasons[0] || ""}</small></div>
          <span className="ball"><Hand size={15} />{ballOf(p)}</span>
          <span className="days"><Timer size={15} />{h.idle ?? 0}d</span>
        </div>)}
          {s.critical.length + s.attention.length > 7 && <div className="more">+{s.critical.length + s.attention.length - 7} projetos · os mais parados aparecem primeiro</div>}
          {!s.critical.length && !s.attention.length && <div className="ok"><CheckCircle2 /> Nenhum gargalo agora</div>}</div>
      </div>
      <div className="stack">
        {s.goLives.length > 0 && <div className="panel-tv">
          <h3><Rocket /> Go-lives próximos 7 dias <em>{s.goLives.length}</em></h3>
          <div className="rows">{s.goLives.slice(0, 4).map(({ p }) => <div key={p.id} className="row golive"><i /><div><strong className="v32-nm"><ClientLogo clientId={p.clientId} size={28} />{name(p.clientId)}</strong><small>{phaseOwner(p)}</small></div><span className="date">{fmtDate(p.goLiveDate)}</span></div>)}
</div>
        </div>}
        <div className="panel-tv">
          <h3><CalendarClock /> Agenda de hoje <em>{agenda.length}</em></h3>
          <div className="rows">{agenda.slice(0, s.goLives.length ? 4 : 8).map(a => <div key={a.id} className={`row agenda ${avatarUrl(a.consultant) ? "v19-tv-face" : ""}`}>{avatarUrl(a.consultant) ? <PersonPhoto name={a.consultant} size={40} /> : <i />}<div><strong>{a.consultant}</strong><small>{name(a.clientId)} · {a.title}</small></div><span className="date">{a.shift}</span></div>)}
            {agenda.length > (s.goLives.length ? 4 : 8) && <div className="more">+{agenda.length - (s.goLives.length ? 4 : 8)} alocações</div>}
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

/* V31 · TV: linha do tempo da semana (consultor × dia: cliente, etapa e o que foi feito / onde parou) */
function TvTimeline({ data }: { data: State }) {
  const today = todayISO(), from = mondayOf(today), to = addDays(from, 4);
  const days = daysBetween(from, to);
  const groups = useMemo(() => buildTimeline(data, from, to, { mode: "consultor", today }), [data, from, to, today]);
  const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return <section className="v31-tv">
    <div className="v31-tv-head" style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)` }}><span />{days.map(d => <span key={d} className={d === today ? "today" : ""}><b>{WD[new Date(d + "T12:00:00").getDay()]}</b> {brS(d)}</span>)}</div>
    <div className="v31-tv-body">{groups.slice(0, 9).map((g, gi) => <div key={g.person} className="v31-tv-row" style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)`, animationDelay: `${gi * 90}ms` }}>
      <span className="who"><PersonPhoto name={g.person} size={42} /><b>{g.person}</b>{g.stops.length > 0 && <em>{g.stops.length} parada(s)</em>}</span>
      {days.map(d => { const items = g.lanes.flatMap(l => { const e = l.entries.filter(x => x.date === d); const sg = l.segs.find(x => x.kind !== "crono" && x.start <= d && x.end >= d); const ap = l.apps.find(a => a.date === d);
          return e.length || sg || ap ? [{ l, e, sg, ap }] : []; });
        return <div key={d} className={`cell ${d === today ? "today" : ""} ${d > today ? "fut" : ""}`}>{items.slice(0, 2).map(({ l, e, sg, ap }) => <div key={l.key} className={`it ${e.some(x => x.status === "parado") ? "stop" : e.some(x => x.status === "parcial") ? "part" : ""}`} style={{ borderColor: PHASE_COLOR[sg?.phase || "none"] }}>
          <b className="v32-nm"><ClientLogo clientId={data.projects.find(x => x.id === l.projectId)?.clientId} size={20} />{l.client}</b><small>{e[0] ? e[0].text : sg ? sg.label : ap?.title}</small>{e.find(x => x.status !== "ok")?.reason && <em>⛔ {e.find(x => x.status !== "ok")?.reason}</em>}</div>)}
          {items.length > 2 && <i>+{items.length - 2}</i>}</div>; })}
    </div>)}{!groups.length && <div className="v31-tv-empty">Nenhuma agenda, etapa ou registro nesta semana.</div>}</div>
  </section>;
}
