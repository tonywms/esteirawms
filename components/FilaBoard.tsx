"use client";
// V40 · Calendário de idas a campo: uma linha por consultor, uma coluna por dia útil.
// Barras: Homologação (azul) e Go-live (roxo); agenda comum do consultor aparece clarinha por baixo.
// No sistema dá para arrastar a barra para outro dia/consultor; na TV é só leitura.
import { useState } from "react";
import { Building2, CalendarDays, GripVertical } from "lucide-react";
import type { Slot } from "@/lib/fila";
import { STATUS_TXT, type AgendaBar } from "@/lib/fila";
import { ClientLogo } from "./ClientLogo";
import { PersonPhoto } from "./PersonPhoto";
import { avatarUrl } from "@/lib/avatars";

/** V41: foto do consultor; sem foto, as iniciais num círculo colorido (o nome fica no "title"). */
const HUES = [199, 262, 24, 168, 330, 45, 140, 215];
function Face({ name, size }: { name: string; size: number }) {
  if (avatarUrl(name)) return <PersonPhoto name={name} size={size} />;
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const h = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return <span className="v41-ini" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${h} 70% 42%), hsl(${h} 75% 58%))` }}>{ini}</span>;
}

const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TONE_TXT: Record<AgendaBar["tone"], string> = { golive: "GO-LIVE", homolog: "HOMOLOG.", campo: "IMPLANT.", treino: "TREINO", dev: "INTEGR.", office: "ESCRIT.", outro: "AGENDA" };
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
type Props = {
  days: string[]; people: string[]; slots: Slot[]; agenda: AgendaBar[]; today: string; tv?: boolean; compact?: boolean;
  onDropSlot?: (slotId: string, person: string, day: string) => void; onDropQueue?: (slotId: string, person: string, day: string) => void;
  onSlot?: (s: Slot) => void; hidden?: Set<string>;
  onEmpty?: (person: string, day: string) => void; // V41: clicar num espaço vazio = alocar rápido
};

export function FilaCalendar({ days, people, slots, agenda, today, tv = false, compact = false, onDropSlot, onDropQueue, onSlot, hidden, onEmpty }: Props) {
  const n = days.length, [over, setOver] = useState<string | null>(null);
  const span = (a: string, b: string) => { const s = Math.max(0, days.findIndex(d => d >= a)), eIdx = days.reduce((acc, d, i) => (d <= b ? i : acc), -1); return eIdx < s ? null : { col: s + 1, len: eIdx - s + 1 }; };
  const dayAt = (e: React.MouseEvent, el: HTMLElement) => { const r = el.getBoundingClientRect(); return days[Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)))]; };
  const drag = !!(onDropSlot || onDropQueue);
  return <div className={`v40-cal ${tv ? "tv" : ""} ${compact ? "compact" : ""}`} style={{ ["--n" as string]: n }}>
    <div className="v40-head">
      <span className="corner"><CalendarDays size={tv ? 22 : 16} /></span>
      <div className="days">{days.map((d, i) => <span key={d} className={`${d === today ? "today" : ""} ${i > 0 && i % 5 === 0 ? "wk" : ""}`}><b>{WD[new Date(d + "T12:00:00").getDay()]}</b><small>{dm(d)}</small></span>)}</div>
    </div>
    {people.map((person, pi) => {
      const mine = slots.filter(s => s.consultant === person && s.end >= days[0] && s.start <= days[n - 1]);
      const ag = agenda.filter(a => a.person === person);
      // mesma pessoa em dois lugares ao mesmo tempo
      const clash = new Set(mine.filter(x => mine.some(y => y !== x && y.start <= x.end && x.start <= y.end) || ag.some(a => a.clientId !== x.clientId && !a.office && a.start <= x.end && x.start <= a.end)).map(x => x.id));
      const key = person;
      return <div key={person} className={`v40-row ${over === key ? "over" : ""} ${hidden?.has(person) ? "ghost" : ""}`} style={{ animationDelay: `${(pi % 10) * 60}ms` }}>
        <span className="who" title={person}><Face name={person} size={tv ? 56 : compact ? 36 : 42} />{hidden?.has(person) && <em title="Fora do painel, mas tem ida a campo marcada">extra</em>}<b className="sr">{person}</b></span>
        <div className={`lane ${onEmpty ? "pick" : ""}`} title={onEmpty ? `Clique num dia vazio para alocar ${person}` : undefined}
          onClick={onEmpty ? e => { if ((e.target as HTMLElement).closest(".bar,.ag")) return; onEmpty(person, dayAt(e, e.currentTarget)); } : undefined}
          onDragOver={drag ? e => { e.preventDefault(); setOver(key); } : undefined}
          onDragLeave={drag ? () => setOver(o => (o === key ? null : o)) : undefined}
          onDrop={drag ? e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/v40-slot"), q = e.dataTransfer.getData("text/v40-queue"), d = dayAt(e, e.currentTarget); if (id) onDropSlot?.(id, person, d); else if (q) onDropQueue?.(q, person, d); } : undefined}>
          <div className="grid">{days.map((d, i) => <i key={d} className={`${d === today ? "today" : ""} ${i > 0 && i % 5 === 0 ? "wk" : ""}`} />)}</div>
          <div className="bars">
            {ag.map(a => { const sp = span(a.start, a.end); if (!sp) return null; return <span key={a.id} className={`ag t-${a.tone}`} style={{ gridColumn: `${sp.col} / span ${sp.len}` }} title={`Agenda: ${a.office ? "Escritório WMS Expert" : a.client} · ${a.title} · ${dm(a.start)}${a.end !== a.start ? ` a ${dm(a.end)}` : ""}`}>
              {!compact && <em>{TONE_TXT[a.tone]}</em>}{a.office ? <Building2 size={tv ? 18 : 14} /> : !compact && <ClientLogo clientId={a.clientId} size={tv ? 20 : 16} />}<b>{a.office ? "Escritório" : a.client}</b>{!compact && <small>{a.title}</small>}</span>; })}
            {mine.map(s => { const sp = span(s.start, s.end); if (!sp) return null; const ok = !!onDropSlot && s.status !== "realizado";
              return <button type="button" key={s.id} className={`bar ${s.kind} st-${s.status} ${clash.has(s.id) ? "clash" : ""}`} style={{ gridColumn: `${sp.col} / span ${sp.len}` }}
                draggable={ok} onDragStart={ok ? e => { e.dataTransfer.setData("text/v40-slot", s.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                onClick={onSlot ? () => onSlot(s) : undefined} disabled={!onSlot && !tv} title={`${s.client} · ${s.kind === "golive" ? "Go-live" : "Homologação"} · ${STATUS_TXT[s.status]} · ${dm(s.start)} a ${dm(s.end)}${clash.has(s.id) ? " · CONFLITO: a mesma pessoa em outro cliente nesses dias" : ""}`}>
                {ok && !compact && <GripVertical className="grip" size={13} />}{!compact && <em>{s.kind === "golive" ? "GO-LIVE" : "HOMOLOG."}</em>}<b className="v32-nm">{!compact && <ClientLogo clientId={s.clientId} size={tv ? 24 : 18} />}<span>{s.client}</span></b>{!compact && <small>{STATUS_TXT[s.status]}</small>}
              </button>; })}
          </div>
        </div>
      </div>;
    })}
    {!people.length && <div className="v40-empty">Ninguém no painel. Use “Pessoas no painel” para escolher quem aparece.</div>}
  </div>;
}

export function FilaLegend() {
  return <div className="v40-legend"><span className="k homolog">HOMOLOG.</span><span className="k golive">GO-LIVE</span><span className="k campo">IMPLANT.</span><span className="k treino">TREINO</span><span className="k dev">INTEGR.</span><span className="k office">ESCRIT.</span><span className="s st-pre">claro + PRÉ = pré-agendado</span></div>;
}
