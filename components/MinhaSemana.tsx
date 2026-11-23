"use client";
// V27 · Minha semana: tudo o que depende de uma pessoa num lugar só — atividades, visitas,
// próximas ações e projetos em que ela é dona da fase. Gestor/Admin podem ver a semana de qualquer um.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Flag, ListTodo, RefreshCw, Rocket, Target, Timer } from "lucide-react";
import type { Appointment, Project, State, Task } from "@/lib/types";
import { PHASES, healthOf, isArchived, phaseOf, phaseOwner, healthLabel } from "@/lib/flow";
import { isDone, todayISO } from "@/lib/metrics";
import { forecastAll, br, brShort } from "@/lib/forecast";
import { PersonPhoto } from "./PersonPhoto";
import Select from "./Select";

type Props = { data: State; onRefresh: () => Promise<void> | void; onOpen: (p: Project) => void; onNavigate: (path: string) => void };
type Me = { name: string; email?: string; profile?: string | null; role?: string | null };
const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** "Robson" = "Robson Pereira"; "Denilson Maia" = "Denilson" (primeiro nome com 3+ letras). */
export function samePerson(a?: string | null, b?: string | null) {
  const x = norm(a), y = norm(b); if (!x || !y) return false; if (x === y) return true;
  const fx = x.split(" ")[0], fy = y.split(" ")[0]; return fx.length >= 3 && fx === fy && (x.split(" ").length === 1 || y.split(" ").length === 1);
}
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const x = new Date(d + "T12:00:00"); const w = x.getDay(); return addDays(d, w === 0 ? -6 : 1 - w); };
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const openTask = (t: Task) => !isDone(t.status) && !/cancel/i.test(t.status);

