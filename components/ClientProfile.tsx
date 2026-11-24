"use client";
// V29 · Ficha do cliente: razão social, nome fantasia, CNPJ, patrocinador, key users (até 3) e suporte de TI.
// Essas pessoas são as responsáveis do cliente no cronograma e saem no PDF/Excel enviado a ele.
// V33 · TI integração, TI secundário e gestor de logística (nome, e-mail, celular) — viram responsáveis no cronograma.
// V32 · Logo do cliente (busca no site ou arquivo), site da empresa e dados do RAC preservados ao salvar.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, FileText, Globe, ImagePlus, Mail, Pencil, Phone, Plus, RefreshCw, Star, Trash2, UserRound, X } from "lucide-react";
import { ClientLogo, LogoDialog } from "./ClientLogo";
import { logoUrl } from "@/lib/logos";
import type { Client, ClientInfo, ClientPerson } from "@/lib/types";
import { fmtCnpj, validCnpj } from "@/lib/schedule";

type Props = { client: Client; onRefresh: () => Promise<void> | void; notify: (m: string) => void; canWrite?: boolean };
const empty: ClientPerson = { name: "", email: "", phone: "", role: "" };
const phoneFmt = (v?: string) => { const d = (v || "").replace(/\D/g, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : v || ""; };

export default function ClientProfile({ client, onRefresh, notify, canWrite = true }: Props) {
  const info = client.info || {};
  const [open, setOpen] = useState(false), [logo, setLogo] = useState(false);
  const rac = info.rac || {};
  const filled = [info.tradeName, info.cnpj, info.sponsor?.name, info.keyUsers?.[0]?.name].filter(Boolean).length;
  const Person = ({ label, p, star }: { label: string; p?: ClientPerson; star?: boolean }) => <div className={`v29-person ${p?.name ? "" : "empty"}`}>
    <span className="ic">{star ? <Star size={14} /> : <UserRound size={14} />}</span>
    <div><small>{label}</small><b>{p?.name || "Não informado"}</b>{p?.name && <em>{[p.role, p.email, phoneFmt(p.phone)].filter(Boolean).join(" · ")}</em>}</div>
  </div>;
  return <div className="panel v29-profile">
    <header>{canWrite ? <button type="button" className="v32-logo-btn" onClick={() => setLogo(true)} title={logoUrl(client.id) ? "Trocar o logo" : "Adicionar o logo do cliente"}><ClientLogo clientId={client.id} name={client.name} size={52} wide fallback /><span><ImagePlus size={12} /> {logoUrl(client.id) ? "Trocar logo" : "Logo"}</span></button> : <ClientLogo clientId={client.id} name={client.name} size={52} wide fallback />}<div><h3><Building2 size={17} /> Dados do cliente e responsáveis</h3><p>Saem no cronograma, no PDF e no Excel enviados ao cliente. Os key users são os responsáveis pelas fases do lado do cliente.</p></div>
      {canWrite && <button type="button" className="btn outline small" onClick={() => setOpen(true)}><Pencil size={14} /> {filled ? "Editar dados" : "Preencher dados"}</button>}</header>
    <div className="v29-ids">
      <div><small>Razão social</small><b>{info.legalName || client.name}</b></div>
      <div><small>Nome fantasia</small><b>{info.tradeName || "—"}</b></div>
      <div><small>CNPJ</small><b>{fmtCnpj(info.cnpj) || "—"}</b></div>
      {(info.site || info.city) && <div><small>{info.site ? "Site" : "Cidade"}</small><b>{info.site ? <a href={`https://${info.site.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer noopener"><Globe size={12} /> {info.site.replace(/^https?:\/\//, "")}</a> : info.city}</b></div>}
    </div>
    <div className="v29-people">
      <Person label="Patrocinador" p={info.sponsor} star />
      {[0, 1, 2].filter(i => i === 0 || info.keyUsers?.[i]?.name).map(i => <Person key={i} label={`Key user ${i + 1}`} p={info.keyUsers?.[i]} />)}
      <Person label="TI · integração" p={info.itSupport} />
      <Person label="TI secundário" p={info.itSecondary} />
      <Person label="Gestor de logística" p={info.logisticsManager} />
      {info.owner?.name && <Person label="Proprietário" p={info.owner} />}
      {info.manager?.name && <Person label="Gerente" p={info.manager} />}
    </div>
    {rac.rac && <div className="v32-rac" title="Dados do RAC (registro interno da venda — não sai nos documentos do cliente)"><FileText size={13} /><b>RAC nº {rac.rac}</b>{[rac.plano, rac.erp && `ERP ${rac.erp}`, rac.horas, rac.usuarios && `${rac.usuarios} usuário(s)`, rac.modalidade, info.city, rac.keyAccount && `Key account: ${rac.keyAccount}`].filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}</div>}
    {logo && <LogoDialog client={client} onClose={() => setLogo(false)} onSaved={async m => { await onRefresh(); notify(m); }} />}
    {open && <EditDialog client={client} onClose={() => setOpen(false)} onSaved={async () => { await onRefresh(); notify("Dados do cliente salvos"); }} />}
  </div>;
}

function EditDialog({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => Promise<void> }) {
  const i0 = client.info || {};
  const [f, setF] = useState<ClientInfo>({ legalName: i0.legalName || client.name, tradeName: i0.tradeName || "", cnpj: fmtCnpj(i0.cnpj) || "", site: i0.site || "", sponsor: { ...empty, ...i0.sponsor }, keyUsers: (i0.keyUsers?.length ? i0.keyUsers : [empty]).map(k => ({ ...empty, ...k })), itSupport: { ...empty, ...i0.itSupport }, itSecondary: { ...empty, ...i0.itSecondary }, logisticsManager: { ...empty, ...i0.logisticsManager } });
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [mounted, setMounted] = useState(false), ti = true;
  useEffect(() => { setMounted(true); const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [busy, onClose]);
  const setP = (k: "sponsor" | "itSupport" | "itSecondary" | "logisticsManager", v: Partial<ClientPerson>) => setF(x => ({ ...x, [k]: { ...(x[k] as ClientPerson), ...v } }));
  const setK = (i: number, v: Partial<ClientPerson>) => setF(x => ({ ...x, keyUsers: (x.keyUsers || []).map((k, j) => j === i ? { ...k, ...v } : k) }));
  const okMail = (e?: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (f.cnpj && !validCnpj(f.cnpj)) return setErr("CNPJ inválido. Confira os 14 dígitos.");
    const all = [f.sponsor, ...(f.keyUsers || []), f.itSupport, f.itSecondary, f.logisticsManager].filter(Boolean) as ClientPerson[];
    const bad = all.find(p => p.name && !okMail(p.email)); if (bad) return setErr(`E-mail inválido para ${bad.name}.`);
    if (all.some(p => !p.name && (p.email || p.phone))) return setErr("Informe o nome de quem tem e-mail ou telefone preenchido.");
    const clean = (p?: ClientPerson) => p?.name?.trim() ? { name: p.name.trim(), email: p.email?.trim() || undefined, phone: (p.phone || "").replace(/\D/g, "") || undefined, role: p.role?.trim() || undefined } : undefined;
    // V32: mantém o que não está neste formulário (dados do RAC, cidade, proprietário, gerente...)
    const info: ClientInfo = { ...i0, site: (f.site || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") || undefined, legalName: f.legalName?.trim() || undefined, tradeName: f.tradeName?.trim() || undefined, cnpj: (f.cnpj || "").replace(/\D/g, "") || undefined,
      sponsor: clean(f.sponsor), keyUsers: (f.keyUsers || []).map(clean).filter(Boolean) as ClientPerson[], itSupport: clean(f.itSupport), itSecondary: clean(f.itSecondary), logisticsManager: clean(f.logisticsManager) };
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/records/clients/${client.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ info }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
      await onSaved(); onClose();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Falha ao salvar."); setBusy(false); }
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className="v29-dlg" role="dialog" aria-modal="true" aria-labelledby="v29-dlg-title" onSubmit={e => void save(e)}>
      <header><h2 id="v29-dlg-title"><Building2 size={19} /> Dados do cliente</h2><button type="button" className="p6-confirm-x" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={17} /></button></header>
      <div className="body">
        <div className="ids">
          <label><span>Razão social</span><input value={f.legalName || ""} onChange={e => setF(x => ({ ...x, legalName: e.target.value }))} /></label>
          <label><span>Nome fantasia</span><input value={f.tradeName || ""} onChange={e => setF(x => ({ ...x, tradeName: e.target.value }))} placeholder="Nome usado no cronograma e nos documentos" /></label>
          <label><span>Site</span><input value={f.site || ""} onChange={e => setF(x => ({ ...x, site: e.target.value }))} placeholder="empresa.com.br (usado para buscar o logo)" /></label>
          <label><span>CNPJ</span><input value={f.cnpj || ""} onChange={e => setF(x => ({ ...x, cnpj: e.target.value }))} onBlur={e => setF(x => ({ ...x, cnpj: fmtCnpj(e.target.value) }))} placeholder="00.000.000/0000-00" className={f.cnpj && !validCnpj(f.cnpj) ? "bad" : ""} /></label>
        </div>
        <PersonFields p={f.sponsor || empty} on={v => setP("sponsor", v)} title="Patrocinador" hint="aprova o início e as entregas do projeto" />
        {(f.keyUsers || []).map((k, i) => <div key={i} className="v29-ku"><PersonFields p={k} on={v => setK(i, v)} title={`Key user ${i + 1}`} hint={i === 0 ? "responsável pelas fases do lado do cliente" : undefined} />
          {i > 0 && <button type="button" className="rm" onClick={() => setF(x => ({ ...x, keyUsers: (x.keyUsers || []).filter((_, j) => j !== i) }))} aria-label={`Remover key user ${i + 1}`}><Trash2 size={14} /></button>}</div>)}
        <div className="adds">
          {(f.keyUsers || []).length < 3 && <button type="button" className="btn outline small" onClick={() => setF(x => ({ ...x, keyUsers: [...(x.keyUsers || []), { ...empty }] }))}><Plus size={14} /> Adicionar key user {(f.keyUsers || []).length + 1}</button>}
        </div>
        {ti && <PersonFields p={f.itSupport || empty} on={v => setP("itSupport", v)} title="TI · integração" hint="responsável pela integração com o ERP, rede e equipamentos" />}
        <PersonFields p={f.itSecondary || empty} on={v => setP("itSecondary", v)} title="TI secundário" hint="substituto do TI de integração" />
        <PersonFields p={f.logisticsManager || empty} on={v => setP("logisticsManager", v)} title="Gestor de logística" hint="gestor da operação no armazém (treinamento de gestão, go-live)" />
      </div>
      {err && <div className="p6-confirm-error" role="alert">{err}</div>}
      <footer><button type="button" className="btn outline" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <RefreshCw className="spin" size={14} /> : <Check size={14} />} Salvar</button></footer>
    </form>
  </div>, document.body);
}

function PersonFields({ p, on, title, hint }: { p: ClientPerson; on: (v: Partial<ClientPerson>) => void; title: string; hint?: string }) {
  return <fieldset className="v29-pf">
    <legend>{title}{hint && <small>{hint}</small>}</legend>
    <label><span>Nome</span><input value={p.name} onChange={e => on({ name: e.target.value })} placeholder="Nome completo" /></label>
    <label><span>Cargo / função</span><input value={p.role || ""} onChange={e => on({ role: e.target.value })} placeholder="Ex.: Gerente de logística" /></label>
    <label><span><Mail size={12} /> E-mail</span><input type="email" value={p.email || ""} onChange={e => on({ email: e.target.value })} placeholder="nome@cliente.com.br" /></label>
    <label><span><Phone size={12} /> Celular</span><input value={p.phone || ""} onChange={e => on({ phone: e.target.value })} onBlur={e => on({ phone: phoneFmt(e.target.value) })} placeholder="(85) 99999-9999" /></label>
  </fieldset>;
}
