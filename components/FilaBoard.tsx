"use client";
// V39 · Quadro de próximas implantações: consultor × semana, com Homologação (H) e Go-live (G).
import type { Slot } from "@/lib/fila";
import { STATUS_TXT, TBD, addDaysISO } from "@/lib/fila";
import { ClientLogo } from "./ClientLogo";
import { PersonPhoto } from "./PersonPhoto";

const brS = (d: string) => d.slice(5).split("-").reverse().join("/");
export function FilaBoard({ weeks, consultants, slots, today, tv = false, maxPerCell = 4, onSlot }: { weeks: string[]; consultants: string[]; slots: Slot[]; today: string; tv?: boolean; maxPerCell?: number; onSlot?: (s: Slot) => void }) {
  const cur = weeks.find(w => w <= today && addDaysISO(w, 6) >= today);
  return <div className={`v39-board ${tv ? "tv" : ""}`} style={{ gridTemplateColumns: `${tv ? "minmax(150px, 13vw)" : "190px"} repeat(${weeks.length}, minmax(${tv ? 0 : 150}px, 1fr))` }}>
    <span className="hd who" />
    {weeks.map(w => <span key={w} className={`hd ${w === cur ? "now" : ""}`}><b>{w === cur ? "Esta semana" : `Semana ${brS(w)}`}</b><small>{brS(w)} – {brS(addDaysISO(w, 4))}</small></span>)}
    {consultants.map(c => <div key={c} className="ln" style={{ display: "contents" }}>
      <span className={`who ${c === TBD ? "tbd" : ""}`}>{c === TBD ? <i>?</i> : <PersonPhoto name={c} size={tv ? 38 : 30} />}<b>{c}</b></span>
      {weeks.map(w => {
        const we = addDaysISO(w, 6), here = slots.filter(s => s.consultant === c && s.start <= we && s.end >= w);
        return <div key={w} className={`cell ${w === cur ? "now" : ""}`}>
          {here.slice(0, maxPerCell).map(s => <button type="button" key={s.id} className={`sl ${s.kind} st-${s.status}`} onClick={onSlot ? () => onSlot(s) : undefined} disabled={!onSlot} title={`${s.client} · ${s.kind === "golive" ? "Go-live" : "Homologação"} · ${STATUS_TXT[s.status]} · ${brS(s.start)} a ${brS(s.end)}${s.note ? ` · ${s.note}` : ""}`}>
            <em>{s.kind === "golive" ? "G" : "H"}</em><b className="v32-nm"><ClientLogo clientId={s.clientId} size={tv ? 22 : 18} />{s.client}</b><small>{STATUS_TXT[s.status]}</small>
          </button>)}
          {here.length > maxPerCell && <span className="more">+{here.length - maxPerCell}</span>}
        </div>;
      })}
    </div>)}
  </div>;
}

export function FilaLegend() {
  return <div className="v39-legend">
    <span className="sl golive st-agendado"><em>G</em>Go-live</span><span className="sl homolog st-agendado"><em>H</em>Homologação</span>
    <span className="dot st-agendado" />Agendado <span className="dot st-pre" />Pré-agendado <span className="dot st-prometido" />Data prometida <span className="dot st-andamento" />Em andamento <span className="dot st-sugerido" />Sugestão automática
  </div>;
}
