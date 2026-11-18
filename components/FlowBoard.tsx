"use client";
// V7 · Esteira por ondas: linhas = ondas, colunas = fases (começo → meio → fim).
// Cada cartão mostra semáforo, dono da fase, dias na fase, com quem está a bola e a próxima ação.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, ChevronRight, CircleDot, Clock3, ExternalLink, Eye, FileCheck2, FileClock, FileMinus2, FileText, FileX2, Flag, Hand, MessageSquarePlus, Monitor, Paperclip, RefreshCw, Search, Send, SkipForward, Target, Timer, Upload, UserRound, Wrench, X } from "lucide-react";
import type { Project, State } from "@/lib/types";
import { BALL, PHASES, ballOf, canMove, docOf, docStates, flowSummary, healthLabel, healthOf, movePhasePatch, phaseIndex, phaseOf, phaseOwner, phaseSince, type DocState, type Health, type PhaseKey } from "@/lib/flow";
import type { PhaseDoc } from "@/lib/types";
import ConfirmDialog, { type ConfirmBox } from "./ConfirmDialog";
import { fmtDate, initials, todayISO } from "@/lib/metrics";
import Select from "./Select";

type Props = { data: State; onRefresh: () => Promise<void> | void; onEdit: (p: Project) => void; onOpen: (p: Project) => void };
const clientName = (s: State, id: string) => s.clients.find(c => c.id === id)?.name || "Cliente";
const LANES = ["Onda 1", "Onda 2", "Onda 3", "Congelado"];
const laneOf = (p: Project) => (LANES.includes(p.wave) ? p.wave : phaseOf(p) === "fim" || p.wave === "Concluído" ? "Onda 3" : "Onda 1");

async function patchProject(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/records/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha ao salvar");
  return j as Project;
}

const DOC_STATE_LABEL: Record<DocState, string> = { ok: "anexado", missing: "PENDENTE — fase já passou sem o documento", pending: "pendente: necessário para avançar", sent: "enviado ao cliente — aguardando assinatura", skipped: "fase não utilizada", future: "fase futura" };
function DocIcon({ s, size = 13 }: { s: DocState; size?: number }) {
  return s === "ok" ? <FileCheck2 size={size} /> : s === "sent" ? <FileClock size={size} /> : s === "skipped" ? <FileMinus2 size={size} /> : s === "future" ? <FileText size={size} /> : <FileX2 size={size} />;
}
const fmtSize = (n?: number) => !n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function Dot({ h }: { h: Health }) { return <span className={`v7-dot v7-${h}`} aria-label={healthLabel[h]} />; }

