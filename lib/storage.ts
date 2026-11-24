import { promises as fs } from "node:fs";
import {friendly} from "./friendly";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EntityName, State } from "./types";
/*
 V7 · Armazenamento:
  - Supabase (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY + ESTEIRA_DB_CHAVE): tabelas reais, usado no Vercel
    e tambem no seu computador quando o .env.local estiver configurado (mesmos dados nos dois).
  - Arquivo local data/state.json: modo antigo, quando o Supabase nao esta configurado.
*/
import { sbLoad, sbReplace, sbSaveDiff, supabaseConfigured } from "./supabase-store";
import { canMove, phaseOf, type PhaseKey } from "./flow";
import { applyAutoProgress } from "./progress"; // V34: avanço automático
const dbFile=path.join(process.cwd(),"data","state.json");
export const storageMode=():"supabase"|"file"=>supabaseConfigured()?"supabase":"file";
const assertWritableHost=()=>{if(process.env.VERCEL==="1"&&storageMode()==="file")throw new Error("Armazenamento nao configurado: defina SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e ESTEIRA_DB_CHAVE no Vercel.")};
export const emptyState=():State=>({version:1,importedAt:"",sourceFile:"",clients:[],projects:[],tasks:[],appointments:[],staff:[],users:[],audit:[]});
let queue=Promise.resolve();
export const validEntities:EntityName[]=["clients","projects","tasks","appointments","staff","users"];
export const isEntity=(name:string):name is EntityName=>validEntities.includes(name as EntityName);
const normalize=(raw:State)=>{for(const k of validEntities)if(!Array.isArray(raw[k]))(raw as unknown as Record<string,unknown[]>)[k]=[];if(!Array.isArray(raw.audit))raw.audit=[];return applyAutoProgress(raw)};

