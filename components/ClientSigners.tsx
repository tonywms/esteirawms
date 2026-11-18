"use client";
// V13 · Contatos para assinatura do cliente (ZapSign): vários contatos, um marcado como recomendado.
// O recomendado já vem selecionado quando alguém envia um PDF para assinatura.
import { PenLine, Plus, Star, Trash2 } from "lucide-react";
import type { ClientSigner } from "@/lib/types";

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export default function ClientSigners({ value, onChange }: { value: ClientSigner[]; onChange: (v: ClientSigner[]) => void }) {
  const list = value || [];
  const set = (i: number, patch: Partial<ClientSigner>) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const primary = (i: number) => onChange(list.map((s, j) => ({ ...s, primary: j === i })));
  const add = () => onChange([...list, { id: newId(), name: "", email: "", phone: "", role: "", primary: list.length === 0 }]);
  const remove = (i: number) => { const next = list.filter((_, j) => j !== i); if (next.length && !next.some(s => s.primary)) next[0] = { ...next[0], primary: true }; onChange(next); };
  return <div className="v13-signers span2">
    <div className="v13-signers-head"><PenLine size={14} /> Contatos para assinatura (ZapSign) <em>{list.length}</em>
      <small>Quem assina os documentos pelo cliente. O contato com estrela é o recomendado e já vem marcado no envio.</small></div>
    {list.map((s, i) => <div key={s.id} className={`v13-signer ${s.primary ? "primary" : ""}`}>
      <button type="button" className="v13-star" onClick={() => primary(i)} title={s.primary ? "Contato recomendado" : "Marcar como recomendado"} aria-label="Marcar como recomendado"><Star size={16} fill={s.primary ? "currentColor" : "none"} /></button>
      <input value={s.name} onChange={e => set(i, { name: e.target.value })} placeholder="Nome completo" aria-label="Nome" />
      <input value={s.email} onChange={e => set(i, { email: e.target.value.trim() })} placeholder="e-mail" type="email" aria-label="E-mail" />
      <input value={s.phone || ""} onChange={e => set(i, { phone: e.target.value })} placeholder="Celular (DDD)" aria-label="Celular" />
      <input value={s.role || ""} onChange={e => set(i, { role: e.target.value })} placeholder="Cargo (opcional)" aria-label="Cargo" />
      <button type="button" className="v13-del" onClick={() => remove(i)} title="Remover contato" aria-label="Remover contato"><Trash2 size={15} /></button>
    </div>)}
    <button type="button" className="v13-add" onClick={add}><Plus size={15} /> Adicionar contato</button>
  </div>;
}
