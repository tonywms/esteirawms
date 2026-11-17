"use client";
import { useState } from "react";
import { LockKeyhole, Mail, ArrowRight, RefreshCw, Eye, EyeOff } from "lucide-react";
export default function Entrar() {
  const [email, setEmail] = useState(""), [senha, setSenha] = useState(""), [ver, setVer] = useState(false), [erro, setErro] = useState(""), [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setErro("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
    if (r.ok) { const j = await r.json().catch(() => ({})); const volta = new URLSearchParams(window.location.search).get("volta"); window.location.href = volta && volta.startsWith("/") && !volta.startsWith("//") ? volta : (j.home || "/"); return; }
    const j = await r.json().catch(() => ({})); setErro(j.error || "Falha ao entrar."); setBusy(false);
  }
  return <main className="v7-login">
    <form className="v7-login-card" onSubmit={go}>
      <img src="/wms-expert-logo.png" alt="WMS Expert" />
      <span className="v7-login-eyebrow">ESTEIRA DE ENTREGAS</span>
      <h1>Entrar</h1>
      <p>Use o e-mail e a senha cadastrados pelo administrador em Usuários.</p>
      <label><Mail size={16} /><input type="email" autoFocus autoComplete="username" placeholder="seu.email@empresa.com.br" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label><LockKeyhole size={16} /><input type={ver ? "text" : "password"} autoComplete="current-password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} required />
        <button type="button" className="v7-eye" onClick={() => setVer(v => !v)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}>{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button></label>
      {erro && <div className="v7-login-error">{erro}</div>}
      <button className="v7-login-submit" disabled={busy || !email || !senha}>{busy ? <RefreshCw className="spin" size={17} /> : <ArrowRight size={17} />} Entrar</button>
      <small className="v7-login-foot">Esqueceu a senha? Peça a um Administrador para definir uma nova em Usuários.</small>
    </form>
  </main>;
}
