"use client";
// V14 · Campo de data no padrão do sistema: sempre dd/mm/aaaa (independe do idioma do navegador),
// calendário em português e atalhos (Hoje, +7 dias, Fim do mês, Limpar). Valor trocado em "AAAA-MM-DD".
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toBR = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "");
const fromBR = (t: string) => { const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) return null; const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getMonth() === +m[2] - 1 ? iso(d) : null; };
const mask = (t: string) => { const d = t.replace(/\D/g, "").slice(0, 8); return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

type Props = { value?: string | null; onChange: (v: string) => void; placeholder?: string; required?: boolean; disabled?: boolean; compact?: boolean; className?: string; "aria-label"?: string; min?: string };

export default function DateField({ value, onChange, placeholder = "dd/mm/aaaa", required, disabled, compact, className, min, ...rest }: Props) {
  const [text, setText] = useState(toBR(value)), [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const v = value && /^\d{4}-\d{2}/.test(value) ? new Date(+value.slice(0, 4), +value.slice(5, 7) - 1, 1) : new Date(); return new Date(v.getFullYear(), v.getMonth(), 1); });
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const box = useRef<HTMLDivElement>(null), pop = useRef<HTMLDivElement>(null), id = useId();
  useEffect(() => { setText(toBR(value)); }, [value]);
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = box.current?.getBoundingClientRect(); if (!r) return; const h = 352, up = r.bottom + h > window.innerHeight - 8 && r.top > h; setPos({ top: up ? r.top - h - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), up }); };
    place();
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true); document.addEventListener("mousedown", out); document.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const pick = (v: string) => { onChange(v); setText(toBR(v)); setOpen(false); };
  const today = new Date(), tIso = iso(today);
  const first = new Date(view.getFullYear(), view.getMonth(), 1), start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const add = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const endMonth = () => iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  return <div ref={box} className={`v14-date ${compact ? "compact" : ""} ${open ? "open" : ""} ${disabled ? "disabled" : ""} ${className || ""}`}>
    <input value={text} disabled={disabled} required={required} placeholder={placeholder} inputMode="numeric" aria-label={rest["aria-label"]} aria-haspopup="dialog" aria-controls={id}
      onChange={e => { const t = mask(e.target.value); setText(t); if (!t) onChange(""); else { const v = fromBR(t); if (v) { onChange(v); setView(new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, 1)); } } }}
      onBlur={() => { if (text && !fromBR(text)) setText(toBR(value)); }} onFocus={() => !disabled && setOpen(true)} />
    {value && !disabled && !required && <button type="button" className="v14-date-clear" onClick={() => pick("")} aria-label="Limpar data"><X size={13} /></button>}
    <button type="button" className="v14-date-btn" onClick={() => !disabled && setOpen(o => !o)} aria-label="Abrir calendário" disabled={disabled}><CalendarDays size={15} /></button>
    {open && typeof document !== "undefined" && createPortal(<div ref={pop} id={id} role="dialog" aria-label="Calendário" className={`v14-cal ${pos.up ? "up" : ""}`} style={{ top: pos.top, left: pos.left }}>
      <div className="v14-cal-head">
        <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
        <strong>{MESES[view.getMonth()]} <span>{view.getFullYear()}</span></strong>
        <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button>
      </div>
      <div className="v14-cal-grid">{DIAS.map((d, i) => <span key={i} className="dow">{d}</span>)}
        {cells.map(d => { const v = iso(d), off = d.getMonth() !== view.getMonth(), blocked = !!min && v < min;
          return <button type="button" key={v} disabled={blocked} className={`${off ? "off" : ""} ${v === tIso ? "today" : ""} ${v === value ? "sel" : ""} ${d.getDay() === 0 || d.getDay() === 6 ? "we" : ""}`} onClick={() => pick(v)}>{d.getDate()}</button>; })}
      </div>
      <div className="v14-cal-quick">
        <button type="button" onClick={() => pick(tIso)}>Hoje</button>
        <button type="button" onClick={() => pick(add(7))}>+7 dias</button>
        <button type="button" onClick={() => pick(endMonth())}>Fim do mês</button>
        {!required && <button type="button" className="clear" onClick={() => pick("")}>Limpar</button>}
      </div>
    </div>, document.body)}
  </div>;
}