export default function MinhaSemana({ data, onRefresh, onOpen, onNavigate }: Props) {
  const today = todayISO();
  const [me, setMe] = useState<Me | null>(null), [who, setWho] = useState(""), [week, setWeek] = useState(() => mondayOf(today));
  const [busy, setBusy] = useState(""), [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/auth", { cache: "no-store" }).then(r => r.json()).then((j: Me) => setMe(j)).catch(() => setMe({ name: "" })); }, []);
  const people = useMemo(() => {
    const names = [...data.staff.filter(s => s.active !== false).map(s => s.name), ...data.users.filter(u => u.active && u.role !== "Painel").map(u => u.name)];
    const out: string[] = []; for (const n of names) if (n && !/^(a definir|nao definido|time de|dev |painel|treinamento)/.test(norm(n)) && !out.some(o => samePerson(o, n))) out.push(n);
    return out.sort((a, b) => a.localeCompare(b));
  }, [data.staff, data.users]);
  const canPick = !me?.profile || me.profile === "Administrador" || me.profile === "Gestor" || me.role === "local";
  useEffect(() => { if (!me || who) return; setWho(me.name && (people.some(p => samePerson(p, me.name)) || !canPick) ? me.name : people[0] || me.name || ""); }, [me, people, who, canPick]);

  const end = addDays(week, 6), isThisWeek = week === mondayOf(today);
  const mine = (n?: string | null) => samePerson(n, who);
  const tasks = data.tasks.filter(t => openTask(t) && mine(t.owner));
  const late = tasks.filter(t => t.dueDate && t.dueDate < today).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const todayT = tasks.filter(t => t.dueDate === today);
  const weekT = tasks.filter(t => t.dueDate && t.dueDate > today && t.dueDate <= end).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const later = tasks.filter(t => !t.dueDate || t.dueDate > end).sort((a, b) => String(a.dueDate || "9").localeCompare(String(b.dueDate || "9")));
  const apps = data.appointments.filter(a => mine(a.consultant) && a.status !== "Cancelado" && a.date && a.date >= week && a.date <= end);
  const active = data.projects.filter(p => !isArchived(p, today) && phaseOf(p) !== "fim");
  const owned = active.filter(p => mine(phaseOwner(p)));
  const actions = active.filter(p => (p.nextAction || "").trim() && mine(p.nextActionOwner || phaseOwner(p))).sort((a, b) => String(a.nextActionDue || "9").localeCompare(String(b.nextActionDue || "9")));
  const missing = owned.filter(p => !(p.nextAction || "").trim());
  const fc = forecastAll(data, today);
  const clientOf = (id: string) => data.clients.find(c => c.id === id)?.name || "—";
  const projOf = (id: string) => data.projects.find(p => p.id === id);
  const first = (who || "").split(" ")[0];
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  async function done(t: Task) {
    setBusy(t.id); setMsg("");
    try {
      const r = await fetch(`/api/records/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Concluído" }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao concluir.");
      await onRefresh(); setMsg(`“${t.title}” concluída`); window.setTimeout(() => setMsg(""), 2600);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha ao concluir."); } finally { setBusy(""); }
  }
  const TaskRow = ({ t, tone }: { t: Task; tone: string }) => { const p = projOf(t.projectId); return <div className={`v27-task t-${tone}`}>
    <button type="button" className="ck" disabled={!!busy} onClick={() => void done(t)} title="Marcar como concluída" aria-label={`Concluir ${t.title}`}>{busy === t.id ? <RefreshCw className="spin" size={13} /> : <Check size={13} />}</button>
    <button type="button" className="txt" onClick={() => p && onOpen(p)}><b>{t.title}</b><small>{clientOf(t.clientId)}{t.dueDate ? ` · prazo ${br(t.dueDate)}` : " · sem prazo"}{t.blocker && t.blocker !== "-" ? ` · empecilho: ${t.blocker}` : ""}</small></button>
  </div>; };
  const group = (title: string, list: Task[], tone: string, Icon: typeof Clock3) => list.length ? <div className="v27-group"><h4 className={`g-${tone}`}><Icon size={14} />{title}<em>{list.length}</em></h4>{list.map(t => <TaskRow key={t.id} t={t} tone={tone} />)}</div> : null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d, i) => i < 5 || apps.some(a => a.date === d));

  if (!me) return <div className="v27"><div className="v7-empty"><RefreshCw className="spin" /> Carregando…</div></div>;
  return <div className="v27 v27-week">
    <div className="page-header v4-page-header"><div className="v4-heading-copy">
      <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  MINHA SEMANA</div>
      <h1 className="v27-hello">{who && <PersonPhoto name={who} size={44} />}{hello}{first ? `, ${first}` : ""}</h1>
      <p>Tudo o que depende {who && !samePerson(who, me.name) ? `de ${first}` : "de você"} nesta semana: atividades, visitas, próximas ações e projetos em que é dono da fase.</p>
    </div>
      <div className="v27-week-ctrl">
        {canPick && <label><span>Ver a semana de</span><Select value={who} onChange={e => setWho(e.target.value)}>{[...new Set([who, ...people].filter(Boolean))].map(n => <option key={n}>{n}</option>)}</Select></label>}
        <div className="nav"><button type="button" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior"><ChevronLeft size={16} /></button><span>{brShort(week)} a {brShort(end)}{isThisWeek ? " · esta semana" : ""}</span><button type="button" onClick={() => setWeek(addDays(week, 7))} aria-label="Próxima semana"><ChevronRight size={16} /></button>{!isThisWeek && <button type="button" className="hoje" onClick={() => setWeek(mondayOf(today))}>Hoje</button>}</div>
      </div>
    </div>

    <section className="v27-kpis">
      <div className="v27-kpi"><span className={`i ${late.length ? "r" : "g"}`}><AlertTriangle size={18} /></span><div><strong>{late.length}</strong><em>Atividades vencidas</em></div></div>
      <div className="v27-kpi"><span className="i a"><Clock3 size={18} /></span><div><strong>{todayT.length + weekT.length}</strong><em>Vencem {isThisWeek ? "hoje e nesta semana" : "na semana"}</em></div></div>
      <div className="v27-kpi"><span className="i c"><CalendarDays size={18} /></span><div><strong>{apps.length}</strong><em>Visitas / agendas na semana</em></div></div>
      <div className="v27-kpi"><span className={`i ${missing.length ? "a" : "v"}`}><Target size={18} /></span><div><strong>{actions.length}</strong><em>Próximas ações suas{missing.length ? ` · ${missing.length} projeto(s) sem` : ""}</em></div></div>
    </section>
    {msg && <div className="v27-flash">{msg}</div>}

    <div className="v27-week-grid">
      <section className="v27-panel">
        <header><h2><ListTodo size={17} /> Atividades</h2><small>{tasks.length} aberta(s) · clique no ✓ para concluir</small></header>
        {group("Vencidas", late, "late", AlertTriangle)}
        {group("Hoje", todayT, "today", Clock3)}
        {group(isThisWeek ? "Resto da semana" : "Nesta semana", weekT, "week", CalendarDays)}
        {group("Depois / sem prazo", later.slice(0, 12), "later", Timer)}
        {!tasks.length && <div className="v7-empty"><CheckCircle2 /> Nenhuma atividade aberta</div>}
        <button type="button" className="v17-link" onClick={() => onNavigate("/atividades")}>Ver todas as atividades →</button>
      </section>

      <section className="v27-panel">
        <header><h2><CalendarDays size={17} /> Agenda da semana</h2><small>{apps.length} compromisso(s)</small></header>
        <div className="v27-days">{days.map(d => { const list = apps.filter(a => a.date === d); const wd = new Date(d + "T12:00:00").getDay();
          return <div key={d} className={`v27-day ${d === today ? "today" : ""} ${d < today ? "past" : ""}`}><span className="dh"><b>{WD[wd]}</b><small>{brShort(d)}</small></span>
            <div className="items">{list.length ? list.map((a: Appointment) => { const p = projOf(a.projectId); return <button key={a.id} type="button" className={`v27-app ${/confirm/i.test(a.status) ? "ok" : ""}`} onClick={() => p && onOpen(p)}><b>{clientOf(a.clientId)}</b><small>{a.shift}{a.modality ? ` · ${a.modality}` : ""}{a.title ? ` · ${a.title}` : ""}</small><em>{a.status}</em></button>; }) : <span className="free">livre</span>}</div></div>; })}</div>
        <button type="button" className="v17-link" onClick={() => onNavigate("/agenda")}>Abrir a agenda →</button>
      </section>

      <section className="v27-panel">
        <header><h2><Target size={17} /> Próximas ações</h2><small>O que você combinou de fazer para os projetos andarem</small></header>
        {actions.map(p => { const lateA = p.nextActionDue && p.nextActionDue < today; return <button key={p.id} type="button" className={`v27-action ${lateA ? "late" : ""}`} onClick={() => onOpen(p)}>
          <b>{clientOf(p.clientId)}</b><span>{p.nextAction}</span><small>{p.nextActionDue ? (lateA ? `venceu ${br(p.nextActionDue)}` : `até ${br(p.nextActionDue)}`) : "sem prazo"}</small></button>; })}
        {missing.map(p => <button key={p.id} type="button" className="v27-action missing" onClick={() => onOpen(p)}><b>{clientOf(p.clientId)}</b><span>Sem próxima ação — você é dono da fase</span><small>definir</small></button>)}
        {!actions.length && !missing.length && <div className="v7-empty"><CheckCircle2 /> Nada pendente</div>}
      </section>

      <section className="v27-panel">
        <header><h2><Flag size={17} /> Projetos em que você é dono da fase</h2><small>{owned.length} projeto(s)</small></header>
        <div className="v27-owned">{owned.map(p => { const h = healthOf(p, today, data.tasks), f = fc.get(p.id); return <button key={p.id} type="button" className={`v27-proj h-${h.health}`} onClick={() => onOpen(p)}>
          <span className="top"><b>{clientOf(p.clientId)}</b><i className={`dot h-${h.health}`} title={healthLabel[h.health]} /></span>
          <small>{PHASES.find(x => x.key === phaseOf(p))?.short} · {h.inPhase ?? "–"} dias na fase</small>
          {f && <small className={`fc s-${f.status}`}><Rocket size={11} /> {f.status === "virou" ? `virou ${brShort(f.forecast)}` : `go-live previsto ${brShort(f.forecast)}`}{f.promised && f.status !== "virou" ? ` · prometido ${brShort(f.promised)}` : ""}</small>}
          {h.health !== "green" && h.reasons[0] && <em>{h.reasons[0]}</em>}
        </button>; })}</div>
        {!owned.length && <div className="v7-empty"><CheckCircle2 /> Nenhum projeto com você como dono da fase</div>}
      </section>
    </div>
  </div>;
}
