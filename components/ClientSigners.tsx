"use client";
// V13 · Contatos para assinatura do cliente (ZapSign): vários contatos, um marcado como recomendado.
// O recomendado já vem selecionado quando alguém envia um PDF para assinatura.
// V21 · Aviso de duplicado (mesmo e-mail/celular em qualquer cliente) e importação da ZapSign.
import { useEffect, useState } from "react";
import { AlertTriangle, Cloud, PenLine, Plus, Star, Trash2 } from "lucide-react";
import type { Client, ClientSigner } from "@/lib/types";
import { dupText, findDup, newSignerId } from "@/lib/contacts";
import ZapsignPeople from "./ZapsignPeople";

export default function ClientSigners({ value, onChange, clientId, clientName }: { value: ClientSigner[]; onChange: (v: ClientSigner[]) => void; clientId?: string; clientName?: string }) {
  const list = value || [];
  const [clients, setClients] = useState<Client[]>([]), [zp, setZp] = useState(false);
  useEffect(() => { fetch("/api/records/clients", { cache: "no-store" }).then(r => (r.ok ? r.json() : [])).then(setClients).catch(() => setClients([])); }, []);
  const set = (i: number, patch: Partial<ClientSigner>) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const primary = (i: number) => onChange(list.map((s, j) => ({ ...s, primary: j === i })));
  const add = () => onChange([...list, { id: newSignerId(), name: "", email: "", phone: "", role: "", primary: list.length === 0 }]);
  const remove = (i: number) => { const next = list.filter((_, j) => j !== i); if (next.length && !next.some(s => s.primary)) next[0] = { ...next[0], primary: true }; onChange(next); };
  // outros clientes (do banco) + os outros contatos desta tela (ainda não salvos)
  const others = clients.filter(c => c.id !== clientId);
  const dupOf = (s: ClientSigner) => findDup([...others, { id: clientId || "_novo", name: clientName || "este cliente", system: "", notes: "", createdAt: "", updatedAt: "", signers: list.filter(x => x.id !== s.id) }], s);
  return <div className="v13-signers span2">
    <div className="v13-signers-head"><PenLine size={14} /> Contatos para assinatura (ZapSign) <em>{list.length}</em>
      <small>Quem assina os documentos pelo cliente. O contato com estrela é o recomendado e já vem marcado no envio.</small></div>
    {list.map((s, i) => { const d = (s.email || s.phone) ? dupOf(s) : null;
      return <div key={s.id} className="v21-signer-wrap">
        <div className={`v13-signer ${s.primary ? "primary" : ""} ${d ? "v21-dup" : ""}`}>
          <button type="button" className="v13-star" onClick={() => primary(i)} title={s.primary ? "Contato recomendado" : "Marcar como recomendado"} aria-label="Marcar como recomendado"><Star size={16} fill={s.primary ? "currentColor" : "none"} /></button>
          <input value={s.name} onChange={e => set(i, { name: e.target.value })} placeholder="Nome completo" aria-label="Nome" />
          <input value={s.email} onChange={e => set(i, { email: e.target.value.trim() })} placeholder="e-mail" type="email" aria-label="E-mail" />
          <input value={s.phone || ""} onChange={e => set(i, { phone: e.target.value })} placeholder="Celular (DDD)" aria-label="Celular" />
          <input value={s.role || ""} onChange={e => set(i, { role: e.target.value })} placeholder="Cargo (opcional)" aria-label="Cargo" />
          <button type="button" className="v13-del" onClick={() => remove(i)} title="Remover contato" aria-label="Remover contato"><Trash2 size={15} /></button>
        </div>
        {d && <div className="v21-dup-msg"><AlertTriangle size={13} /> {dupText(d, clientId || "_novo")}{d.clientId === (clientId || "_novo") ? " — remova um dos dois." : "."}</div>}
      </div>; })}
    <div className="v21-signers-actions">
      <button type="button" className="v13-add" onClick={add}><Plus size={15} /> Adicionar contato</button>
      <button type="button" className="v13-add v21-zp-btn" onClick={() => setZp(true)}><Cloud size={15} /> Buscar na ZapSign</button>
    </div>
    {zp && <ZapsignPeople clientId={clientId || "_novo"} clientName={clientName} clients={clients} current={list} onClose={() => setZp(false)}
      onImport={add2 => { if (!add2.length) return; const hasPrimary = list.some(x => x.primary); onChange([...list, ...add2.map((x, j) => ({ ...x, primary: !hasPrimary && j === 0 }))]); }} />}
  </div>;
}
