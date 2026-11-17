import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authEnabled, onVercel, readSession, safeEqual, signSession, tvKey, type Role } from "@/lib/auth";

const PUBLIC = ["/entrar", "/api/auth"];
function allowed(role: Role, path: string, method: string) {
  const read = method === "GET" || method === "HEAD";
  if (role === "tv") return read && (path === "/tv" || path === "/api/state");
  if (role === "viewer") return read;
  if (role === "editor") return !(path.startsWith("/api/records/users") && !read) && !path.startsWith("/api/import");
  return true; // admin
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
  if (s && allowed(s.r, pathname, req.method)) return NextResponse.next();
  if (s && s.r !== "tv") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: s.r === "viewer" ? "Seu perfil (Visualizador) permite apenas consulta." : "Somente Administradores podem alterar usuários ou importar a base." }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  const login = new URL("/entrar", req.url);
  if (pathname !== "/") login.searchParams.set("volta", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