export default function FlowBoard({ data, onRefresh, onEdit, onOpen }: Props) {
  const [wave, setWave] = useState(""), [health, setHealth] = useState<"" | Health>(""), [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const sum = useMemo(() => flowSummary(data), [data]);
  const visible = sum.reports.filter(r =>
    (!wave || laneOf(r.p) === wave) && (!health || r.h.health === health) &&
    (!q || `${clientName(data, r.p.clientId)} ${r.p.name} ${phaseOwner(r.p)} ${r.p.blocker} ${ballOf(r.p)}`.toLowerCase().includes(q.toLowerCase())));
  const lanes = (wave ? [wave] : LANES).filter(l => visible.some(r => laneOf(r.p) === l) || !wave);
  const project = selected ? data.projects.find(p => p.id === selected) || null : null;

  return <div className="v7-flow">
    <div className="page-header v4-page-header v7-flow-header">
      <div className="v4-heading-copy">
        <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  ESTEIRA POR ONDAS</div>
        <h1>Esteira de projetos</h1>
        <p>Do kickoff ao encerramento: fase atual, dono, tempo parado e gargalos de cada cliente, por onda.</p>
        <div className="v4-heading-caption"><CheckCircle2 size={13} /> Semáforo calculado automaticamente · encerrados há +30 dias vão para o arquivo ({sum.archived})</div>
      </div>
      <div className="header-actions">
        <button className="btn ghost v4-secondary-action" onClick={() => void onRefresh()}><RefreshCw size={16} /> Atualizar</button>
        <a className="btn primary v4-primary-action" href="/tv" target="_blank" rel="noreferrer"><Monitor size={17} /> Modo TV</a>
      </div>
    </div>

    <section className="v7-pulse">
      <button className={`v7-pulse-tile v7-red ${health === "red" ? "on" : ""}`} onClick={() => setHealth(h => h === "red" ? "" : "red")}><span><AlertTriangle size={20} /></span><strong>{sum.red}</strong><em>Críticos</em><small>bloqueio, prazo vencido ou 7+ dias parado</small></button>
      <button className={`v7-pulse-tile v7-amber ${health === "amber" ? "on" : ""}`} onClick={() => setHealth(h => h === "amber" ? "" : "amber")}><span><Clock3 size={20} /></span><strong>{sum.amber}</strong><em>Atenção</em><small>parado 3+ dias ou sem próxima ação</small></button>
      <button className={`v7-pulse-tile v7-green ${health === "green" ? "on" : ""}`} onClick={() => setHealth(h => h === "green" ? "" : "green")}><span><CheckCircle2 size={20} /></span><strong>{sum.green}</strong><em>No fluxo</em><small>andando dentro do esperado</small></button>
      <div className="v7-pulse-tile v7-ball"><span><Hand size={20} /></span><em>Com quem está a bola</em><div>{sum.ball.map(b => <b key={b.name}><i>{b.count}</i>{b.name}</b>)}</div></div>
    </section>

    <div className="v7-toolbar">
      <div className="v7-chips">{["", ...LANES].map(w => <button key={w || "all"} className={wave === w ? "on" : ""} onClick={() => setWave(w)}>{w || "Todas as ondas"}</button>)}</div>
      <label className="searchfield v7-search"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cliente, dono, empecilho..." />{q && <button onClick={() => setQ("")} aria-label="Limpar"><X size={14} /></button>}</label>
      <div className="v7-legend"><span><Dot h="red" /> Crítico</span><span><Dot h="amber" /> Atenção</span><span><Dot h="green" /> No fluxo</span></div>
    </div>

    <div className="v7-board-scroll">
      <div className="v7-board" style={{ gridTemplateColumns: `132px repeat(${PHASES.length}, minmax(190px, 1fr))` }}>
        <div className="v7-corner">ONDA / FASE</div>
        {PHASES.map((ph, i) => {
          const n = visible.filter(r => r.phase === ph.key).length;
          return <div key={ph.key} className={`v7-phase-head ${i === 0 ? "first" : ""} ${ph.key === "fim" ? "last" : ""}`}><span className="v7-step">{i + 1}</span><div><strong>{ph.short}</strong><small>{n} projeto{n === 1 ? "" : "s"}</small></div></div>;
        })}
        {lanes.map(lane => <FragmentLane key={lane} lane={lane} data={data} rows={visible.filter(r => laneOf(r.p) === lane)} onPick={id => setSelected(id)} />)}
      </div>
    </div>
    {!visible.length && <div className="panel v7-empty"><CircleDot size={22} /> Nenhum projeto com estes filtros.</div>}

    {project && <ProjectDrawer key={project.id} data={data} p={project} onClose={() => setSelected(null)} onRefresh={onRefresh} onEdit={onEdit} onOpen={onOpen} />}
  </div>;
}

function FragmentLane({ lane, rows, data, onPick }: { lane: string; rows: ReturnType<typeof flowSummary>["reports"]; data: State; onPick: (id: string) => void }) {
  const red = rows.filter(r => r.h.health === "red").length;
  return <>
    <div className={`v7-lane ${lane === "Congelado" ? "frozen" : ""}`}><strong>{lane}</strong><small>{rows.length} projeto{rows.length === 1 ? "" : "s"}</small>{red > 0 && <em><Dot h="red" /> {red}</em>}</div>
    {PHASES.map(ph => <div key={ph.key} className={`v7-cell ${ph.key === "fim" ? "done" : ""}`}>
      {rows.filter(r => r.phase === ph.key).sort((a, b) => ({ red: 0, amber: 1, green: 2, done: 3 }[a.h.health] - { red: 0, amber: 1, green: 2, done: 3 }[b.h.health])).map(({ p, h }) =>
        <button key={p.id} className={`v7-card v7-${h.health}`} onClick={() => onPick(p.id)} title={h.reasons.join(" · ")}>
          <div className="v7-card-top"><strong>{clientName(data, p.clientId)}</strong><Dot h={h.health} /></div>
          <div className="v7-card-owner"><span className="v7-av">{initials(phaseOwner(p))}</span>{phaseOwner(p)}</div>
          <div className="v7-card-meta">
            <span title="Dias na fase"><Timer size={12} />{h.inPhase ?? "–"}d</span>
            <span className={`v7-ball-chip b-${ballOf(p).split(" ")[0].toLowerCase()}`} title="Com quem está a bola"><Hand size={11} />{ballOf(p)}</span>
          </div>
          <div className="v7-docs" aria-label="Documentos da esteira">{docStates(p).map(d => <span key={d.key} className={`v7-doc s-${d.state}`} title={`${d.label} · ${d.doc}: ${DOC_STATE_LABEL[d.state]}`}><DocIcon s={d.state} /><b>{d.letter}</b></span>)}</div>
          {h.health !== "done" && (p.nextAction ? <div className="v7-card-next"><Target size={12} />{p.nextAction}</div> : (p.blocker && p.blocker !== "-" ? <div className="v7-card-block"><AlertTriangle size={12} />{p.blocker}</div> : <div className="v7-card-warn">Definir próxima ação</div>))}
        </button>)}
    </div>)}
  </>;
}

function ProjectDrawer({ data, p, onClose, onRefresh, onEdit, onOpen }: { data: State; p: Project; onClose: () => void; onRefresh: Props["onRefresh"]; onEdit: Props["onEdit"]; onOpen: Props["onOpen"] }) {
  const k = phaseOf(p), h = healthOf(p), idx = phaseIndex(k);
  const nextOptions: PhaseKey[] = idx >= PHASES.length - 1 ? [] : k === "homolog" ? ["campo", "golive"] : [PHASES[idx + 1].key];
  const [next, setNext] = useState({ nextAction: p.nextAction || "", nextActionOwner: p.nextActionOwner || "", nextActionDue: p.nextActionDue || "" });
  const [blocker, setBlocker] = useState(p.blocker && p.blocker !== "-" ? p.blocker : "");
  const [note, setNote] = useState(""), [busy, setBusy] = useState(""), [msg, setMsg] = useState(""), [msgErr, setMsgErr] = useState(false);
  const [pct, setPct] = useState(0), [docPhase, setDocPhase] = useState<PhaseKey>("kickoff"), [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null), [meName, setMeName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { fetch("/api/auth", { cache: "no-store" }).then(r => r.json()).then(j => setMeName(j.name || "")).catch(() => {}); }, []);
  const docs = docStates(p);
  const flash = (text: string, err = false) => { setMsg(text); setMsgErr(err); if (!err) window.setTimeout(() => setMsg(""), 2600); };
  const pickFile = (k2: PhaseKey) => { setDocPhase(k2); fileRef.current?.click(); };
  async function uploadDoc(file: File) {
    const phase = docPhase, meta = PHASES.find(x => x.key === phase)!;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return flash("Envie o documento em PDF.", true);
    if (file.size > 25 * 1048576) return flash("O PDF deve ter no máximo 25 MB.", true);
    setBusy("doc"); setPct(0); setMsg("");
    try {
      const r = await fetch("/api/docs/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id, phase }) });
      const t = await r.json(); if (!r.ok) throw new Error(t.error || "Falha ao preparar o envio.");
      await new Promise<void>((res, rej) => {
        const x = new XMLHttpRequest(); x.open("POST", t.uploadUrl);
        x.setRequestHeader("apikey", t.apikey); x.setRequestHeader("Authorization", `Bearer ${t.apikey}`); x.setRequestHeader("Content-Type", "application/pdf"); x.setRequestHeader("x-upsert", "false");
        x.upload.onprogress = e => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
        x.onload = () => (x.status < 300 ? res() : rej(new Error(`Falha no envio do PDF (${x.status}). ${x.responseText.slice(0, 120)}`)));
        x.onerror = () => rej(new Error("Falha de conexão ao enviar o PDF."));
        x.send(file);
      });
      const doc: PhaseDoc = { path: t.path, name: file.name, size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: meName || undefined };
      const tl = [{ id: crypto.randomUUID(), at: new Date().toISOString(), kind: "doc", author: meName || undefined, text: `PDF anexado · ${meta.doc}: ${file.name}` }, ...(p.timeline || [])].slice(0, 200);
      await patchProject(p.id, { phases: { ...(p.phases || {}), [phase]: { ...(p.phases?.[phase] || {}), doc, docSentAt: null } }, timeline: tl, lastMovement: todayISO() });
      await onRefresh(); flash(`${meta.doc} anexado`);
    } catch (e) { flash(e instanceof Error ? e.message : "Falha ao anexar.", true); }
    finally { setBusy(""); setPct(0); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function viewDoc(k2: PhaseKey, doc: PhaseDoc) {
    const w = window.open("about:blank", "_blank");
    try {
      const r = await fetch("/api/docs/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id, phase: k2, path: doc.path, name: doc.name }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao abrir o documento.");
      if (w) w.location.href = j.url; else window.location.href = j.url;
    } catch (e) { w?.close(); flash(e instanceof Error ? e.message : "Falha ao abrir.", true); }
  }
  function removeDoc(k2: PhaseKey, doc: PhaseDoc) {
    const meta = PHASES.find(x => x.key === k2)!;
    setConfirmBox({ icon: "trash", title: "Remover este documento?", message: `O ${meta.doc.toLowerCase()} deixará de valer para a fase ${meta.short}. Se a fase já foi concluída, o projeto volta a aparecer com documentação pendente.`,
      details: [{ label: "Arquivo", value: doc.name }, { label: "Fase", value: meta.short }, { label: "Anexado em", value: new Date(doc.uploadedAt).toLocaleString("pt-BR") }], confirmLabel: "Sim, remover documento", cancelLabel: "Manter documento",
      onConfirm: async () => {
        const tl = [{ id: crypto.randomUUID(), at: new Date().toISOString(), kind: "doc", author: meName || undefined, text: `PDF removido · ${meta.doc}: ${doc.name}` }, ...(p.timeline || [])].slice(0, 200);
        await patchProject(p.id, { phases: { ...(p.phases || {}), [k2]: { ...(p.phases?.[k2] || {}), doc: null } }, timeline: tl });
        await onRefresh(); flash("Documento removido");
      } });
  }
  async function toggleSent(k2: PhaseKey) {
    const meta = PHASES.find(x => x.key === k2)!, on = !p.phases?.[k2]?.docSentAt, cur = k2 === k;
    const text = on ? `${meta.doc} enviado ao cliente para assinatura` : `${meta.doc}: envio ao cliente desmarcado`;
    const tl = [{ id: crypto.randomUUID(), at: new Date().toISOString(), kind: "doc", author: meName || undefined, text }, ...(p.timeline || [])].slice(0, 200);
    setBusy("sent");
    try {
      await patchProject(p.id, { phases: { ...(p.phases || {}), [k2]: { ...(p.phases?.[k2] || {}), docSentAt: on ? todayISO() : null, docSentBy: on ? meName || undefined : undefined } }, timeline: tl, lastMovement: todayISO(), ...(on && cur ? { ballWith: "Cliente" } : {}) });
      await onRefresh(); flash(on ? (cur ? "Marcado como enviado · bola com o Cliente" : "Marcado como enviado ao cliente") : "Envio desmarcado");
    } catch (e) { flash(e instanceof Error ? e.message : "Falha ao salvar.", true); } finally { setBusy(""); }
  }
  const owners = [...new Set([...data.staff.filter(s => s.active).map(s => s.name), "Time de Implantação", "Dev & Integrações", "Cliente", "ERP Parceiro"])];
  const tasks = data.tasks.filter(t => t.projectId === p.id && !/conclu|cancel/i.test(t.status));
  const apps = data.appointments.filter(a => a.projectId === p.id && a.date && a.date >= todayISO()).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 4);
  const timeline = [...(p.timeline || [])];
  async function save(label: string, body: Record<string, unknown>, event?: string) {
    setBusy(label); setMsg("");
    try {
      const tl = event ? [{ id: crypto.randomUUID(), at: new Date().toISOString(), text: event, kind: "nota" }, ...(p.timeline || [])].slice(0, 200) : undefined;
      await patchProject(p.id, { ...body, ...(tl ? { timeline: tl } : {}), lastMovement: todayISO() });
      await onRefresh(); flash("Salvo");
    } catch (e) { flash(e instanceof Error ? e.message : "Falha ao salvar", true); } finally { setBusy(""); }
  }
  const move = (to: PhaseKey) => save("move", movePhasePatch(p, to));
  const setPhaseOwner = (owner: string) => save("owner", { phases: { ...(p.phases || {}), [k]: { ...(p.phases?.[k] || {}), owner, start: p.phases?.[k]?.start || phaseSince(p, k) } } });
  const setPhaseDue = (due: string) => save("due", { phases: { ...(p.phases || {}), [k]: { ...(p.phases?.[k] || {}), owner: phaseOwner(p, k), start: p.phases?.[k]?.start || phaseSince(p, k), due: due || null } } });

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);
  if (!mounted) return null;
  return createPortal(<div className="v7-drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="v7-drawer" role="dialog" aria-modal="true" aria-label={`Projeto ${clientName(data, p.clientId)}`}>
      <header className={`v7-drawer-head v7-${h.health}`}>
        <div><span className="v7-drawer-eyebrow">{p.wave || "Sem onda"} · {p.system}</span><h2>{clientName(data, p.clientId)}</h2>
          <div className="v7-drawer-tags"><span className={`v7-health-pill v7-${h.health}`}><Dot h={h.health} />{healthLabel[h.health]}</span><span className="v7-ghost-pill"><Timer size={13} />{h.inPhase ?? "–"} dias na fase</span><span className="v7-ghost-pill"><Clock3 size={13} />{h.idle ?? "–"} dias sem movimento</span></div></div>
        <button className="v7-x" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </header>
      <div className="v7-drawer-body">
        <ol className="v7-stepper">{PHASES.map((ph, i) => {
          const info = p.phases?.[ph.key];
          const state = i < idx ? "past" : i === idx ? "now" : "next";
          const ds = docs.find(d => d.key === ph.key);
          return <li key={ph.key} className={`${state}${ph.optional ? " optional" : ""}`}><span className="v7-step-dot">{i < idx ? <CheckCircle2 size={14} /> : i + 1}</span>{ds && <em className={`v7-step-doc s-${ds.state}`} title={`${ds.doc}: ${DOC_STATE_LABEL[ds.state]}`}><DocIcon s={ds.state} size={11} /></em>}<div><strong>{ph.short}</strong>{ph.optional && <small className="v7-opt">opcional</small>}<small>{i <= idx ? phaseOwner(p, ph.key) : ph.defaultOwner || "—"}</small>{info?.start && <small>{fmtDate(info.start)}{info.done ? ` → ${fmtDate(info.done)}` : ""}</small>}</div></li>;
        })}</ol>

        {h.reasons.length > 0 && h.health !== "done" && <div className={`v7-reasons v7-${h.health}`}>{h.reasons.map(r => <div key={r}><AlertTriangle size={14} />{r}</div>)}</div>}

        <section className="v7-box">
          <h3><Flag size={15} /> Fase atual: {PHASES[idx].label}</h3>
          <div className="v7-grid2">
            <label><span>Dono da fase</span><Select value={phaseOwner(p)} onChange={e => void setPhaseOwner(e.target.value)} disabled={!!busy}>{[...new Set([phaseOwner(p), ...owners])].map(o => <option key={o}>{o}</option>)}</Select></label>
            <label><span>Prazo da fase</span><input type="date" value={p.phases?.[k]?.due || ""} onChange={e => void setPhaseDue(e.target.value)} disabled={!!busy} /></label>
          </div>
          <div className="v7-ball-switch"><span>Bola com</span>{BALL.map(b => <button key={b} className={ballOf(p) === b ? "on" : ""} disabled={!!busy} onClick={() => void save("ball", { ballWith: b }, `Bola passou para ${b}`)}>{b}</button>)}</div>
          <div className="v7-move">
            <button className="btn outline" disabled={idx === 0 || !!busy} onClick={() => void move(PHASES[idx - 1].key)}><ArrowLeft size={15} /> Voltar fase</button>
            {nextOptions.map(to => { const g = canMove(p, to); const skip = k === "homolog" && to === "golive";
              return <button key={to} className={`btn ${skip ? "outline v7-skip" : "primary"}`} disabled={!g.ok || !!busy} title={g.reason} onClick={() => void move(to)}>{busy === "move" ? <RefreshCw className="spin" size={15} /> : skip ? <SkipForward size={15} /> : null}{skip ? "Pular para Go-live" : `Avançar para ${PHASES[phaseIndex(to)].short}`}{!skip && <ArrowRight size={15} />}</button>; })}
          </div>
          {nextOptions.length > 0 && !canMove(p, nextOptions[0]).ok && <div className="v7-gate"><FileX2 size={18} /><span>{canMove(p, nextOptions[0]).reason}</span>{PHASES[idx].doc && <button type="button" onClick={() => pickFile(k)} disabled={!!busy}><Upload size={14} /> Anexar agora</button>}</div>}
        </section>

        <section className="v7-box v7-docs-box">
          <h3><Paperclip size={15} /> Documentos da esteira <em>{docs.filter(d => d.state === "ok").length}/{docs.filter(d => d.state !== "skipped").length}</em></h3>
          {docs.map(d => { const doc = docOf(p, d.key); return <div key={d.key} className={`v7-doc-row s-${d.state}`}>
            <span className="v7-doc-ico"><DocIcon s={d.state} size={18} /></span>
            <div className="v7-doc-txt"><strong>{d.doc}</strong><small>{d.label} · {doc ? `${doc.name}${doc.size ? " · " + fmtSize(doc.size) : ""} · ${new Date(doc.uploadedAt).toLocaleDateString("pt-BR")}${doc.uploadedBy ? " · " + doc.uploadedBy : ""}` : DOC_STATE_LABEL[d.state]}{!doc && d.state === "sent" && p.phases?.[d.key]?.docSentAt ? ` desde ${fmtDate(p.phases[d.key]!.docSentAt)}` : ""}</small></div>
            <div className="v7-doc-act">
              {!doc && (d.state === "pending" || d.state === "missing" || d.state === "sent") && <button type="button" className={`v7-mini-btn sent ${d.state === "sent" ? "on" : ""}`} disabled={!!busy} onClick={() => void toggleSent(d.key)} title={d.state === "sent" ? "Desmarcar envio" : "Marcar que o documento foi enviado ao cliente para assinatura"}><Send size={14} /> {d.state === "sent" ? "Enviado" : "Enviado ao cliente"}</button>}
              {doc && <button type="button" className="v7-mini-btn" onClick={() => void viewDoc(d.key, doc)}><Eye size={14} /> Ver</button>}
              <button type="button" className={`v7-mini-btn ${doc ? "" : "primary"}`} disabled={!!busy} onClick={() => pickFile(d.key)}><Upload size={14} /> {doc ? "Substituir" : "Anexar PDF"}</button>
              {doc && <button type="button" className="v7-mini-btn danger" disabled={!!busy} onClick={() => removeDoc(d.key, doc)} aria-label="Remover documento"><X size={14} /></button>}
            </div>
          </div>; })}
          {busy === "doc" && <div className="v7-upload"><span>Enviando {PHASES.find(x => x.key === docPhase)?.doc.toLowerCase()}… {pct}%</span><i><b style={{ width: `${pct}%` }} /></i></div>}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void uploadDoc(f); }} />
        </section>

        <section className="v7-box">
          <h3><Target size={15} /> Próxima ação</h3>
          <input className="v7-input" placeholder="O que precisa acontecer para o projeto andar?" value={next.nextAction} onChange={e => setNext(n => ({ ...n, nextAction: e.target.value }))} />
          <div className="v7-grid2">
            <label><span>Responsável</span><Select value={next.nextActionOwner} onChange={e => setNext(n => ({ ...n, nextActionOwner: e.target.value }))}><option value="">Selecione</option>{owners.map(o => <option key={o}>{o}</option>)}</Select></label>
            <label><span>Até quando</span><input type="date" value={next.nextActionDue || ""} onChange={e => setNext(n => ({ ...n, nextActionDue: e.target.value }))} /></label>
          </div>
          <button className="btn primary v7-save" disabled={!!busy || !next.nextAction.trim()} onClick={() => void save("next", { ...next, nextActionDue: next.nextActionDue || null }, `Próxima ação: ${next.nextAction}${next.nextActionOwner ? ` (${next.nextActionOwner})` : ""}`)}>Salvar próxima ação</button>
        </section>

        <section className="v7-box">
          <h3><AlertTriangle size={15} /> Empecilho</h3>
          <div className="v7-inline"><input className="v7-input" placeholder="Nenhum empecilho" value={blocker} onChange={e => setBlocker(e.target.value)} />
            <button className="btn outline" disabled={!!busy || blocker === (p.blocker === "-" ? "" : p.blocker)} onClick={() => void save("blk", { blocker: blocker.trim() }, blocker.trim() ? `Empecilho: ${blocker.trim()}` : "Empecilho resolvido")}>{blocker.trim() ? "Registrar" : "Resolver"}</button></div>
        </section>

        <section className="v7-box">
          <h3><MessageSquarePlus size={15} /> Linha do tempo</h3>
          <div className="v7-inline"><input className="v7-input" placeholder="Registrar acontecimento curto (ex.: cliente liberou servidor)" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && note.trim()) { void save("note", {}, note.trim()); setNote(""); } }} />
            <button className="btn primary" disabled={!note.trim() || !!busy} onClick={() => { void save("note", {}, note.trim()); setNote(""); }}>Registrar</button></div>
          <ul className="v7-timeline">
            {timeline.slice(0, 12).map(ev => <li key={ev.id} className={ev.kind === "fase" ? "phase" : ""}><time>{new Date(ev.at).toLocaleDateString("pt-BR")}</time><span>{ev.text}</span></li>)}
            {p.notes && <li className="legacy"><time>Histórico</time><span>{p.notes}</span></li>}
            {!timeline.length && !p.notes && <li className="empty">Sem registros ainda.</li>}
          </ul>
        </section>

        {(tasks.length > 0 || apps.length > 0) && <section className="v7-box">
          <h3><CalendarClock size={15} /> Em andamento</h3>
          {tasks.map(t => <div className="v7-mini" key={t.id}><ChevronRight size={13} /><span>{t.title}</span><small>{t.owner || "—"} · {t.dueDate ? fmtDate(t.dueDate) : "sem prazo"}</small></div>)}
          {apps.map(a => <div className="v7-mini" key={a.id}><CalendarClock size={13} /><span>{a.title}</span><small>{a.consultant} · {fmtDate(a.date)} · {a.shift}</small></div>)}
        </section>}
      </div>
      <footer className="v7-drawer-foot">
        <span className={`v7-msg${msgErr ? " err" : ""}`}>{msg}</span>
        <button className="btn outline" onClick={() => onEdit(p)}><Wrench size={15} /> Editar cadastro</button>
        <button className="btn outline" onClick={() => onOpen(p)}><ExternalLink size={15} /> Ficha completa</button>
        <span className="v7-owner-tag"><UserRound size={13} />{phaseOwner(p)}</span>
      </footer>
    </aside>
    {confirmBox && <ConfirmDialog box={confirmBox} onClose={() => setConfirmBox(null)} />}
  </div>, document.body);
}
