"use client";
// V21 · Importar contatos da ZapSign: lista quem já recebeu documentos na sua conta e sugere o cliente
// pelo domínio do e-mail ou pelo nome do documento. Marque e importe — duplicados são avisados.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare2, Cloud, Info, RefreshCw, Search, Sparkles, Square, X } from "lucide-react";
import type { Client, ClientSigner } from "@/lib/types";
import { dupText, findDup, fmtPhone, newSignerId, normEmail, normPhone, suggestClient, type ZsPerson } from "@/lib/contacts";

type Props = { clientId?: string; clientName?: string; clients: Client[]; current: ClientSigner[]; onImport: (add: ClientSigner[]) => void; onClose: () => void };
const keyOf = (p: ZsPerson) => p.email || `tel:${p.phone}` || p.name;

export default function ZapsignPeople({ clientId, clientName, clients, current, onImport, onClose }: Props) {
  const [people, setPeople] = useState<ZsPerson[] | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [q, setQ] = useState(""), [picked, setPicked] = useState<Set<string>>(new Set()), [onlySug, setOnlySug] = useState(true), [mounted, setMounted] = useState(false);
  async function load(force = false) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/zapsign/contacts${force ? "?atualizar=1" : ""}`, { cache: "no-store" }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao consultar a ZapSign.");
      if (!j.configured) throw new Error("A ZapSign ainda não foi configurada. Rode o instalador com -ConfigurarZapSign.");
      setPeople(j.people || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao consultar a ZapSign."); setPeople([]); } finally { setBusy(false); }
  }
  useEffect(() => { setMounted(true); void load(); const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // contatos já na tela (ainda não salvos) também contam como "já cadastrado"
  const pool = useMemo(() => clients.map(c => (c.id === clientId ? { ...c, signers: current } : c)).concat(clientId && !clients.some(c => c.id === clientId) ? [{ id: clientId, name: clientName || "este cliente", system: "", notes: "", createdAt: "", updatedAt: "", signers: current }] : []), [clients, clientId, clientName, current]);
  const rows = useMemo(() => (people || []).map(p => {
    const sug = suggestClient(p, clients);
    const dup = findDup(pool, p);
    return { p, sug, dup, mine: !!sug && sug.id === clientId };
  }).sort((a, b) => Number(b.mine) - Number(a.mine)), [people, clients, pool, clientId]);
  const sugCount = rows.filter(r => r.mine).length;
  const list = rows.filter(r => (!onlySug || r.mine || !sugCount) && (!q || `${r.p.name} ${r.p.email} ${r.p.phone} ${r.p.docNames.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const toggle = (k: string) => setPicked(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  function importNow() {
    const add: ClientSigner[] = [];
    for (const r of rows) if (picked.has(keyOf(r.p)) && !(r.dup && r.dup.clientId === clientId)) {
      if (add.some(a => (normEmail(a.email) && normEmail(a.email) === r.p.email) || (normPhone(a.phone) && normPhone(a.phone) === normPhone(r.p.phone)))) continue;
      add.push({ id: newSignerId(), name: r.p.name, email: r.p.email, phone: r.p.phone, role: "", primary: false });
    }
    onImport(add); onClose();
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="p6-confirm v9-esc v13-sign v21-zp" role="dialog" aria-modal="true" aria-labelledby="v21-zp-title">
      <button type="button" className="p6-confirm-x" onClick={onClose} aria-label="Fechar"><X size={17} /></button>
      <header className="v9-esc-head"><span className="v9-esc-ico"><Cloud size={24} /></span>
        <div><small>Importar contatos · ZapSign</small><h2 id="v21-zp-title">Pessoas da sua conta ZapSign</h2><p><Info size={13} /> Quem já recebeu documentos pela ZapSign{clientName ? ` · importando para ${clientName}` : ""}</p></div></header>
      <div className="v9-esc-body">
        <div className="v21-zp-tools">
          <label className="v21-search"><Search size={15} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, e-mail, telefone ou documento" /></label>
          {sugCount > 0 && <button type="button" className={`v11-toggle ${onlySug ? "on" : ""}`} onClick={() => setOnlySug(v => !v)}>{onlySug ? <CheckSquare2 size={15} /> : <Square size={15} />} Só sugeridos ({sugCount})</button>}
          <button type="button" className="v7-mini-btn" onClick={() => void load(true)} disabled={busy}><RefreshCw size={14} className={busy ? "spin" : ""} /> Atualizar</button>
        </div>
        {error && <div className="p6-confirm-error" role="alert">{error}</div>}
        {people === null ? <div className="v21-zp-loading"><RefreshCw className="spin" size={18} /> Lendo seus documentos na ZapSign…</div> :
          <div className="v21-zp-list">{list.length ? list.map(({ p, sug, dup, mine }) => { const k = keyOf(p), here = dup && dup.clientId === clientId, on = picked.has(k) && !here;
            return <button type="button" key={k} className={`v21-zp-row ${on ? "on" : ""} ${here ? "here" : ""}`} onClick={() => !here && toggle(k)} disabled={!!here}>
              {here ? <CheckSquare2 size={17} className="done" /> : on ? <CheckSquare2 size={17} /> : <Square size={17} />}
              <span className="who"><b>{p.name}</b><small>{[p.email, fmtPhone(p.phone)].filter(Boolean).join(" · ") || "sem e-mail e telefone"}</small>
                <i>{p.docs} documento{p.docs > 1 ? "s" : ""}{p.docNames[0] ? ` · ${p.docNames[0]}` : ""}</i></span>
              <span className="tags">{mine && <em className="sug"><Sparkles size={11} /> sugerido</em>}{!mine && sug && <em>{sug.name}?</em>}{dup && <em className={here ? "ok" : "warn"}>{here ? "já está neste cliente" : dupText(dup, clientId)}</em>}</span>
            </button>; }) : <div className="v9-empty"><Info size={15} /> {q ? "Ninguém encontrado com essa busca." : "Nenhuma pessoa encontrada nos documentos da ZapSign."}</div>}</div>}
        <div className="p6-confirm-note"><Info size={15} /><span>A API da ZapSign não libera a agenda de contatos; aqui aparecem as pessoas dos seus documentos. Contatos que nunca receberam documento você cadastra direto no sistema.</span></div>
      </div>
      <div className="p6-confirm-actions">
        <button type="button" className="p6-confirm-cancel" onClick={onClose}>Cancelar</button>
        <button type="button" className="p6-confirm-ok" onClick={importNow} disabled={!picked.size}><Cloud size={16} />{picked.size ? `Importar ${picked.size} contato${picked.size > 1 ? "s" : ""}` : "Marque quem importar"}</button>
      </div>
    </div>
  </div>, document.body);
}
