"use client";
// V7/V8.1 · Painel de TV: tela cheia, leitura à distância, atualiza a cada 30s e alterna 3 visões a cada 20s:
// Esteira por fases · Destravar a onda (PDFs) · Gargalos, go-lives e agenda · Mapa de gargalos (V17).
// V32 · Logo do cliente ao lado do nome.
// V36 · Recarrega sozinha quando sai uma versão nova do site.
// V37 · Cabe sempre numa tela: a visão encolhe até caber e as listas mostram só o que cabe inteiro, com "+N mais".
// V38 · Gestão à vista em 4 telas: Pulso de hoje · Esteira por fases · Atacar primeiro · Linha do tempo da semana.
// V39 · + Próximas implantações: homologações e go-lives por consultor e semana até o fim do ano.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarX2, CheckCircle2, FileCheck2, Hand, Maximize2, Rocket, Siren, TrendingUp, Trophy, Wrench } from "lucide-react";
import type { State } from "@/lib/types";
import { PHASES, ballOf, flowSummary, phaseOwner, type Health } from "@/lib/flow";
import { fmtDate, todayISO } from "@/lib/metrics";
import { registerAvatars } from "@/lib/avatars";
import { registerLogos } from "@/lib/logos";
import { ClientLogo } from "./ClientLogo";
import { PersonPhoto } from "./PersonPhoto";
import { attackFirst, heatmap } from "@/lib/gargalos";
import { tvPulse, tvRisks } from "@/lib/tv-pulse";
import { addDaysISO, agendaBars, panelPeople, planQueue, splitPlan, weekDays } from "@/lib/fila";
import { FilaCalendar, FilaLegend } from "./FilaBoard";
import { buildTimeline, mondayOf, addDays, daysBetween, brS, PHASE_COLOR } from "@/lib/timeline";
import VersionWatcher from "./VersionWatcher";

const ROTATE_MS = 20000, REFRESH_MS = 30000;
const empty: State = { version: 1, importedAt: "", sourceFile: "", clients: [], projects: [], tasks: [], appointments: [], staff: [], users: [], audit: [] };
const order: Record<Health, number> = { red: 0, amber: 1, green: 2, done: 3 };
const VIEWS = ["Pulso de hoje", "Esteira por fases", "Próximas implantações", "Atacar primeiro", "Linha do tempo da semana"];
const TL = 4; // índice da linha do tempo
const N = VIEWS.length;

