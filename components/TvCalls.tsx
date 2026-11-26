"use client";
// V43 · Painel da TV: chamada das entregas prioritárias (estilo chamado de hospital).
// Mostra um card por vez no meio da tela, toca o "dim-dom" e a voz lê o card; só passa para o próximo
// quando a fala termina (sem atropelo). Depois do último card, devolve a TV para a próxima visão.
import { useEffect, useRef, useState } from "react";
import { Building2, Siren, Volume2, VolumeX } from "lucide-react";
import { logoUrl } from "@/lib/logos";
import type { State } from "@/lib/types";
import { callKey, type CallItem } from "@/lib/chamados";
import { chime, speak, stopSpeaking, unlockAudio } from "@/lib/tv-voice";
import { phaseOf, PHASES } from "@/lib/flow";
import { ClientLogo } from "./ClientLogo";
import { Face } from "./FilaBoard";

const SILENT_MS = 9000; // sem voz (bloqueada ou desligada), cada card fica 9s
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const br = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
export function spokenText(x: CallItem) {
  return `Atenção. Entrega prioritária. Fila ${x.queue}. Cliente: ${x.client}. Atendimento: ${x.call.owner}. ${x.call.reason.replace(/[.\s]+$/, "")}.`;
}

export default function TvCalls({ items, data, voice, onDone }: { items: CallItem[]; data: State; voice: boolean; onDone: () => void }) {
  const list = useRef(items); // a rodada usa a fila do momento em que a tela entrou
  const [i, setI] = useState(0), [talking, setTalking] = useState(false), [blocked, setBlocked] = useState(false);
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const sig = { cancelled: false };
    (async () => {
      for (let k = 0; k < list.current.length; k++) {
        if (sig.cancelled) return;
        setI(k);
        await new Promise(r => setTimeout(r, 700)); // entrada do card
        let spoke = false;
        if (voice) {
          await chime();
          if (sig.cancelled) return;
          setTalking(true);
          const q = Number(new URLSearchParams(window.location.search).get("velocidade")); // V43.1: ?velocidade=1.5 sobrepõe nesta TV
          const r = await speak(spokenText(list.current[k]), { signal: sig, rate: q >= 0.5 && q <= 3 ? q : 1.75 });
          setTalking(false);
          if (r === "blocked") setBlocked(true); else if (r === "ok") { spoke = true; setBlocked(false); }
        }
        if (sig.cancelled) return;
        await new Promise(r => setTimeout(r, spoke ? 2200 : SILENT_MS));
      }
      if (!sig.cancelled) done.current();
    })();
    return () => { sig.cancelled = true; stopSpeaking(); };
  }, [voice]);
  const all = list.current, x = all[Math.min(i, all.length - 1)];
  if (!x) return null;
  const ph = PHASES.find(f => f.key === phaseOf(x.p))?.label || "";
  return <section className="v43-tv" data-nofit="1">
    <div className="v43-stage">
      <div className="v43-card" key={callKey(x)}>
        <div className="v43-top"><span className="siren"><Siren size={26} /></span><span className="lbl">ENTREGA PRIORITÁRIA</span>{x.late && <span className="late">desde {br(x.call.date)}</span>}<span className="n">{i + 1} de {all.length}</span></div>
        <div className="v43-body">
          <div className="v43-fila"><small>FILA</small><b>{x.queue}</b></div>
          <div className="v43-main">
            <div className="v43-client">{logoUrl(x.clientId) ? <ClientLogo clientId={x.clientId} name={x.client} size={96} className="v43-logo" /> : <span className="v43-logo v43-nologo"><Building2 /></span>}<div><small>Cliente</small><h2>{x.client}</h2>{ph && <span className="ph">{ph}</span>}</div></div>
            <div className="v43-who"><Face name={x.call.owner} size={88} /><div><small>Atendimento</small><b>{x.call.owner}</b></div>
              <span className={`wave ${talking ? "on" : ""}`} aria-hidden><i /><i /><i /><i /><i /></span></div>
            <p className="v43-why">{x.call.reason}</p>
            <div className="v43-meta">Aberta {x.call.date !== x.call.createdAt.slice(0, 10) ? `para ${br(x.call.date)} ` : ""}às {hhmm(x.call.createdAt)}{x.call.by ? ` por ${x.call.by}` : ""}</div>
          </div>
        </div>
      </div>
      <div className="v43-next">{all.map((y, k) => <span key={callKey(y)} className={k === i ? "on" : k < i ? "past" : ""}><b>{y.queue}</b><ClientLogo clientId={y.clientId} size={22} />{y.client}<small>{y.call.owner}</small></span>)}</div>
    </div>
    {voice && blocked && <button type="button" className="v43-unlock" onClick={() => { unlockAudio(); setBlocked(false); }}><VolumeX size={20} /> Clique aqui (ou em qualquer lugar da TV) para ativar a voz</button>}
    {voice && !blocked && <span className="v43-voice"><Volume2 size={16} /> voz ligada</span>}
  </section>;
}
