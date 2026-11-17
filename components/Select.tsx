"use client";
// V7.9 · Lista de seleção no padrão visual da Esteira.
// Substitui o <select> nativo (cuja lista aberta o navegador desenha e o CSS não alcança).
// API igual à do <select>: value, onChange(e => e.target.value), disabled e filhos <option>.
import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

type Opt = { value: string; label: string };
type Props = {
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
  id?: string;
  name?: string;
};

const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : "";
function collect(children: ReactNode, out: Opt[] = []) {
  Children.forEach(children, ch => {
    if (!isValidElement(ch)) return;
    const p = ch.props as { value?: string | number; children?: ReactNode };
    if (ch.type === "option") { const label = textOf(p.children); out.push({ value: p.value !== undefined ? String(p.value) : label, label }); }
    else if (p.children) collect(p.children, out);
  });
  return out;
}
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Select({ value, onChange, disabled, children, className, id, name, ...rest }: Props) {
  const options = useMemo(() => collect(children), [children]);
  const current = String(value ?? "");
  const selected = options.find(o => o.value === current) || options[0];
  const isPlaceholder = !selected || (selected.value === "" && current === "");
  const [open, setOpen] = useState(false), [q, setQ] = useState(""), [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean }>({ left: 0, top: 0, width: 0, maxH: 320, up: false });
  const btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchable = options.length > 8;
  const shown = useMemo(() => (q ? options.filter(o => norm(o.label).includes(norm(q))) : options), [options, q]);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 240 && above > below;
    const maxH = Math.max(160, Math.min(340, up ? above : below));
    const width = Math.max(r.width, 230);
    const left = Math.min(r.left, window.innerWidth - width - 10);
    setPos({ left: Math.max(10, left), top: up ? r.top - 6 : r.bottom + 6, width, maxH, up });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !list.current?.contains(t)) setOpen(false); };
    const re = () => place();
    document.addEventListener("mousedown", close); window.addEventListener("resize", re); window.addEventListener("scroll", re, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("resize", re); window.removeEventListener("scroll", re, true); };
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    setQ(""); setActive(Math.max(0, options.findIndex(o => o.value === current)));
    const t = window.setTimeout(() => (searchable ? search.current?.focus() : list.current?.focus()), 10);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const pick = (o: Opt) => {
    setOpen(false); btn.current?.focus();
    if (o.value !== current) onChange?.({ target: { value: o.value, name }, currentTarget: { value: o.value, name } } as unknown as ChangeEvent<HTMLSelectElement>);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") { setOpen(false); if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); btn.current?.focus(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (!searchable && e.key.length === 1) { const i = shown.findIndex(o => norm(o.label).startsWith(norm(e.key))); if (i >= 0) setActive(i); }
  };

  return <>
    <button ref={btn} type="button" id={id} className={`p6-select-trigger${open ? " open" : ""}${isPlaceholder ? " placeholder" : ""}${className ? " " + className : ""}`}
      disabled={disabled} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={rest["aria-label"]}
      onClick={() => setOpen(o => !o)} onKeyDown={keys}>
      <span className="p6-select-value">{selected?.label ?? ""}</span>
      <ChevronDown className="p6-select-chevron" size={16} strokeWidth={2.4} aria-hidden="true" />
    </button>
    {name && <input type="hidden" name={name} value={current} />}
    {open && typeof document !== "undefined" && createPortal(
      <div ref={list} id={listId} className={`p6-select-pop${pos.up ? " up" : ""}`} role="listbox" tabIndex={-1} onKeyDown={keys}
        style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
        {searchable && <label className="p6-select-search"><Search size={14} /><input ref={search} value={q} placeholder="Buscar..." onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={keys} /></label>}
        <div className="p6-select-list" style={{ maxHeight: pos.maxH - (searchable ? 52 : 0) }}>
          {shown.map((o, i) => {
            const sel = o.value === current;
            return <div key={o.value + "|" + i} data-i={i} role="option" aria-selected={sel} className={`p6-select-opt${sel ? " is-sel" : ""}${i === active ? " is-act" : ""}${o.value === "" ? " is-blank" : ""}`}
              onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}>
              <span>{o.label}</span>{sel && <Check size={15} strokeWidth={2.6} />}
            </div>;
          })}
          {!shown.length && <div className="p6-select-none">Nada encontrado</div>}
        </div>
      </div>, document.body)}
  </>;
}