export async function loadState():Promise<State>{
 assertWritableHost();
 if(storageMode()==="supabase")return normalize(await sbLoad());
 return normalize(JSON.parse(await fs.readFile(dbFile,"utf8")) as State);
}
export async function transact<T>(fn:(state:State)=>T|Promise<T>):Promise<T>{
 const work=queue.then(async()=>{
  if(storageMode()==="supabase"){
   const state=await loadState();
   const before=structuredClone(state);
   const out=await fn(state);
   applyAutoProgress(state);
   await sbSaveDiff(before,state);
   return out;
  }
  const state=await loadState();
  const out=await fn(state);
  applyAutoProgress(state);
  const tmp=path.join(path.dirname(dbFile),`.state-${randomUUID()}.tmp`);
  await fs.writeFile(tmp,JSON.stringify(state,null,2),"utf8");
  try{await fs.rename(tmp,dbFile)}catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});throw e}
  return out;
 });
 queue=work.then(()=>undefined,()=>undefined);
 return work;
}
/** Substitui a base inteira (importacao de backup). Valida a estrutura antes. */
export async function replaceState(next:State){
 normalize(next);
 const ids=new Set(next.clients.map(c=>c.id)),pids=new Set(next.projects.map(p=>p.id));
 if(!next.projects.every(p=>ids.has(p.clientId)))throw new Error("Backup inconsistente: projeto sem cliente.");
 if(!next.tasks.every(t=>pids.has(t.projectId))||!next.appointments.every(a=>pids.has(a.projectId)))throw new Error("Backup inconsistente: atividade/agendamento sem projeto.");
 audit(next,"base","importada","*",`Backup importado (${next.clients.length} clientes, ${next.projects.length} projetos)`);
 if(storageMode()==="supabase"){await sbReplace(next);return {clients:next.clients.length,projects:next.projects.length,tasks:next.tasks.length}}
 return transact(state=>{Object.assign(state,next);return {clients:next.clients.length,projects:next.projects.length,tasks:next.tasks.length}});
}
export const problem=(message:string,status=400)=>{const nice=friendly(message);if(nice!==message)console.error("[esteira]",message);return Response.json(nice!==message?{error:nice,detail:message}:{error:message},{status});};
const required=(value:unknown)=>typeof value==="string"&&value.trim().length>0;
export function validate(entity:EntityName, value:Record<string,unknown>,s:State,id?:string):string|null{
 const existing=(s[entity] as unknown as {id:string}[]);
 if(entity==="clients"){
  if(!required(value.name))return "Informe o nome do cliente.";
  if(existing.some(x=>x.id!==id && (x as unknown as {name:string}).name.toLowerCase()===String(value.name).trim().toLowerCase()))return "Já existe um cliente com este nome.";
 }
 if(entity==="projects"){
  if(!required(value.name))return "Informe o nome do projeto.";
  if(!s.clients.some(x=>x.id===value.clientId))return "Selecione um cliente existente.";
  if(value.progress!==undefined&&(!Number.isFinite(Number(value.progress))||Number(value.progress)<0||Number(value.progress)>100))return "O avanço deve ficar entre 0 e 100%.";
  // V8: avanço de fase só com o PDF da fase atual anexado
  const old=id?s.projects.find(x=>x.id===id):undefined;
  // V9: dispensa de PDF só pela rota de liberação master (e-mail + senha)
  const waivers=(ph:unknown)=>JSON.stringify(Object.entries((ph||{}) as Record<string,{docWaived?:unknown}>).map(([k,v])=>[k,v?.docWaived||null]).filter(x=>x[1]).sort());
  if(value.phases!==undefined&&waivers(value.phases)!==waivers(old?.phases))return "Somente um usuário master pode liberar fase sem PDF.";
  if(old&&value.phase&&value.phase!==phaseOf(old)){const r=canMove({...old,flow:(value.flow as typeof old.flow)??old.flow,phases:(value.phases as typeof old.phases)||old.phases},value.phase as PhaseKey);if(!r.ok)return r.reason||"Avanço de fase bloqueado.";}
 }
 if(entity==="tasks"){
  if(!required(value.title))return "Informe a descrição da atividade.";
  // V11: atividade nova só entra com responsável e prazo; uma atividade com prazo não pode perdê-lo
  const oldTask=id?s.tasks.find(x=>x.id===id):undefined;
  if(!oldTask&&!required(value.owner))return "Informe o responsável da atividade.";
  if(!oldTask&&!required(value.dueDate))return "Informe o prazo da atividade. Sem prazo ninguém cobra.";
  if(oldTask?.dueDate&&!required(value.dueDate))return "A atividade já tem prazo; altere a data em vez de apagá-la.";
  if(!s.projects.some(x=>x.id===value.projectId))return "Selecione um projeto válido.";
  if(value.startDate&&value.dueDate&&String(value.dueDate)<String(value.startDate))return "O prazo não pode ser anterior ao início.";
 }
 if(entity==="appointments"){
  if(!s.projects.some(x=>x.id===value.projectId))return "Selecione um projeto válido.";
  if(!required(value.consultant)||!required(value.date))return "Selecione o consultor e a data.";
  if(!required(value.shift))return "Selecione o turno.";
  const overlaps=(a:{id:string;consultant:string;date:string|null;shift:string;status:string})=>a.id!==id&&a.status!=="Cancelado"&&value.status!=="Cancelado"&&a.consultant===value.consultant&&a.date===value.date&&(a.shift==="Dia Inteiro"||value.shift==="Dia Inteiro"||a.shift===value.shift);
  if(s.appointments.some(overlaps))return "Conflito de agenda: o consultor já está alocado neste turno.";
 }
 if(entity==="users"){
  if(!required(value.name))return "Informe o nome do usuário.";
  if(!required(value.email)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email)))return "Informe um e-mail válido.";
  if(!["Administrador","Gestor","Analista","Consultor","Visualizador","Painel"].includes(String(value.role)))return "Selecione um perfil válido.";
  if(existing.some(x=>x.id!==id&&(x as unknown as {email:string}).email.toLowerCase()===String(value.email).trim().toLowerCase()))return "O e-mail já está cadastrado.";
 }
 if(entity==="clients"&&Array.isArray(value.signers)){
  const sg=value.signers as {name?:string;email?:string;phone?:string}[];
  if(sg.length>10)return "Máximo de 10 contatos para assinatura por cliente.";
  for(const x of sg){if(!required(x.name))return "Informe o nome de cada contato para assinatura.";if(!x.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x.email).trim()))return `Informe um e-mail válido para ${x.name}.`;}
 }
 if(entity==="staff"){
  if(!required(value.name))return "Informe o nome do profissional.";
  if(value.email&&String(value.email).trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email).trim()))return "Informe um e-mail válido para o profissional.";
  if(existing.some(x=>x.id!==id&&(x as unknown as {name:string}).name.toLowerCase()===String(value.name).trim().toLowerCase()))return "Este profissional já está cadastrado.";
  if(value.capacity!==undefined&&(!Number.isFinite(Number(value.capacity))||Number(value.capacity)<0))return "A capacidade não pode ser negativa.";
 }
 return null;
}
export function audit(s:State,entity:string,operation:string,recordId:string,label:string){s.audit.unshift({id:randomUUID(),at:new Date().toISOString(),entity,operation,recordId,label});s.audit=s.audit.slice(0,1000);}
export const newid=()=>randomUUID();
