"use client";
// V36 · Quando uma versão nova do site é publicada:
//  - TV: recarrega sozinha (alguns segundos depois), sem precisar de F5;
//  - telas abertas: mostra o aviso "Nova versão publicada" com o botão Atualizar
//    (e atualiza sozinha se a aba estiver em segundo plano, para não perder nada que esteja sendo digitado).
// A TV também recarrega uma vez por dia de madrugada, por segurança.
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

async function current(): Promise<string | null> {
  try { const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" }); if (!r.ok) return null; const j = await r.json(); return typeof j.v === "string" ? j.v : null; } catch { return null; }
}

export default function VersionWatcher({ mode = "app" }: { mode?: "app" | "tv" }) {
  const base = useRef<string | null>(null), started = useRef(Date.now());
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const v = await current(); if (stop || !v) return;
      if (!base.current) { base.current = v; return; }
      if (v !== base.current) {
        if (mode === "tv" || document.visibilityState === "hidden") { setFresh(true); const go = () => { if ((window as unknown as { __wmsTvBusy?: boolean }).__wmsTvBusy) return void setTimeout(go, 3000); window.location.reload(); }; // V43: espera a chamada prioritária terminar
          setTimeout(go, mode === "tv" ? 4000 : 500); }
        else setFresh(true);
      } else if (mode === "tv") {
        const h = new Date().getHours(); // recarga diária de segurança (TV ligada direto)
        if (Date.now() - started.current > 20 * 3600e3 && h >= 4 && h < 6 && !(window as unknown as { __wmsTvBusy?: boolean }).__wmsTvBusy) window.location.reload();
      }
    };
    void check();
    const t = setInterval(() => void check(), mode === "tv" ? 60_000 : 120_000);
    const vis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [mode]);
  if (!fresh) return null;
  if (mode === "tv") return <div className="v36-tv-up" role="status"><RefreshCw size={22} className="spin" /> Nova versão publicada · atualizando a TV…</div>;
  return <div className="v36-up" role="status"><Sparkles size={16} /><span><b>Nova versão publicada.</b> Salve o que estiver editando e atualize para ver as novidades.</span><button type="button" onClick={() => window.location.reload()}><RefreshCw size={14} /> Atualizar agora</button></div>;
}
