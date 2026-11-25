import { loadState } from "@/lib/storage";
import { recordSnapshot } from "@/lib/evolucao-store";
import { getPanelConfig, listAvatars, listLogos } from "@/lib/avatar-store";
import { COOKIE, authEnabled, readSession } from "@/lib/auth";
import { asProfile, canManageUsers } from "@/lib/permissions";
export const runtime="nodejs";export const dynamic="force-dynamic";
// V7.6: a lista de usuarios (e-mails/perfis) so vai para Administradores e Gestores
export async function GET(req:Request){try{
 const state=await loadState();
 void recordSnapshot(state).catch(e=>console.error("[esteira] foto do dia",e)); // V18: foto diaria para a Evolucao
 if(authEnabled()){
  const raw=req.headers.get("cookie")?.split(/;\s*/).find(c=>c.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  const s=await readSession(raw);const p=asProfile(s?.p);
  if(!p||!canManageUsers(p)){state.users=[];state.audit=state.audit.filter(a=>a.entity!=="users")}
 }
 const avatars=await listAvatars().catch(()=>[]); // V26: fotos de perfil enviadas pelo app
 const logos=await listLogos().catch(()=>[]); // V32: logos dos clientes
 const config=await getPanelConfig().catch(()=>({})); // V41: configurações do painel (semanas na TV)
 return Response.json({...state,avatars,logos,config},{headers:{"Cache-Control":"no-store"}})
}catch(e){return Response.json({error:e instanceof Error&&e.message.startsWith("Armazenamento")?e.message:"Falha ao carregar dados."},{status:500})}}
