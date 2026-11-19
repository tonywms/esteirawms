"use client";
// V19 · Foto redonda do consultor ao lado do nome — só aparece para quem tem foto cadastrada.
import { avatarUrl } from "@/lib/avatars";

export function PersonPhoto({ name, size = 22, ring, className = "" }: { name?: string | null; size?: number; ring?: string; className?: string }) {
  const url = avatarUrl(name);
  if (!url) return null;
  return <img className={`v19-photo ${className}`} src={url} alt="" width={size} height={size} style={{ width: size, height: size, ...(ring ? { boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${ring}` } : {}) }} onError={e => { e.currentTarget.style.display = "none"; }} />;
}

/** Nome com a foto antes (se houver). Sem foto, mostra só o nome — não muda o layout. */
export function PersonName({ name, empty = "—", size = 20 }: { name?: string | null; empty?: React.ReactNode; size?: number }) {
  if (!name) return <>{empty}</>;
  const url = avatarUrl(name);
  return url ? <span className="v19-person"><PersonPhoto name={name} size={size} />{name}</span> : <>{name}</>;
}
