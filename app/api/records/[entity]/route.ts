import {audit,isEntity,loadState,newid,problem,transact,validate} from "@/lib/storage";
import {passwordsAvailable,setUserPassword} from "@/lib/user-password";
import type {EntityName,State} from "@/lib/types";
import {logRecord} from "@/lib/activity-log";
import {currentUser} from "@/lib/master";
export const runtime="nodejs";
export async function GET(_r:Request,context:{params:Promise<{entity:string}>}){
 const {entity}=await context.params;
 if(!isEntity(entity))return problem("Cadastro inexistente.",404);
 const state=await loadState();return Response.json(state[entity]);
}
export async function POST(request:Request,context:{params:Promise<{entity:string}>}){
 const {entity}=await context.params;if(!isEntity(entity))return problem("Cadastro inexistente.",404);
 try{
  const body=await request.json() as Record<string,unknown>;const password=entity==="users"&&typeof body.password==="string"?body.password.trim():"";delete body.password;if(entity==="tasks")delete body.attachments;if(password&&password.length<8)return problem("A senha precisa ter pelo menos 8 caracteres.");if(password&&!passwordsAvailable())return problem("Senhas exigem o Supabase configurado.");
  if(!body||typeof body!=="object"||Array.isArray(body))return problem("Dados inválidos.");
  const who=await currentUser().catch(()=>({name:""}));
  const result=await transact((state:State)=>{
   const value:Record<string,unknown>={...body};delete value.id;delete value.source;delete value.createdAt;delete value.updatedAt;
   if(entity==="tasks"||entity==="appointments"){
    const p=state.projects.find(p=>p.id===value.projectId);value.clientId=p?.clientId||"";
   }
   if(entity==="projects")value.system=state.clients.find(c=>c.id===value.clientId)?.system||"";
   const issue=validate(entity,value,state);if(issue)throw new Error(issue);
   const now=new Date().toISOString();const record={...value,id:newid(),createdAt:now,updatedAt:now};
   (state[entity] as unknown as Record<string,unknown>[]).push(record);
   logRecord(state,entity,null,record,who.name||undefined);
   audit(state,entity,"criado",String(record.id),String(value.name||value.title||value.consultant||"Registro"));
   return record;
  });if(password)await setUserPassword(String((result as {id:unknown}).id),password);return Response.json(result,{status:201});
 }catch(e){return problem(e instanceof Error?e.message:"Falha ao cadastrar.")}
}
