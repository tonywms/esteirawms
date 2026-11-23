"use client";
// V26 · Foto de perfil: escolher/tirar foto, enquadrar no círculo (arrastar + zoom) e salvar.
// A foto vale para todas as telas onde o nome aparece (esteira, agenda, gargalos, evolução, TV...).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImagePlus, RefreshCw, Trash2, X, ZoomIn } from "lucide-react";
import { avatarUrl, initials, registerAvatars, type AvatarEntry } from "@/lib/avatars";

const EVT = "v26-photo";
export const openPhotoDialog = (name: string) => window.dispatchEvent(new CustomEvent(EVT, { detail: name }));

/** Envolve a foto/iniciais: clicar abre o editor de foto (só para quem pode editar). */
export function PhotoButton({ name, canEdit, children }: { name: string; canEdit: boolean; children: React.ReactNode }) {
  if (!canEdit || !name) return <>{children}</>;
  return <button type="button" className="v26-photo-btn" title={`Trocar a foto de ${name}`} aria-label={`Trocar a foto de ${name}`} onClick={e => { e.stopPropagation(); openPhotoDialog(name); }}>{children}<span className="cam"><Camera size={12} /></span></button>;
}

/** Item "Minha foto" do menu da conta. */
export function MyPhotoItem({ name, onOpen }: { name?: string; onOpen?: () => void }) {
  if (!name) return null;
  return <button onClick={() => { onOpen?.(); openPhotoDialog(name); }}><Camera size={15} /> Minha foto de perfil</button>;
}

/** Fica montado uma vez no app; abre o editor quando alguém pede. */
export function PhotoHost({ onSaved, notify }: { onSaved: () => void | Promise<void>; notify: (m: string) => void }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => { const h = (e: Event) => setName(String((e as CustomEvent).detail || "")); window.addEventListener(EVT, h); return () => window.removeEventListener(EVT, h); }, []);
  if (!name) return null;
  return <PhotoDialog name={name} onClose={() => setName(null)} onSaved={async m => { await onSaved(); notify(m); }} />;
}

const BOX = 240, OUT = 256;

function PhotoDialog({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: (m: string) => void | Promise<void> }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null), [zoom, setZoom] = useState(1), [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [mounted, setMounted] = useState(false);
  const pick = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null), drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const current = avatarUrl(name), uploaded = !!current && current.includes("?v=");
  useEffect(() => { setMounted(true); const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [busy, onClose]);

  function load(f?: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Escolha uma imagem (JPG ou PNG).");
    setError("");
    const url = URL.createObjectURL(f), i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0, y: 0 }); };
    i.onerror = () => setError("Não foi possível ler esta imagem. Tente um JPG ou PNG.");
    i.src = url;
  }
  // escala base: a imagem cobre o círculo inteiro
  const base = img ? Math.max(BOX / img.naturalWidth, BOX / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : 0, h = img ? img.naturalHeight * base * zoom : 0;
  const clamp = (p: { x: number; y: number }, ww = w, hh = h) => ({ x: Math.min((ww - BOX) / 2, Math.max(-(ww - BOX) / 2, p.x)), y: Math.min((hh - BOX) / 2, Math.max(-(hh - BOX) / 2, p.y)) });
  useEffect(() => { setPos(p => clamp(p)); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!img) return setError("Escolha uma foto primeiro.");
    setBusy("Salvando…"); setError("");
    try {
      const c = document.createElement("canvas"); c.width = OUT; c.height = OUT;
      const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, OUT, OUT);
      const k = OUT / BOX, left = (BOX - w) / 2 + pos.x, top = (BOX - h) / 2 + pos.y;
      g.imageSmoothingQuality = "high"; g.drawImage(img, left * k, top * k, w * k, h * k);
      const data = c.toDataURL("image/jpeg", 0.86);
      const r = await fetch("/api/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, data }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao salvar a foto.");
      registerAvatars(j.avatars as AvatarEntry[]);
      await onSaved(`Foto de ${name.split(" ")[0]} atualizada em todas as telas`); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); setBusy(""); }
  }
  async function remove() {
    setBusy("Removendo…"); setError("");
    try {
      const r = await fetch("/api/avatar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Falha ao remover.");
      registerAvatars(j.avatars as AvatarEntry[]);
      await onSaved(`Foto de ${name.split(" ")[0]} removida`); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao remover."); setBusy(""); }
  }
  if (!mounted) return null;
  return createPortal(<div className="p6-confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="v26-photo" role="dialog" aria-modal="true" aria-labelledby="v26-photo-title">
      <button type="button" className="p6-confirm-x" onClick={onClose} disabled={!!busy} aria-label="Fechar"><X size={17} /></button>
      <h2 id="v26-photo-title">Foto de perfil</h2>
      <p><b>{name}</b> · aparece na esteira, agenda, equipe, gargalos, evolução, TV e em todo lugar onde o nome estiver.</p>
      <div className="stage" style={{ width: BOX, height: BOX }}
        onPointerDown={e => { if (!img) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
        onPointerMove={e => { const d = drag.current; if (!d) return; setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onWheel={e => { if (img) setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.0015))); }}>
        {img ? <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${(BOX - w) / 2 + pos.x}px, ${(BOX - h) / 2 + pos.y}px)` }} />
          : current ? <img src={current} alt="" className="cur" /> : <span className="ini">{initials(name)}</span>}
        {img && <i className="hint">Arraste para enquadrar</i>}
      </div>
      {img && <label className="zoom"><ZoomIn size={15} /><input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} aria-label="Zoom" /></label>}
      <div className="pick">
        <button type="button" className="btn outline" onClick={() => pick.current?.click()} disabled={!!busy}><ImagePlus size={15} /> {img || current ? "Escolher outra" : "Escolher foto"}</button>
        <button type="button" className="btn outline" onClick={() => cam.current?.click()} disabled={!!busy}><Camera size={15} /> Tirar foto</button>
        {uploaded && !img && <button type="button" className="btn outline danger" onClick={() => void remove()} disabled={!!busy}><Trash2 size={15} /> Remover</button>}
      </div>
      <input ref={pick} type="file" accept="image/*" hidden onChange={e => { load(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={e => { load(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <div className="p6-confirm-error" role="alert">{error}</div>}
      <div className="act">
        <button type="button" className="btn outline" onClick={onClose} disabled={!!busy}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!!busy || !img}>{busy ? <RefreshCw className="spin" size={15} /> : <Camera size={15} />} {busy || "Salvar foto"}</button>
      </div>
    </div>
  </div>, document.body);
}
