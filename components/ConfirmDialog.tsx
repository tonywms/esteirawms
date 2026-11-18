"use client";
import { friendly } from "@/lib/friendly";
// V7.5 · Modal de confirmação no padrão visual da Esteira (substitui o window.confirm do navegador).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarX2, Info, RefreshCw, Trash2, X } from "lucide-react";

export type ConfirmBox = {
  title: string;
  message: string;
  details?: { label: string; value: string }[];
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: "calendar" | "trash";
  onConfirm: () => Promise<void> | void;
};

export default function ConfirmDialog({ box, onClose }: { box: ConfirmBox; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [mounted, setMounted] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => cancelRef.current?.focus(), 30);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [busy, onClose]);
  async function confirm() {
    if (busy) return; setBusy(true); setError("");
    try { await box.onConfirm(); onClose(); }
    catch (e) { setError(friendly(e instanceof Error ? e.message : "Não foi possível excluir.")); setBusy(false); }
  }
  if (!mounted) return null;
  const Icon = box.icon === "calendar" ? CalendarX2 : Trash2;
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="p6-confirm" role="alertdialog" aria-modal="true" aria-labelledby="p6-confirm-title" aria-describedby="p6-confirm-msg">
        <button className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button>
        <div className="p6-confirm-icon" aria-hidden="true"><span><Icon size={30} strokeWidth={1.9} /></span></div>
        <h2 id="p6-confirm-title">{box.title}</h2>
        <p id="p6-confirm-msg">{box.message}</p>
        {!!box.details?.length && <dl className="p6-confirm-details">{box.details.map(d => <div key={d.label}><dt>{d.label}</dt><dd>{d.value || "—"}</dd></div>)}</dl>}
        {box.note && <div className="p6-confirm-note"><Info size={15} /><span>{box.note}</span></div>}
        <div className="p6-confirm-warn"><AlertTriangle size={15} /><span>Esta ação não pode ser desfeita.</span></div>
        {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        <div className="p6-confirm-actions">
          <button ref={cancelRef} className="p6-confirm-cancel" onClick={onClose} disabled={busy}>{box.cancelLabel || "Cancelar"}</button>
          <button className="p6-confirm-ok" onClick={() => void confirm()} disabled={busy}>{busy ? <RefreshCw className="spin" size={16} /> : <Trash2 size={16} />}{busy ? "Excluindo..." : box.confirmLabel || "Sim, excluir"}</button>
        </div>
      </div>
    </div>, document.body);
}
