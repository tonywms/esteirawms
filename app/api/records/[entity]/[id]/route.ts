import {audit,isEntity,problem,transact,validate} from "@/lib/storage";
import {passwordsAvailable,setUserPassword} from "@/lib/user-password";
import type {State} from "@/lib/types";
import {logRecord} from "@/lib/activity-log";
import {currentUser} from "@/lib/master";
export const runtime="nodejs";
type C={params:Promise<{entity:string;id:string}>};
export async function PATCH(request:Request,context:C){
 const {entity,id}=await context.params;if(!isEntity(entity))return problem("Cadastro inexistente.",404);
 try{
  const body=await request.json() as Record<string,unknown>;const password=entity==="users"&&typeof body.password==="string"?body.password.trim():"";delete body.password;if(entity==="tasks")delete body.attachments;if(entity==="projects")delete body.extraDocs;delete body.hasPassword;delete body.lastLoginAt;if(password&&password.length<8)return problem("A senha precisa ter pelo menos 8 caracteres.");if(password&&!passwordsAvailable())return problem("Senhas exigem o Supabase configurado.");
  if(!body||typeof body!=="object"||Array.isArray(body))return problem("Dados inválidos.");
  const who=await currentUser().catch(()=>({name:""}));
  const result=await transact((state:State)=>{
   const row=(state[entity] as unknown as Record<string,unknown>[]).find(x=>x.id===id);
   if(!row)throw new Error("Registro não encontrado.");
   const patch={...body};delete patch.id;delete patch.source;delete patch.createdAt;delete patch.updatedAt;
   const value={...row,...patch};
   if(entity==="tasks"||entity==="appointments")value.clientId=state.projects.find(p=>p.id===value.projectId)?.clientId||"";
   if(entity==="projects")value.system=state.clients.find(c=>c.id===value.clientId)?.system||"";
   // V13: o estado da ZapSign é do servidor (webhook) — uma tela desatualizada não pode apagá-lo
   if(entity==="projects"&&value.phases&&row.phases){const rp=row.phases as Record<string,{sign?:unknown;doc?:{uploadedBy?:string}|null}>,vp={...(value.phases as Record<string,Record<string,unknown>>)};for(const k of Object.keys(rp)){if(rp[k]?.sign!==undefined){vp[k]={...(vp[k]||{}),sign:rp[k].sign};if(rp[k]?.doc?.uploadedBy==="ZapSign"&&vp[k].doc===undefined)vp[k].doc=rp[k].doc}}value.phases=vp}
   const issue=validate(entity,value,state,id);if(issue)throw new Error(issue);
   if(entity==="clients"){
    const oldName=String(row.name||"");
    const newName=String(value.name||"");
    for(const p of state.projects.filter(x=>x.clientId===id)){
     p.system=String(value.system||p.system);
     if(p.name===oldName)p.name=newName;
    }
   }
   if(entity==="staff"&&row.name!==value.name){
    const oldName=String(row.name||"");const newName=String(value.name||"");
    state.projects.forEach(p=>{if(p.integrationOwner===oldName)p.integrationOwner=newName;if(p.implementationOwner===oldName)p.implementationOwner=newName});
    state.tasks.forEach(t=>{if(t.owner===oldName)t.owner=newName});
    state.appointments.forEach(a=>{if(a.consultant===oldName)a.consultant=newName});
   }
   const before={...row};
   Object.assign(row,value,{updatedAt:new Date().toISOString()});
   logRecord(state,entity,before,row,who.name||undefined);
   audit(state,entity,"atualizado",id,String(row.name||row.title||row.consultant||"Registro"));
   return row;
  });if(password)await setUserPassword(id,password);return Response.json(result);
 }catch(e){return problem(e instanceof Error?e.message:"Falha ao atualizar.")}
}
export async function DELETE(_request:Request,context:C){
 const {entity,id}=await context.params;if(!isEntity(entity))return problem("Cadastro inexistente.",404);
 try{
  const who=await currentUser().catch(()=>({name:""}));
  await transact((s:State)=>{
   const items=s[entity] as unknown as {id:string;name?:string;title?:string;consultant?:string}[];
   const i=items.findIndex(x=>x.id===id);if(i<0)throw new Error("Registro não encontrado.");
   if(entity==="clients"&&s.projects.some(x=>x.clientId===id))throw new Error("O cliente possui projetos. Exclua ou desvincule os projetos antes.");
   if(entity==="projects"&&(s.tasks.some(x=>x.projectId===id)||s.appointments.some(x=>x.projectId===id)))throw new Error("O projeto possui atividades ou agendamentos. Exclua ou mova os vínculos antes.");
   const old=items.splice(i,1)[0];logRecord(s,entity,old,null,who.name||undefined);audit(s,entity,"excluído",id,String(old.name||old.title||old.consultant||"Registro"));
  });return Response.json({ok:true});
 }catch(e){return problem(e instanceof Error?e.message:"Falha ao excluir.")}
}
