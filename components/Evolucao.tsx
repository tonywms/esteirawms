"use client";
// V18 · Evolução da esteira: linhas no estilo pesquisa eleitoral — cada cliente, fase, consultor
// ou onda sobe e desce ao longo dos dias. Fotos diárias reais + estimativa tracejada antes delas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Eye, EyeOff, LineChart, Minus, Pause, Play, RefreshCw, Search, Sparkles, Trophy } from "lucide-react";
import type { State } from "@/lib/types";
import { buildSeries, dayRange, type GroupBy, type Metric, type Series, type Snap } from "@/lib/evolucao";
import { avatarUrl, initials } from "@/lib/avatars";

/** Bolinha com a foto (ou as iniciais) do consultor, com o anel na cor da linha. */
function Face({ x, y, r, s, ring = 3 }: { x: number; y: number; r: number; s: Series; ring?: number }) {
  const url = avatarUrl(s.label);
  return <g className="v18-face">
    <circle cx={x} cy={y} r={r + ring} fill={s.color} />
    <circle cx={x} cy={y} r={r} fill="#fff" />
    {url ? <image href={url} x={x - r} y={y - r} width={r * 2} height={r * 2} clipPath="url(#v18-round)" preserveAspectRatio="xMidYMid slice" />
      : <text x={x} y={y + r * .36} textAnchor="middle" className="v18-face-ini" style={{ fontSize: r * .9, fill: s.color }}>{initials(s.label)}</text>}
  </g>;
}
/** Espalha na vertical as bolinhas que cairiam umas sobre as outras (mantendo a ordem). */
function dodge<T extends { y: number }>(items: T[], gap: number, top: number, bottom: number) {
  const a = [...items].sort((p, q) => p.y - q.y).map(i => ({ ...i, ay: i.y }));
  for (let i = 1; i < a.length; i++) if (a[i].ay - a[i - 1].ay < gap) a[i].ay = a[i - 1].ay + gap;
  const over = a.length ? a[a.length - 1].ay - bottom : 0;
  if (over > 0) for (const i of a) i.ay -= over;
  for (let i = 0; i < a.length; i++) if (a[i].ay < top + i * gap) a[i].ay = Math.max(a[i].ay, top + i * gap);
  return a;
}

type Props = { data: State; onNavigate: (path: string) => void };
type Payload = { today: string; since: string; firstReal: string; rows: Snap[] };
const VIEWS: { key: GroupBy; label: string }[] = [{ key: "fase", label: "Fase" }, { key: "consultor", label: "Consultor" }, { key: "cliente", label: "Cliente" }, { key: "onda", label: "Onda" }];
const METRICS: { key: Metric; label: string; hint: string }[] = [
  { key: "avanco", label: "Avanço", hint: "Quanto do caminho até o go-live já foi percorrido (fase + atividades concluídas)." },
  { key: "saude", label: "Saúde", hint: "100 menos o peso dos problemas: atraso, tempo parado, empecilho, meta, retrabalho e bola fora." },
  { key: "participacao", label: "Participação", hint: "Fatia dos projetos ativos em cada grupo — como a intenção de voto." },
];
const PERIODS = [{ d: 7, label: "7 dias" }, { d: 30, label: "30 dias" }, { d: 90, label: "90 dias" }, { d: 0, label: "Tudo" }];
const fmtDay = (d: string) => { const [, m, dd] = d.split("-"); return `${dd}/${m}`; };
const fmtLong = (d: string) => { const t = new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`);

/** Curva suave que não "passa do ponto" (monotone cubic). */
function smooth(pts: { x: number; y: number }[]) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length, dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = (pts[i + 1].y - pts[i].y) / (dx[i] || 1); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b; if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`; }
  return d;
}