export default function TvPanel() {
  const [data, setData] = useState<State>(empty), [updated, setUpdated] = useState<Date | null>(null), [err, setErr] = useState("");
  const [view, setView] = useState(0), [now, setNow] = useState(() => new Date());
  const stage = useRef<HTMLDivElement>(null), [vp, setVp] = useState("");
  const [tlMs, setTlMs] = useState(ROTATE_MS); // V37: a linha do tempo fica o tempo de mostrar todas as páginas
  useEffect(() => { const t = setTimeout(() => setView(v => (v + 1) % N), view === TL ? Math.max(ROTATE_MS, tlMs) : ROTATE_MS); return () => clearTimeout(t); }, [view, tlMs]);
  useEffect(() => { const r = () => setVp(`${window.innerWidth}x${window.innerHeight}`); r(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);
  useLayoutEffect(() => { const el = stage.current; if (!el) return; fitTv(el); const t = setTimeout(() => fitTv(el), 700), t2 = setTimeout(() => fitTv(el), 2500); return () => { clearTimeout(t); clearTimeout(t2); }; }, [data, view, vp]);
  const load = useCallback(async () => {
    try { const r = await fetch("/api/state", { cache: "no-store" }); if (!r.ok) throw new Error(r.status === 401 ? "Link da TV expirado: abra novamente o link com a chave." : "Falha ao carregar"); const j = await r.json(); registerAvatars(j.avatars); registerLogos(j.logos, j.clients); setData(j); setUpdated(new Date()); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Sem conexão"); }
  }, []);
  useEffect(() => { void load(); const a = setInterval(() => void load(), REFRESH_MS), c = setInterval(() => setNow(new Date()), 1000); return () => { clearInterval(a); clearInterval(c); }; }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") setView(v => (v + 1) % N); if (e.key === "f") void document.documentElement.requestFullscreen?.(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const s = useMemo(() => flowSummary(data), [data]);
  const hm = useMemo(() => heatmap(data, "fase"), [data]);
  const atk = useMemo(() => attackFirst(hm.heats, 8), [hm.heats]);
  const pulse = useMemo(() => tvPulse(data), [data]);
  const risks = useMemo(() => tvRisks(data), [data]);
  const fila = useMemo(() => { // V40: esta semana e a próxima, por dia
    // V41: quantas semanas mostrar (1 a 4) vem da configuração do painel; ?semanas=N na URL sobrepõe nesta TV
    const qs = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("semanas")) : 0;
    const cfgW = Number((data as State & { config?: { tvWeeks?: number } }).config?.tvWeeks) || 2;
    const wk = [1, 2, 3, 4].includes(qs) ? qs : [1, 2, 3, 4].includes(cfgW) ? cfgW : 2;
    const today = todayISO(), plan = planQueue(data, today, addDaysISO(today, 400)), days = weekDays(mondayOf(today), wk);
    const { placed, queue } = splitPlan(plan.all);
    const people = panelPeople(data, placed, days);
    const skip = new Set(data.appointments.filter(a => placed.some(x => x.p.id === a.projectId && x.consultant === a.consultant && a.date && a.date >= x.start && a.date <= x.end)).map(a => a.id));
    return { days, placed, people, agenda: agendaBars(data, days, people, skip), queue, today };
  }, [data]);
  const name = (id: string) => data.clients.find(c => c.id === id)?.name || "Cliente";

  return <div className="v7-tv" onDoubleClick={() => void document.documentElement.requestFullscreen?.()}>
    <VersionWatcher mode="tv" />
    <header className="v7-tv-head">
      <img src="/wms-expert-logo.png" alt="WMS Expert" />
      <div className="v7-tv-title"><span>ESTEIRA DE ENTREGAS · AO VIVO</span><strong>{VIEWS[view]}</strong></div>
      <div className="v7-tv-views">{VIEWS.map((_, i) => <i key={i} className={view === i ? "on" : ""} />)}</div>
      <div className="v7-tv-clock"><strong>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong><small>{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</small></div>
      <button className="v7-tv-full" onClick={() => void document.documentElement.requestFullscreen?.()} aria-label="Tela cheia"><Maximize2 size={18} /></button>
    </header>

    <div className="v37-stage" ref={stage}>
    {view === 0 ? <section className="v38-pulse">
      <div className="v38-kpis">
        <div className="k cyan"><Rocket /><div><strong>{pulse.goLives.length}</strong><span>Go-lives em 30 dias</span><small>{pulse.goLives[0] ? `próximo: ${name(pulse.goLives[0].clientId)} · ${fmtDate(pulse.goLives[0].goLiveDate)}` : pulse.noDate ? `${pulse.noDate} projeto(s) sem data prometida` : "nenhum previsto"}</small></div></div>
        <div className={`k ${pulse.thisWeek >= pulse.avg4 && pulse.thisWeek > 0 ? "green" : "amber"}`}><TrendingUp /><div><strong>{pulse.thisWeek}</strong><span>Fases avançadas na semana</span><small>média das 4 semanas anteriores: {String(pulse.avg4).replace(".", ",")}</small></div>
          <i className="spark">{pulse.weeks.map((w, i) => <b key={i} title={`${fmtDate(w.start)} a ${fmtDate(w.end)}: ${w.n}`} style={{ height: `${Math.max(8, (w.n / Math.max(1, ...pulse.weeks.map(x => x.n))) * 100)}%` }} className={i === 5 ? "now" : ""} />)}</i></div>
        <div className="k red"><AlertTriangle /><div><strong>{pulse.red}</strong><span>Críticos</span><small>{pulse.amber} em atenção · {pulse.active} ativos</small></div></div>
        <div className="k amber"><Hand /><div><strong>{pulse.out.length}</strong><span>Bola com cliente / ERP</span><small>{pulse.outLong.length ? `${pulse.outLong.length} parado(s) há 5 dias ou mais` : "nenhum parado há 5+ dias"}</small></div></div>
      </div>
      <div className="v38-pulse-grid">
        <div className="panel-tv">
          <h3><CalendarClock /> Quem está onde <em>hoje e {new Date(pulse.nextDay + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "")}</em></h3>
          <div className="rows">{pulse.who.map(w => <div key={w.person} className="row who">
            <PersonPhoto name={w.person} size={44} /><div className="nm"><strong>{w.person}</strong></div>
            <div className="dayc"><small>Hoje</small>{w.today.length ? w.today.map(a => <b key={a.id} className="v32-nm"><ClientLogo clientId={a.clientId} size={22} />{name(a.clientId)}<em>{a.shift}</em></b>) : <span className="free">livre</span>}</div>
            <div className="dayc next"><small>{new Date(pulse.nextDay + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</small>{w.tomorrow.length ? w.tomorrow.map(a => <b key={a.id} className="v32-nm"><ClientLogo clientId={a.clientId} size={22} />{name(a.clientId)}<em>{a.shift}</em></b>) : <span className="free">livre</span>}</div>
          </div>)}
            {!pulse.who.length && <div className="muted">Ninguém alocado na agenda para hoje e o próximo dia útil</div>}</div>
        </div>
        <div className="panel-tv v38-wins">
          <h3><Trophy /> Conquistas da semana <em>{pulse.wins.length}</em></h3>
          <div className="rows">{pulse.wins.map(w => <div key={w.id} className={`row win ${w.kind}`}><i>{w.kind === "golive" ? <Rocket size={18} /> : w.kind === "doc" ? <FileCheck2 size={18} /> : <ArrowRight size={18} />}</i><div><strong className="v32-nm"><ClientLogo clientId={w.clientId} size={24} />{w.text}</strong><small>{new Date(w.at).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</small></div></div>)}
            {!pulse.wins.length && <div className="muted">Nenhuma fase avançada nem termo anexado nos últimos 7 dias</div>}</div>
        </div>
      </div>
    </section> : view === 1 ? <section className="v7-tv-flow v38-flow" style={{ gridTemplateColumns: `repeat(${PHASES.length - 1}, minmax(0,1fr))` }}>
      {s.byPhase.filter(ph => ph.key !== "fim").map((ph, i) => <div key={ph.key} className="col">
        <header><span>{i + 1}</span><strong>{ph.short}</strong><em>{ph.items.length}</em></header>
        <div className="list">{[...ph.items].sort((a, b) => order[a.h.health] - order[b.h.health] || (b.h.inPhase ?? 0) - (a.h.inPhase ?? 0)).map(({ p, h }) =>
          <div key={p.id} className={`c ${h.health}`} title={h.reasons[0] || ""}><strong className="v32-nm"><ClientLogo clientId={p.clientId} size={28} />{name(p.clientId)}</strong><small>{phaseOwner(p)} · {h.inPhase ?? 0}d{ballOf(p) !== "WMS Expert" ? ` · bola: ${ballOf(p)}` : ""}</small></div>)}
        </div>
      </div>)}
    </section> : view === 2 ? <section className="v39-tv">
      <div className="v39-tv-top"><FilaLegend /><span>{fila.agenda.filter(a => !a.office).length} na agenda · {fila.placed.filter(x => x.end >= fila.days[0] && x.start <= fila.days[fila.days.length - 1]).length} homologações/go-lives marcados · {fila.queue.length} na fila</span></div>
      <FilaCalendar days={fila.days} people={fila.people} slots={fila.placed} agenda={fila.agenda} today={fila.today} tv compact={fila.days.length > 10} />
      {fila.queue.length > 0 && <div className="v40-tvq"><span className="t">Próximos na fila</span>{fila.queue.slice(0, 6).map(q => <span key={q.id} className={`q ${q.kind}`}><em>{q.kind === "golive" ? "G" : "H"}</em><b className="v32-nm"><ClientLogo clientId={q.clientId} size={20} />{q.client}</b><small>{fmtDate(q.start).slice(0, 5)}</small></span>)}{fila.queue.length > 6 && <span className="more">+{fila.queue.length - 6}</span>}</div>}
    </section> : view === 3 ? <section className="v38-attack">
      <div className="panel-tv">
        <h3><Siren /> Atacar primeiro <em>{atk.length}</em></h3>
        <div className="rows">{atk.map((a, i) => <div key={a.h.p.id} className={`row ${i < 3 ? "red" : "amber"}`}>
          <span className="rank">{i + 1}</span>
          <div><strong className="v32-nm"><ClientLogo clientId={a.h.p.clientId} size={28} />{a.h.client}</strong><small>{a.problem}</small><small className="nx">{a.next}</small></div>
          <span className="ball"><Hand size={15} />{a.h.ball}</span>
          <span className="own"><PersonPhoto name={a.h.owner} size={26} />{a.h.owner}</span>
        </div>)}
          {!atk.length && <div className="ok"><CheckCircle2 /> Nada urgente agora</div>}</div>
      </div>
      <div className="stack">
        <div className="panel-tv">
          <h3><CalendarX2 /> Go-lives em risco <em>{risks.risk.length}</em></h3>
          <div className="rows">{risks.risk.map(f => <div key={f.p.id} className={`row ${f.status === "atrasado" ? "red" : "amber"}`}><i /><div><strong className="v32-nm"><ClientLogo clientId={f.p.clientId} size={26} />{f.client}</strong><small>prometido {fmtDate(f.promised)} · previsto {fmtDate(f.forecast)} · {risks.phaseShort(f.phase)}</small></div><span className="days">+{f.diff ?? 0} du</span></div>)}
            {!risks.risk.length && <div className="ok"><CheckCircle2 /> Nenhum go-live prometido em risco</div>}</div>
        </div>
        <div className="panel-tv">
          <h3><Wrench /> Infra pendente p/ go-live <em>{risks.infra.length}</em></h3>
          <div className="rows">{risks.infra.map(x => <div key={x.f.p.id} className={`row ${x.late ? "red" : "amber"}`}><i /><div><strong className="v32-nm"><ClientLogo clientId={x.f.p.clientId} size={26} />{x.f.client}</strong><small>{x.text}</small></div><span className="date">{fmtDate(x.f.promised || x.f.forecast)}</span></div>)}
            {!risks.infra.length && <div className="ok"><CheckCircle2 /> Infra em dia nos próximos go-lives</div>}</div>
        </div>
      </div>
    </section> : <TvTimeline data={data} onDuration={setTlMs} />}
    </div>

    <footer className="v7-tv-foot">
      <span className={`live ${err ? "off" : ""}`} />{err || `Atualizado ${updated ? updated.toLocaleTimeString("pt-BR") : "—"} · atualização automática a cada 30s · troca de visão a cada 20s`}
      <span className="bar" key={view} style={{ animationDuration: `${(view === TL ? Math.max(ROTATE_MS, tlMs) : ROTATE_MS) / 1000}s` }} />
    </footer>
  </div>;
}

/* V31 · TV: linha do tempo da semana (consultor × dia: cliente, etapa e o que foi feito / onde parou) */
function TvTimeline({ data, onDuration }: { data: State; onDuration?: (ms: number) => void }) {
  const today = todayISO(), from = mondayOf(today), to = addDays(from, 4);
  const days = daysBetween(from, to);
  const groups = useMemo(() => buildTimeline(data, from, to, { mode: "consultor", today }), [data, from, to, today]);
  const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  // V37 · paginação: mostra os consultores que cabem inteiros na tela e alterna as páginas
  const sec = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null), head = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null), [pg, setPg] = useState(0), [vp, setVp] = useState("");
  useEffect(() => { const r = () => setVp(`${window.innerWidth}x${window.innerHeight}`); r(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);
  const sig = useMemo(() => groups.map(g => `${g.person}:${g.lanes.length}:${g.days}:${g.stops.length}:${g.lanes.reduce((a, l) => a + l.entries.length + l.segs.length + l.apps.length, 0)}`).join("|"), [groups]);
  useLayoutEffect(() => { setPages(null); }, [sig, vp]);
  useLayoutEffect(() => {
    if (pages !== null || !sec.current || !body.current || !head.current) return;
    if (window.innerWidth < 1100 || window.innerHeight < 420) return;
    const avail = sec.current.clientHeight - head.current.offsetHeight - 10 - 30;
    const rows = [...body.current.children].filter(e => e.classList.contains("v31-tv-row")) as HTMLElement[];
    const out: number[][] = []; let cur: number[] = [], h = 0;
    rows.forEach((r, i) => { const rh = r.offsetHeight + 10; if (cur.length && h + rh > avail) { out.push(cur); cur = []; h = 0; } cur.push(i); h += rh; });
    if (cur.length) out.push(cur);
    setPages(out); setPg(x => (x < out.length ? x : 0));
  }, [pages]);
  const PAGE_MS = 8000;
  useEffect(() => { onDuration?.(pages && pages.length > 1 ? pages.length * PAGE_MS : ROTATE_MS); if (!pages || pages.length < 2) return; const t = setInterval(() => setPg(x => (x + 1) % pages.length), PAGE_MS); return () => clearInterval(t); }, [pages, onDuration]);
  const shown = (i: number) => !pages || !pages.length || (pages[pg] || pages[0]).includes(i);
  return <section className="v31-tv" ref={sec} data-nofit="1">
    <div className="v31-tv-head" ref={head} style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)` }}><span />{days.map(d => <span key={d} className={d === today ? "today" : ""}><b>{WD[new Date(d + "T12:00:00").getDay()]}</b> {brS(d)}</span>)}</div>
    <div className="v31-tv-body" ref={body}>{groups.map((g, gi) => <div key={g.person} className="v31-tv-row" style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)`, animationDelay: `${(gi % 8) * 90}ms`, ...(shown(gi) ? {} : { display: "none" }) }}>
      <span className="who"><PersonPhoto name={g.person} size={42} /><b>{g.person}</b>{g.stops.length > 0 && <em>{g.stops.length} parada(s)</em>}</span>
      {days.map(d => { const items = g.lanes.flatMap(l => { const e = l.entries.filter(x => x.date === d); const sg = l.segs.find(x => x.kind !== "crono" && x.start <= d && x.end >= d); const ap = l.apps.find(a => a.date === d);
          return e.length || sg || ap ? [{ l, e, sg, ap }] : []; });
        return <div key={d} className={`cell ${d === today ? "today" : ""} ${d > today ? "fut" : ""}`}>{items.slice(0, 2).map(({ l, e, sg, ap }) => <div key={l.key} className={`it ${e.some(x => x.status === "parado") ? "stop" : e.some(x => x.status === "parcial") ? "part" : ""}`} style={{ borderColor: PHASE_COLOR[sg?.phase || "none"] }}>
          <b className="v32-nm"><ClientLogo clientId={data.projects.find(x => x.id === l.projectId)?.clientId} size={20} />{l.client}</b><small>{e[0] ? e[0].text : sg ? sg.label : ap?.title}</small>{e.find(x => x.status !== "ok")?.reason && <em>⛔ {e.find(x => x.status !== "ok")?.reason}</em>}</div>)}
          {items.length > 2 && <i>+{items.length - 2}</i>}</div>; })}
    </div>)}{!groups.length && <div className="v31-tv-empty">Nenhuma agenda, etapa ou registro nesta semana.</div>}</div>
    {pages && pages.length > 1 && <div className="v37-pages">{pages.map((_, i) => <i key={i} className={i === pg ? "on" : ""} />)}<span>Consultores {pages.slice(0, pg).reduce((a, x) => a + x.length, 0) + 1}–{pages.slice(0, pg + 1).reduce((a, x) => a + x.length, 0)} de {groups.length}</span></div>}
  </section>;
}

/* V37 · Ajuste à tela da TV (qualquer resolução): encolhe a visão até caber e corta as listas no último item inteiro. */
function fitTv(stage: HTMLElement) {
  const sec = stage.firstElementChild as HTMLElement | null; if (!sec) return;
  sec.style.transform = ""; sec.style.width = ""; sec.style.height = "";
  stage.querySelectorAll<HTMLElement>("[data-v37-hide]").forEach(e => { e.style.display = ""; e.removeAttribute("data-v37-hide"); });
  stage.querySelectorAll<HTMLElement>("[data-more]").forEach(e => { e.removeAttribute("data-more"); e.style.removeProperty("--v37-h"); e.style.height = ""; });
  if (window.innerWidth < 1100 || window.innerHeight < 420) return; // celular / tela estreita: rola a página
  const have = stage.clientHeight, need = sec.scrollHeight;
  if (have > 0 && need > have + 2 && !sec.dataset.nofit) {
    const k = Math.max(0.8, have / need);
    sec.style.transformOrigin = "top left"; sec.style.transform = `scale(${k})`; sec.style.width = `${100 / k}%`; sec.style.height = `${have / k}px`;
  }
  stage.querySelectorAll<HTMLElement>(".v17-tv-grid").forEach(g => { // tabela do mapa de gargalos: encolhe dentro do quadro
    g.style.transform = ""; g.style.width = "";
    const box = g.parentElement as HTMLElement; if (!box) return;
    const avail = box.clientHeight - g.offsetTop - 12, need2 = g.scrollHeight;
    if (avail > 60 && need2 > avail + 2) { const k = Math.max(0.55, avail / need2); g.style.transformOrigin = "top left"; g.style.transform = `scale(${k})`; g.style.width = `${100 / k}%`; }
  });
  stage.querySelectorAll<HTMLElement>(".rows, .list").forEach(list => {
    const box = list.parentElement as HTMLElement | null;
    let H = list.clientHeight;
    if (box && list.offsetParent === box) {
      let after = 0; for (let n = list.nextElementSibling as HTMLElement | null; n; n = n.nextElementSibling as HTMLElement | null) after += n.offsetHeight;
      const pb = parseFloat(getComputedStyle(box).paddingBottom) || 0;
      H = Math.min(H, box.clientHeight - pb - after - list.offsetTop);
    }
    if (H <= 0 || list.scrollHeight <= H + 1) return;
    const kids = [...list.children] as HTMLElement[], more = kids.find(k => k.classList.contains("more"));
    let extra = more ? Number((more.textContent || "").match(/\+(\d+)/)?.[1] || 0) : 0;
    if (more) { more.style.display = "none"; more.setAttribute("data-v37-hide", "1"); }
    let cut = false;
    for (const it of kids) {
      if (it === more || it.classList.contains("ok") || it.classList.contains("muted")) continue;
      if (cut || it.offsetTop + it.offsetHeight > H - 30) { cut = true; it.style.display = "none"; it.setAttribute("data-v37-hide", "1"); extra++; }
    }
    if (extra > 0) { list.style.height = `${H}px`; list.setAttribute("data-more", `+${extra} mais`); list.style.setProperty("--v37-h", `${H}px`); }
  });
}
