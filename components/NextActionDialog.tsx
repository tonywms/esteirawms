"use client";
// V24 · Ao mudar de fase, o card já sai com a próxima ação: o quê, quem e até quando.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, RefreshCw, Target, X } from "lucide-react";
import Select from "./Select";
import DateField from "./DateField";
import { todayISO } from "@/lib/metrics";

export type NextAction = { nextAction: string; nextActionOwner: string; nextActionDue: string | null };

/** hoje + n dias úteis (seg–sex). */
export function plusBusinessDays(n: number, from = todayISO()) {
  const d = new Date(from + "T12:00:00");
  for (let i = 0; i < n;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) i++; }
  return d.toISOString().slice(0, 10);
}

const SUGGEST: Record<string, string[]> = {
  kickoff: ["Agendar o kickoff com o cliente", "Enviar o documento de endereçamento"],
  dev: ["Receber o retorno da API do ERP", "Validar a integração de pedidos", "Liberar a base de testes"],
  homolog: ["Agendar a homologação com o cliente", "Enviar o roteiro de testes"],
  campo: ["Agendar a ida a campo", "Treinar os operadores"],
  golive: ["Confirmar a data do go-live", "Acompanhar a primeira operação"],
};

export default function NextActionDialog({ client, from, to, toKey, owners, defaultOwner, current, onClose, onConfirm, confirmLabel }: {
  client: string; from: string; to: string; toKey: string; owners: string[]; defaultOwner: string; current?: Partial<NextAction>;
  onClose: () => void; onConfirm: (n: NextAction) => void | Promise<void>; confirmLabel?: string;
}) {
  const [text, setText] = useState(""), [owner, setOwner] = useState(defaultOwner), [due, setDue] = useState(plusBusinessDays(3));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => ref.current?.focus(), 40);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [busy, onClose]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (text.trim().length < 4) return setError("Descreva a próxima ação: o que precisa acontecer para o projeto andar na nova fase.");
    if (!owner.trim()) return setError("Escolha quem é o responsável.");
    if (!due) return setError("Informe até quando.");
    setBusy(true); setError("");
    try { await onConfirm({ nextAction: text.trim(), nextActionOwner: owner, nextActionDue: due }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar."); setBusy(false); }
  }
  if (!mounted) return null;
  const list = [...new Set([defaultOwner, ...owners].filter(Boolean))];
  return createPortal(
    <div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="p6-confirm v17-info v24-next" role="dialog" aria-modal="true" aria-labelledby="v24-next-title" onSubmit={e => void submit(e)}>
        <button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button>
        <div className="p6-confirm-icon" aria-hidden="true"><span><Target size={30} strokeWidth={1.9} /></span></div>
        <h2 id="v24-next-title">Próxima ação da nova fase</h2>
        <p><b>{client}</b>: {from} <ArrowRight size={13} style={{ verticalAlign: "-2px" }} /> <b>{to}</b>. Todo card muda de fase já com o próximo passo, um responsável e um prazo — é isso que a rotina das 7h cobra.</p>
        {current?.nextAction && <div className="v24-prev">Próxima ação anterior: “{current.nextAction}”</div>}
        <div className="v9-master-fields">
          <label><span>O que precisa acontecer?</span><textarea ref={ref} rows={2} value={text} onChange={e => setText(e.target.value)} disabled={busy} placeholder="Ex.: agendar a homologação com o cliente" /></label>
          {(SUGGEST[toKey] || []).length > 0 && <div className="v24-chips">{SUGGEST[toKey].map(s => <button key={s} type="button" onClick={() => setText(s)} disabled={busy}>{s}</button>)}</div>}
          <div className="v7-grid2">
            <label><span>Responsável</span><Select value={owner} onChange={e => setOwner(e.target.value)} disabled={busy}>{list.map(o => <option key={o}>{o}</option>)}</Select></label>
            <label><span>Até quando</span><DateField value={due} onChange={v => setDue(v)} aria-label="Até quando" /></label>
          </div>
        </div>
        {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        <div className="p6-confirm-actions">
          <button type="button" className="p6-confirm-cancel" onClick={onClose} disabled={busy}>Voltar</button>
          <button type="submit" className="p6-confirm-ok" disabled={busy}>{busy ? <RefreshCw className="spin" size={16} /> : <ArrowRight size={16} />}{busy ? "Salvando..." : confirmLabel || `Mover para ${to}`}</button>
        </div>
      </form>
    </div>, document.body);
}
