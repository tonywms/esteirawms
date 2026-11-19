import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authEnabled, onVercel, readSession, safeEqual, signSession, tvKey } from "@/lib/auth";
import { asProfile, canExport, canImport, canSeePath, canWriteEntity, homeFor, type Profile } from "@/lib/permissions";

const PUBLIC = ["/entrar", "/api/auth", "/api/zapsign/webhook"]; // o webhook valida a própria chave
const LEGACY: Record<string, Profile> = { admin: "Administrador", editor: "Analista", viewer: "Visualizador" };

function apiAllowed(p: Profile, path: string, method: string): string | null {
  const read = method === "GET" || method === "HEAD";
  if (path.startsWith("/api/export")) return canExport(p) ? null : "Seu perfil não pode exportar a base.";
  if (path.startsWith("/api/import")) return canImport(p) ? null : "Somente Administradores e Gestores podem importar a base.";
  if (path.startsWith("/api/docs/upload")) return canWriteEntity(p, "projects", "PATCH") ? null : `Seu perfil (${p}) não pode anexar documentos.`;
  if (path.startsWith("/api/docs/view")) return p === "Painel" ? "Perfil Painel: somente a TV." : null;
  if (path.startsWith("/api/zapsign/send") || path.startsWith("/api/zapsign/sync")) return p === "Painel" ? "Perfil Painel: somente a TV." : canWriteEntity(p, "projects", "PATCH") ? null : `Seu perfil (${p}) não pode enviar documentos para assinatura.`;
  if (path.startsWith("/api/tasks/attachments")) return p === "Painel" ? "Perfil Painel: somente a TV." : canWriteEntity(p, "tasks", "PATCH") ? null : `Seu perfil (${p}) não pode anexar arquivos.`;
  if (path.startsWith("/api/flow/override") || path.startsWith("/api/escalate") || path.startsWith("/api/report")) return canWriteEntity(p, "projects", "PATCH") ? null : `Seu perfil (${p}) não pode executar esta ação.`;
  if (read) return null;
  const m = path.match(/^\/api\/records\/([^/]+)/);
  if (m) return canWriteEntity(p, m[1], method) ? null : p === "Visualizador" ? "Seu perfil (Visualizador) permite apenas consulta." : `Seu perfil (${p}) não tem permissão para esta alteração.`;
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!authEnabled()) {
    if (!onVercel()) return NextResponse.next(); // uso local sem login
    return new NextResponse("Esteira: configure ESTEIRA_SEGREDO e ESTEIRA_TV_CHAVE nas variaveis do projeto no Vercel.", { status: 503 });
  }
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const key = searchParams.get("k"), tv = tvKey();
  if (pathname === "/tv" && key && tv && safeEqual(key, tv)) {
    const res = NextResponse.redirect(new URL("/tv", req.url));
    res.cookies.set(COOKIE, await signSession({ r: "tv", n: "TV" }, 180), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 180 * 86400 });
    return res;
  }

  const s = await readSession(req.cookies.get(COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");
  if (!s) {
    if (isApi) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    const login = new URL("/entrar", req.url);
    if (pathname !== "/") login.searchParams.set("volta", pathname);
    return NextResponse.redirect(login);
  }
  if (s.r === "tv") {
    const ok = req.method === "GET" && (pathname === "/tv" || pathname === "/api/state" || pathname === "/api/evolucao" || pathname.startsWith("/api/avatar/"));
    if (ok) return NextResponse.next();
    return isApi ? NextResponse.json({ error: "Link da TV: somente leitura." }, { status: 403 }) : NextResponse.redirect(new URL("/tv", req.url));
  }
  const profile = asProfile(s.p) || LEGACY[s.r] || "Visualizador";
  if (isApi) {
    const deny = apiAllowed(profile, pathname, req.method);
    return deny ? NextResponse.json({ error: deny }, { status: 403 }) : NextResponse.next();
  }
  if (pathname === "/tv" || canSeePath(profile, pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL(homeFor(profile), req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
