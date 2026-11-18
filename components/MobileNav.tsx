"use client";
// V16 · Menu inferior no celular (consultores em campo): atalhos para Esteira, Atividades, Agenda e o menu completo.
// Respeita o perfil: só mostra as telas que o usuário pode abrir.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutGrid, ListChecks, Menu, Waves } from "lucide-react";
import { asProfile, canSeePath, type Profile } from "@/lib/permissions";

const ITEMS = [
  { href: "/", label: "Início", Icon: LayoutGrid },
  { href: "/esteira", label: "Esteira", Icon: Waves },
  { href: "/atividades", label: "Atividades", Icon: ListChecks },
  { href: "/agenda", label: "Agenda", Icon: CalendarDays },
];

export default function MobileNav({ onMenu }: { onMenu: () => void }) {
  const path = usePathname() || "/";
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => { fetch("/api/auth", { cache: "no-store" }).then(r => r.json()).then(j => setProfile(asProfile(j.profile) || "Administrador")).catch(() => setProfile("Administrador")); }, []);
  // Tabelas viram cartões no celular: cada célula recebe o nome da coluna como rótulo.
  useEffect(() => {
    const label = () => document.querySelectorAll<HTMLTableElement>("table.data-table").forEach(t => {
      const heads = [...t.querySelectorAll("thead th")].map(th => th.textContent?.trim() || "");
      t.querySelectorAll("tbody tr").forEach(tr => [...tr.children].forEach((td, i) => { const h = heads[i]; if (h && td.getAttribute("data-label") !== h) td.setAttribute("data-label", h); }));
    });
    label();
    let q = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(q); q = requestAnimationFrame(label); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(q); };
  }, []);
  const items = ITEMS.filter(i => !profile || canSeePath(profile, i.href));
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return <nav className="v16-mnav" aria-label="Navegação rápida">
    {items.map(({ href, label, Icon }) => <Link key={href} href={href} className={active(href) ? "on" : ""} aria-current={active(href) ? "page" : undefined}><Icon size={20} /><span>{label}</span></Link>)}
    <button type="button" onClick={onMenu}><Menu size={20} /><span>Menu</span></button>
  </nav>;
}