function Spark({ s }: { s: Series }) {
  const vs = s.points.map(p => p.v).filter((v): v is number => v !== null);
  if (vs.length < 2) return <svg className="v18-spark" viewBox="0 0 90 26" aria-hidden="true"><circle cx="45" cy="13" r="2.5" fill={s.color} /></svg>;
  const lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
  const pts = vs.map((v, i) => ({ x: 2 + i * 86 / (vs.length - 1), y: 22 - (v - lo) / r * 18 }));
  return <svg className="v18-spark" viewBox="0 0 90 26" aria-hidden="true"><path d={smooth(pts)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" /><circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.6" fill={s.color} /></svg>;
}

export default function Evolucao({ data, onNavigate }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [by, setBy] = useState<GroupBy>("cliente"), [metric, setMetric] = useState<Metric>("avanco"), [period, setPeriod] = useState(30);
  const [hidden, setHidden] = useState<Set<string>>(new Set()), [focus, setFocus] = useState<string | null>(null), [hover, setHover] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false), [q, setQ] = useState(""), [allRows, setAllRows] = useState(false);
  const [upTo, setUpTo] = useState<number | null>(null), [playing, setPlaying] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), [W, setW] = useState(900);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await fetch("/api/evolucao?dias=365", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha ao carregar."); setPayload(j); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar a evolução."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(e => setW(Math.max(320, Math.round(e[0].contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, [payload]);
  useEffect(() => { setHidden(new Set()); setShowAll(false); setFocus(null); setUpTo(null); setPlaying(false); setQ(""); }, [by]);
  useEffect(() => { if (by === "cliente") setMetric(m => (m === "participacao" ? "avanco" : m)); }, [by]);

  const clientNames = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c.name])), [data.clients]);
  const days = useMemo(() => {
    if (!payload) return [];
    const all = dayRange(payload.since, payload.today);
    return period ? all.slice(-period) : all;
  }, [payload, period]);
  const series = useMemo(() => payload ? buildSeries(payload.rows.filter(r => days.includes(r.day)), days, by, metric, { clients: clientNames }) : [], [payload, days, by, metric, clientNames]);

  // Cliente/Consultor: muitas linhas — mostra as 8 que mais se mexeram (e as que você ligar)
  const defaultVisible = useMemo(() => {
    if (by === "fase" || by === "onda" || showAll) return new Set(series.map(s => s.key));
    const ranked = [...series].sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || (b.last ?? 0) - (a.last ?? 0));
    return new Set(ranked.slice(0, 8).map(s => s.key));
  }, [series, by, showAll]);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  useEffect(() => { setPinned(new Set()); }, [by]);
  const visible = series.filter(s => (defaultVisible.has(s.key) || pinned.has(s.key)) && !hidden.has(s.key));
  const toggle = (k: string) => {
    if (defaultVisible.has(k) || pinned.has(k)) {
      if (hidden.has(k)) { const h = new Set(hidden); h.delete(k); setHidden(h); }
      else { const h = new Set(hidden); h.add(k); setHidden(h); }
    } else { const p = new Set(pinned); p.add(k); setPinned(p); const h = new Set(hidden); h.delete(k); setHidden(h); }
  };

  // Reproduzir: a "apuração" dia a dia
  useEffect(() => {
    if (!playing) return;
    const total = days.length;
    const step = Math.max(120, Math.min(600, 5000 / Math.max(total, 1)));
    const t = window.setInterval(() => setUpTo(u => { const n = (u ?? 0) + 1; if (n >= total - 1) { setPlaying(false); return null; } return n; }), step);
    return () => window.clearInterval(t);
  }, [playing, days.length]);
  const cut = upTo ?? days.length - 1;

  // Geometria
  const faces = by === "consultor";
  const R = W < 640 ? 11 : 15;
  const H = W < 640 ? 320 : 440, ML = faces ? 40 + R : 40, MR = (W < 640 ? 112 : 200) + (faces ? R + 10 : 0), MT = faces ? 22 + R : 22, MB = faces ? 34 + R / 2 : 34;
  const iw = Math.max(60, W - ML - MR), ih = H - MT - MB;
  const allVals = visible.flatMap(s => s.points.slice(0, cut + 1).map(p => p.v)).filter((v): v is number => v !== null);
  const vmin = allVals.length ? Math.min(...allVals) : 0, vmax = allVals.length ? Math.max(...allVals) : 100;
  const y0 = Math.max(0, Math.floor((vmin - 6) / 10) * 10), y1 = Math.min(100, Math.max(y0 + 20, Math.ceil((vmax + 6) / 10) * 10));
  const X = (i: number) => ML + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const Y = (v: number) => MT + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(y0 + (y1 - y0) * i / 4));
  const xEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(iw / 70))));

  const lines = visible.map(s => {
    const pts = s.points.map((p, i) => ({ ...p, i })).filter(p => p.v !== null && p.i <= cut) as { v: number; i: number; est: boolean; day: string; n: number }[];
    const est = pts.filter(p => p.est), real = pts.filter(p => !p.est);
    const estPath = est.length ? smooth([...est, ...(real[0] ? [real[0]] : [])].map(p => ({ x: X(p.i), y: Y(p.v) }))) : "";
    const realPath = smooth(real.map(p => ({ x: X(p.i), y: Y(p.v) })));
    const end = pts[pts.length - 1];
    return { s, pts, estPath, realPath, end };
  });
  // rótulos à direita sem sobreposição
  const labels = lines.filter(l => l.end).map(l => ({ key: l.s.key, y: Y(l.end!.v), l })).sort((a, b) => a.y - b.y);
  const gap = faces ? Math.max(W < 640 ? 18 : 24, 2 * R + 8) : W < 640 ? 18 : 24;
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;
  const overflow = labels.length ? labels[labels.length - 1].y - (MT + ih) : 0;
  if (overflow > 0) for (const l of labels) l.y -= overflow;
  for (let i = 0; i < labels.length; i++) if (labels[i].y < MT) labels[i].y = MT + i * gap;

  const hi = hover !== null && hover <= cut ? hover : null;
  // Fotos: em todos os pontos quando há poucos dias; senão no último ponto e no dia sob o mouse
  const faceDays = new Set<number>();
  if (faces) {
    const lastIdx = Math.max(-1, ...lines.map(l => l.end?.i ?? -1));
    if (days.length <= 10) lines.forEach(l => l.pts.forEach(p => faceDays.add(p.i))); else if (lastIdx >= 0) faceDays.add(lastIdx);
    if (hover !== null && hover <= cut) faceDays.add(hover);
  }
  const lastFaceIdx = Math.max(-1, ...lines.map(l => l.end?.i ?? -1));
  const faceLayers = faces ? [...faceDays].sort((a, b) => a - b).map(i => {
    const items = lines.map(l => { const p = l.pts.find(q => q.i === i); return p ? { s: l.s, x: X(i), y: Y(p.v) } : null; }).filter(Boolean) as { s: Series; x: number; y: number }[];
    const last = i === lastFaceIdx;
    if (last || i === hover) return { i, last, items: dodge(items, 2 * (last ? R : R - 3) + 6, MT - R / 2, MT + ih + R / 2).map(it => ({ ...it, face: true })) };
    // pontos do meio: foto só onde cabe sem empurrar ninguém; o resto vira bolinha simples
    const placed: number[] = [], gapMid = 2 * (R - 3) + 5;
    const pri = [...items].sort((a, b) => (focus === a.s.key ? -1 : focus === b.s.key ? 1 : 0) || a.y - b.y);
    return { i, last, items: pri.map(it => { const ok = placed.every(y => Math.abs(y - it.y) >= gapMid); if (ok) placed.push(it.y); return { ...it, ay: it.y, face: ok }; }) };
  }) : [];
  const tip = hi !== null ? visible.map(s => ({ s, p: s.points[hi], prev: s.points.slice(0, hi).reverse().find(p => p.v !== null) })).filter(x => x.p?.v !== null && x.p?.v !== undefined).sort((a, b) => (b.p.v ?? 0) - (a.p.v ?? 0)) : [];
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * iw;
    setHover(days.length <= 1 ? 0 : Math.max(0, Math.min(days.length - 1, Math.round(x / iw * (days.length - 1)))));
  };

  const ranked = [...series].filter(s => s.delta !== null);
  const up = [...ranked].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
  const down = [...ranked].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  const leader = [...series].sort((a, b) => (b.last ?? -1) - (a.last ?? -1))[0];
  const realDays = payload ? new Set(payload.rows.filter(r => !r.est).map(r => r.day)).size : 0;
  const estUntil = payload && payload.since < payload.firstReal ? payload.firstReal : null;
  const metricInfo = METRICS.find(m => m.key === metric)!;
  const listForChips = series.filter(s => !q || s.label.toLowerCase().includes(q.toLowerCase()));

  return <div className="v18">
    <div className="page-header v4-page-header">
      <div className="v4-heading-copy">
        <div className="eyebrow"><span className="v4-live-dot" /> WMS EXPERT  /  EVOLUÇÃO DA ESTEIRA</div>
        <h1>Quem sobe e quem desce na esteira</h1>
        <p>A evolução de cada cliente, fase, consultor e onda, dia a dia, como numa apuração.</p>
      </div>
      <div className="header-actions">
        <button className="btn ghost v4-secondary-action" onClick={() => void load()}><RefreshCw size={16} className={loading ? "spin" : ""} /> Atualizar</button>
        <button className="btn primary v4-primary-action" onClick={() => { if (playing) { setPlaying(false); return; } setUpTo(0); setPlaying(true); }} disabled={days.length < 2}>{playing ? <><Pause size={16} /> Pausar</> : <><Play size={16} /> Reproduzir</>}</button>
      </div>
    </div>

    <section className="v18-highlights">
      <div className="v18-hl lead"><span className="ic"><Trophy size={18} /></span><div><em>Na frente agora</em><b>{leader?.label || "—"}</b><small>{leader ? `${pct(leader.last)} de ${metricInfo.label.toLowerCase()}` : "sem dados"}</small></div></div>
      <div className="v18-hl up"><span className="ic"><ArrowUpRight size={18} /></span><div><em>Quem mais subiu</em><b>{up && (up.delta ?? 0) > 0 ? up.label : "—"}</b><small>{up && (up.delta ?? 0) > 0 ? `${signed(up.delta)} pontos no período` : "ninguém subiu no período"}</small></div></div>
      <div className="v18-hl down"><span className="ic"><ArrowDownRight size={18} /></span><div><em>Quem mais caiu</em><b>{down && (down.delta ?? 0) < 0 ? down.label : "—"}</b><small>{down && (down.delta ?? 0) < 0 ? `${signed(down.delta)} pontos no período` : "ninguém caiu no período"}</small></div></div>
      <div className="v18-hl days"><span className="ic"><LineChart size={18} /></span><div><em>Histórico</em><b>{realDays} dia{realDays === 1 ? "" : "s"} real{realDays === 1 ? "" : "is"}</b><small>{estUntil ? `antes de ${fmtDay(estUntil)}: estimado (tracejado)` : "uma foto nova por dia, automática"}</small></div></div>
    </section>

    <div className="v18-toolbar">
      <div className="v17-seg" role="group" aria-label="Ver por"><span>Ver por</span>{VIEWS.map(v => <button key={v.key} type="button" className={by === v.key ? "on" : ""} aria-pressed={by === v.key} onClick={() => setBy(v.key)}>{v.label}</button>)}</div>
      <div className="v17-seg" role="group" aria-label="Métrica"><span>Métrica</span>{METRICS.filter(m => !(m.key === "participacao" && by === "cliente")).map(m => <button key={m.key} type="button" title={m.hint} className={metric === m.key ? "on" : ""} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}</div>
      <div className="v17-seg" role="group" aria-label="Período">{PERIODS.map(p => <button key={p.d} type="button" className={period === p.d ? "on" : ""} aria-pressed={period === p.d} onClick={() => { setPeriod(p.d); setUpTo(null); setPlaying(false); }}>{p.label}</button>)}</div>
    </div>

    <section className="v17-panel v18-chart-panel">
      <header>
        <h2><Sparkles size={17} /> {metricInfo.label} {by === "fase" ? "por fase" : by === "consultor" ? "por dono da fase" : by === "cliente" ? "por cliente" : "por onda"}</h2>
        <small>{metricInfo.hint}</small>
      </header>
      <div ref={wrap} className="v18-chart">
        {error ? <div className="v7-empty"><LineChart /> {error}</div> : !payload ? <div className="v16-skel"><div className="v16-sk" style={{ height: 380 }} /></div> : !series.length ? <div className="v7-empty"><LineChart /> Ainda não há projetos para desenhar</div> :
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico de ${metricInfo.label}: ${visible.map(s => `${s.label} ${pct(s.last)}`).join(", ")}`}>
          <defs>
            <clipPath id="v18-round" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5" /></clipPath>
            {visible.map(s => <linearGradient key={s.key} id={`v18g-${s.key.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity=".22" /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient>)}
          </defs>
          {ticks.map(t => <g key={t}><line x1={ML} x2={ML + iw} y1={Y(t)} y2={Y(t)} className="v18-grid" /><text x={ML - 8} y={Y(t) + 4} className="v18-ytick">{t}%</text></g>)}
          {estUntil && days.indexOf(estUntil) > 0 && <g><rect x={ML} y={MT} width={X(days.indexOf(estUntil)) - ML} height={ih} className="v18-est-zone" /><text x={ML + 8} y={MT + 14} className="v18-est-label">estimado</text></g>}
          {days.map((d, i) => (i % xEvery === 0 && (days.length - 1 - i >= xEvery * .7 || i === days.length - 1)) || i === days.length - 1 ? <text key={d} x={X(i)} y={H - 10} className="v18-xtick" textAnchor={i === 0 && days.length > 1 ? "start" : i === days.length - 1 && days.length > 1 ? "end" : "middle"}>{fmtDay(d)}</text> : null)}
          {lines.map(({ s, estPath, realPath, pts, end }) => {
            const dim = focus && focus !== s.key;
            const area = focus === s.key && pts.length > 1 ? `${smooth(pts.map(p => ({ x: X(p.i), y: Y(p.v) })))} L${X(pts[pts.length - 1].i)},${MT + ih} L${X(pts[0].i)},${MT + ih} Z` : "";
            return <g key={`${s.key}-${by}-${metric}-${period}`} className={`v18-line ${dim ? "dim" : ""} ${focus === s.key ? "focus" : ""}`} onMouseEnter={() => setFocus(s.key)} onMouseLeave={() => setFocus(null)}>
              {area && <path d={area} fill={`url(#v18g-${s.key.replace(/[^a-z0-9]/gi, "")})`} />}
              {estPath && <path d={estPath} fill="none" stroke={s.color} strokeWidth="2.4" strokeDasharray="5 6" strokeLinecap="round" opacity=".7" />}
              {realPath && <path d={realPath} fill="none" stroke={s.color} strokeWidth={focus === s.key ? 4 : 3} strokeLinecap="round" strokeLinejoin="round" pathLength={upTo === null ? 1 : undefined} className={upTo === null ? "v18-draw" : ""} />}
              {days.length <= 45 && pts.filter(p => !(faces && faceDays.has(p.i))).map(p => <circle key={p.i} cx={X(p.i)} cy={Y(p.v)} r={2.6} fill="#fff" stroke={s.color} strokeWidth="2" />)}
              {end && !faces && <><circle cx={X(end.i)} cy={Y(end.v)} r="9" fill={s.color} opacity=".18" className="v18-pulse" /><circle cx={X(end.i)} cy={Y(end.v)} r="5" fill={s.color} stroke="#fff" strokeWidth="2" /></>}
            </g>;
          })}
          {labels.map(({ key, y, l }) => {
            const s = l.s, dim = focus && focus !== key, x = ML + iw + 14 + (faces ? R + 8 : 0);
            return <g key={key} className={`v18-endlabel ${dim ? "dim" : ""}`} onMouseEnter={() => setFocus(key)} onMouseLeave={() => setFocus(null)}>
              {!faces && <line x1={X(l.end!.i) + 6} y1={Y(l.end!.v)} x2={x - 4} y2={y} stroke={s.color} strokeWidth="1" opacity=".5" />}
              <text x={x} y={y + 4} className="v18-lab"><tspan fill={s.color} className="v18-lab-v">{pct(l.end!.v)}</tspan><tspan dx="6" className="v18-lab-n">{s.label.length > (W < 640 ? 9 : 18) ? `${s.label.slice(0, W < 640 ? 8 : 17)}…` : s.label}</tspan></text>
            </g>;
          })}
          {faces && faceLayers.map(layer => <g key={layer.i} className="v18-faces">
            {layer.items.map(it => !it.face ? <circle key={it.s.key} cx={it.x} cy={it.y} r="4" fill="#fff" stroke={it.s.color} strokeWidth="2.4" className={`v18-endlabel ${focus && focus !== it.s.key ? "dim" : ""}`} /> : <g key={it.s.key} className={`v18-endlabel ${focus && focus !== it.s.key ? "dim" : ""}`} onMouseEnter={() => setFocus(it.s.key)} onMouseLeave={() => setFocus(null)}>
              {Math.abs(it.ay - it.y) > 2 && <><line x1={it.x} y1={it.y} x2={it.x} y2={it.ay} stroke={it.s.color} strokeWidth="1.5" strokeDasharray="2 3" /><circle cx={it.x} cy={it.y} r="3" fill={it.s.color} /></>}
              {layer.last && <circle cx={it.x} cy={it.ay} r={R + 8} fill={it.s.color} opacity=".16" className="v18-pulse" />}
              <Face x={it.x} y={it.ay} r={layer.last ? R : R - 3} s={it.s} ring={layer.last ? 3 : 2} />
            </g>)}
          </g>)}
          {hi !== null && <g className="v18-cross"><line x1={X(hi)} x2={X(hi)} y1={MT} y2={MT + ih} />{!faces && tip.map(t => <circle key={t.s.key} cx={X(hi)} cy={Y(t.p.v as number)} r="5.5" fill={t.s.color} stroke="#fff" strokeWidth="2.5" />)}</g>}
          <rect x={ML} y={MT} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>}
        {hi !== null && tip.length > 0 && <div className="v18-tip" style={{ left: Math.min(Math.max(X(hi) + 14, 8), W - 250), top: 18 }}>
          <b>{fmtLong(days[hi])}{tip[0].p.est ? " · estimado" : ""}</b>
          {tip.slice(0, 10).map((t, i) => { const d = t.prev?.v !== undefined && t.prev?.v !== null ? Math.round(((t.p.v as number) - (t.prev.v as number)) * 10) / 10 : null;
            return <div key={t.s.key} className="row"><span className="pos">{i + 1}</span>{faces && avatarUrl(t.s.label) ? <img className="v18-tip-face" src={avatarUrl(t.s.label)!} alt="" style={{ borderColor: t.s.color }} /> : <i style={{ background: t.s.color }} />}<span className="nm">{t.s.label}</span><span className="v">{pct(t.p.v)}</span><span className={`d ${d === null || d === 0 ? "eq" : d > 0 ? "up" : "dn"}`}>{d === null || d === 0 ? "=" : signed(d)}</span></div>; })}
          {tip.length > 10 && <small>+{tip.length - 10}</small>}
        </div>}
        {upTo !== null && days[cut] && <div className="v18-replay-day">{fmtLong(days[cut])}</div>}
      </div>

      <div className="v18-legend">
        {(by === "cliente" || by === "consultor") && <label className="v18-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={by === "cliente" ? "Buscar cliente" : "Buscar consultor"} aria-label="Buscar na legenda" /></label>}
        {listForChips.map(s => { const on = (defaultVisible.has(s.key) || pinned.has(s.key)) && !hidden.has(s.key);
          return <button key={s.key} type="button" className={`v18-chip ${on ? "on" : ""}`} onClick={() => toggle(s.key)} onMouseEnter={() => on && setFocus(s.key)} onMouseLeave={() => setFocus(null)} aria-pressed={on}>
            {faces && avatarUrl(s.label) ? <img className="v18-chip-face" src={avatarUrl(s.label)!} alt="" style={{ borderColor: s.color, opacity: on ? 1 : .45 }} /> : <i style={{ background: on ? s.color : "transparent", borderColor: s.color }} />}{s.label}{on ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>; })}
        {(by === "cliente" || by === "consultor") && series.length > 8 && <button type="button" className="v18-chip all" onClick={() => { setShowAll(v => !v); setHidden(new Set()); }}>{showAll ? "Mostrar só os 8 que mais mexeram" : `Mostrar todos (${series.length})`}</button>}
      </div>
    </section>

    <section className="v17-panel v18-board">
      <header><h2><Trophy size={17} /> Placar do período</h2><small>{days.length ? `${fmtDay(days[0])} a ${fmtDay(days[days.length - 1])}` : ""} · clique para destacar no gráfico</small></header>
      <div className="v18-table" role="table">
        <div className="v18-tr head" role="row"><span>#</span><span>{by === "fase" ? "Fase" : by === "consultor" ? "Consultor" : by === "cliente" ? "Cliente" : "Onda"}</span><span>Início</span><span>Agora</span><span>Variação</span><span>Pico</span><span>Tendência</span></div>
        {[...series].sort((a, b) => (b.last ?? -1) - (a.last ?? -1)).slice(0, allRows ? undefined : 12).map((s, i) => <button key={s.key} type="button" role="row" className={`v18-tr ${focus === s.key ? "on" : ""}`} onClick={() => { if (!visible.some(v => v.key === s.key)) toggle(s.key); setFocus(focus === s.key ? null : s.key); }}>
          <span className="pos">{i + 1}</span>
          <span className="nm">{faces && avatarUrl(s.label) ? <img className="v18-row-face" src={avatarUrl(s.label)!} alt="" style={{ borderColor: s.color }} /> : <i style={{ background: s.color }} />}{s.label}{by !== "cliente" && <small>{s.n} proj.</small>}</span>
          <span>{pct(s.first)}</span>
          <span className="now">{pct(s.last)}</span>
          <span className={`var ${s.delta === null || s.delta === 0 ? "eq" : s.delta > 0 ? "up" : "dn"}`}>{s.delta === null || s.delta === 0 ? <Minus size={13} /> : s.delta > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{signed(s.delta)}</span>
          <span>{pct(s.peak)}</span>
          <span><Spark s={s} /></span>
        </button>)}
      </div>
      {series.length > 12 && <button type="button" className="v17-link" onClick={() => setAllRows(v => !v)}>{allRows ? "Mostrar só os 12 primeiros" : `Ver o placar completo (${series.length})`}</button>}
      <p className="v17-foot">Avanço: Kickoff 0% · Dev 12% · Homologação 45% · Implantação 62% · Go-live 85% · Encerrado 100%, mais a parte da fase já concluída pelas atividades. <button type="button" className="v17-link" onClick={() => onNavigate("/gargalos")}>Ver o que está travando</button></p>
    </section>
  </div>;
}
