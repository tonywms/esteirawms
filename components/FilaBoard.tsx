"use client";
// V40 · Calendário de idas a campo: uma linha por consultor, uma coluna por dia útil.
// Barras: Homologação (azul) e Go-live (roxo); agenda comum do consultor aparece clarinha por baixo.
// No sistema dá para arrastar a barra para outro dia/consultor; na TV é só leitura.
import { useState } from "react";
import { Building2, CalendarDays, ClipboardCheck, GraduationCap, GripVertical, HardHat, Plug, Rocket, type LucideIcon } from "lucide-react";
import { logoUrl } from "@/lib/logos";
import type { Slot } from "@/lib/fila";
import { STATUS_TXT, type AgendaBar } from "@/lib/fila";
import { ClientLogo } from "./ClientLogo";
import { PersonPhoto } from "./PersonPhoto";
import { avatarUrl } from "@/lib/avatars";

/** V41: foto do consultor; sem foto, as iniciais num círculo colorido (o nome fica no "title"). */
const HUES = [199, 262, 24, 168, 330, 45, 140, 215];
export function Face({ name, size }: { name: string; size: number }) {
  if (avatarUrl(name)) return <PersonPhoto name={name} size={size} />;
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const h = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return <span className="v41-ini" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${h} 70% 42%), hsl(${h} 75% 58%))` }}>{ini}</span>;
}

const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/* V42 · ícone e nome por tipo de ida a campo (embaixo do nome do cliente) */
const TONE_ICON: Record<AgendaBar["tone"], LucideIcon> = { golive: Rocket, homolog: ClipboardCheck, campo: HardHat, treino: GraduationCap, dev: Plug, office: Building2, outro: CalendarDays };
const TONE_NAME: Record<AgendaBar["tone"], string> = { golive: "Go-live", homolog: "Homologação", campo: "Implantação", treino: "Treinamento", dev: "Integração", office: "Escritório", outro: "Agenda" };
/** Logo do cliente; sem logo, um ícone de prédio (SVG). */
function CliIcon({ clientId, size, office }: { clientId?: string; size: number; office?: boolean }) {
  if (!office && clientId && logoUrl(clientId)) return <ClientLogo clientId={clientId} size={size} className="v42-logo" />;
  return <span className="v42-cli" style={{ width: size, height: size }}><Building2 size={Math.round(size * 0.62)} /></span>;
}
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
              <span className="v42-top"><CliIcon clientId={a.clientId} office={a.office} size={tv ? 26 : compact ? 16 : 20} /><b>{a.office ? "Escritório" : a.client}</b></span>
              <span className="v42-sub">{(() => { const I = TONE_ICON[a.tone]; return <I size={tv ? 17 : 13} />; })()}<span>{TONE_NAME[a.tone]}</span>{!compact && !a.office && a.title && !new RegExp(TONE_NAME[a.tone].slice(0, 5), "i").test(a.title) && <small>· {a.title}</small>}</span></span>; })}
            {mine.map(s => { const sp = span(s.start, s.end); if (!sp) return null; const ok = !!onDropSlot && s.status !== "realizado";
              return <button type="button" key={s.id} className={`bar ${s.kind} st-${s.status} ${clash.has(s.id) ? "clash" : ""}`} style={{ gridColumn: `${sp.col} / span ${sp.len}` }}
                draggable={ok} onDragStart={ok ? e => { e.dataTransfer.setData("text/v40-slot", s.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                onClick={onSlot ? () => onSlot(s) : undefined} disabled={!onSlot && !tv} title={`${s.client} · ${s.kind === "golive" ? "Go-live" : "Homologação"} · ${STATUS_TXT[s.status]} · ${dm(s.start)} a ${dm(s.end)}${clash.has(s.id) ? " · CONFLITO: a mesma pessoa em outro cliente nesses dias" : ""}`}>
                {ok && !compact && <GripVertical className="grip" size={13} />}
                <span className="v42-top"><CliIcon clientId={s.clientId} size={tv ? 26 : compact ? 16 : 20} /><b>{s.client}</b></span>
                <span className="v42-sub">{s.kind === "golive" ? <Rocket size={tv ? 17 : 13} /> : <ClipboardCheck size={tv ? 17 : 13} />}<span>{s.kind === "golive" ? "Go-live" : "Homologação"}</span>{!compact && <small>· {STATUS_TXT[s.status]}</small>}</span>
              </button>; })}
          </div>
        </div>
      </div>;
    })}
    {!people.length && <div className="v40-empty">Ninguém no painel. Use “Pessoas no painel” para escolher quem aparece.</div>}
  </div>;
}

export function FilaLegend() {
  const k = (t: AgendaBar["tone"]) => { const I = TONE_ICON[t]; return <span key={t} className={`k ${t}`}><I size={12} />{TONE_NAME[t]}</span>; };
  return <div className="v40-legend">{(["homolog", "golive", "campo", "treino", "dev", "office"] as const).map(k)}<span className="s st-pre">claro + PRÉ = pré-agendado</span></div>;
}
