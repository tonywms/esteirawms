import { loadState } from "@/lib/storage";
import { COOKIE, authEnabled, readSession } from "@/lib/auth";
import { asProfile, canManageUsers } from "@/lib/permissions";
export const runtime="nodejs";export const dynamic="force-dynamic";
// V7.6: a lista de usuarios (e-mails/perfis) so vai para Administradores e Gestores
export async function GET(req:Request){try{
 const state=await loadState();
 if(authEnabled()){
  const raw=req.headers.get("cookie")?.split(/;\s*/).find(c=>c.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  const s=await readSession(raw);const p=asProfile(s?.p);
  if(!p||!canManageUsers(p)){state.users=[];state.audit=state.audit.filter(a=>a.entity!=="users")}
 }
 return Response.json(state,{headers:{"Cache-Control":"no-store"}})
}catch(e){return Response.json({error:e instanceof Error&&e.message.startsWith("Armazenamento")?e.message:"Falha ao carregar dados."},{status:500})}}
