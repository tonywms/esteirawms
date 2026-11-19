"use client";
// V17 · Bloco compacto no Painel executivo: as células mais quentes do Mapa de gargalos.
import { useMemo } from "react";
import { ArrowRight, Flame, Gauge } from "lucide-react";
import type { State } from "@/lib/types";
import { gargalosSummary } from "@/lib/gargalos";

export default function GargalosStrip({ data, onNavigate }: { data: State; onNavigate: (path: string) => void }) {
  const s = useMemo(() => gargalosSummary(data), [data]);
  if (!s.active) return null;
  return <section className="v17-strip" aria-label="Onde a esteira está travando">
    <div className="head"><span className="ic"><Flame size={18} /></span><div><b>Onde a esteira está travando</b><small>{s.pctInGoal === null ? "" : <><Gauge size={12} /> {s.pctInGoal}% dos projetos dentro da meta da fase · </>}{s.idleOutPct}% do tempo parado com cliente/ERP</small></div></div>
    <div className="hot">{s.hot.length ? s.hot.map((h, i) => <span key={i} className={`l${h.level}`}><b>{h.row}</b> · {h.dim} <em>{h.text}</em></span>) : <span className="l1"><b>Nenhuma célula crítica</b> · esteira fluindo</span>}</div>
    <button type="button" className="go" onClick={() => onNavigate("/gargalos")}>Ver mapa completo <ArrowRight size={15} /></button>
  </section>;
}
