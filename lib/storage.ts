import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EntityName, State } from "./types";
const dbFile=path.join(process.cwd(),"data","state.json");
let queue=Promise.resolve();
export const validEntities:EntityName[]=["clients","projects","tasks","appointments","staff","users"];
export const isEntity=(name:string):name is EntityName=>validEntities.includes(name as EntityName);
export async function loadState():Promise<State>{const raw=JSON.parse(await fs.readFile(dbFile,"utf8")) as State; if(!Array.isArray(raw.users))raw.users=[]; return raw;}
export async function transact<T>(fn:(state:State)=>T|Promise<T>):Promise<T>{
 const work=queue.then(async()=>{
  const state=await loadState();
  const out=await fn(state);
  const tmp=path.join(path.dirname(dbFile),`.state-${randomUUID()}.tmp`);
  await fs.writeFile(tmp,JSON.stringify(state,null,2),"utf8");
  try{await fs.rename(tmp,dbFile)}catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});throw e}
  return out;
 });
 queue=work.then(()=>undefined,()=>undefined);
 return work;
}
export const problem=(message:string,status=400)=>Response.json({error:message},{status});
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
 }
 if(entity==="tasks"){
  if(!required(value.title))return "Informe a descrição da atividade.";
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
  if(!["Administrador","Gestor","Analista","Consultor","Visualizador"].includes(String(value.role)))return "Selecione um perfil válido.";
  if(existing.some(x=>x.id!==id&&(x as unknown as {email:string}).email.toLowerCase()===String(value.email).trim().toLowerCase()))return "O e-mail já está cadastrado.";
 }
 if(entity==="staff"){
  if(!required(value.name))return "Informe o nome do profissional.";
  if(existing.some(x=>x.id!==id&&(x as unknown as {name:string}).name.toLowerCase()===String(value.name).trim().toLowerCase()))return "Este profissional já está cadastrado.";
  if(value.capacity!==undefined&&(!Number.isFinite(Number(value.capacity))||Number(value.capacity)<0))return "A capacidade não pode ser negativa.";
 }
 return null;
}
export function audit(s:State,entity:string,operation:string,recordId:string,label:string){s.audit.unshift({id:randomUUID(),at:new Date().toISOString(),entity,operation,recordId,label});s.audit=s.audit.slice(0,1000);}
export const newid=()=>randomUUID();
