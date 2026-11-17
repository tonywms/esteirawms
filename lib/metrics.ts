import type { Project,Task,Appointment,State } from "./types";
export const isDone = (status:string)=> /conclu[ií]d|finalizad|cancelad/i.test(status);
export const isBlocked = (status:string)=>/travado|atrasad|bloquead/i.test(status);
export const todayISO = ()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Fortaleza"});
export const dueState=(task:Task, today=todayISO())=>{
 if(isDone(task.status)) return "Concluída";
 if(!task.dueDate) return "Sem prazo";
 if(task.dueDate<today) return "Atrasada";
 if(task.dueDate===today) return "Vence hoje";
 return "No prazo";
};
export function summary(state:State){
 const statuses=Object.entries(state.projects.reduce<Record<string,number>>((a,p)=>(a[p.status]=(a[p.status]||0)+1,a),{}));
 return {clients:state.clients.length,projects:state.projects.length,active:state.projects.filter(p=>!isDone(p.status)).length,blocked:state.projects.filter(p=>isBlocked(p.status)).length,integration:state.projects.filter(p=>p.status==="Pendente de Integração").length,implementation:state.projects.filter(p=>p.status==="Pendente de Implantação").length,closing:state.projects.filter(p=>p.status==="Pendente de Finalização").length,finished:state.projects.filter(p=>p.status==="Concluído").length,progress:state.projects.length?Math.round(state.projects.reduce((n,p)=>n+p.progress,0)/state.projects.length):0,overdue:state.tasks.filter(t=>dueState(t)==="Atrasada").length,withoutDue:state.tasks.filter(t=>!t.dueDate&&!isDone(t.status)).length,statuses};
}
export const fmtDate=(value?:string|null)=>value?new Date(value+"T12:00:00").toLocaleDateString("pt-BR",{timeZone:"UTC"}):"Não informado";
export const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase();
export const asLocalDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
export const weekStart=(d:Date)=>{const x=new Date(d);const day=x.getDay();x.setDate(x.getDate()+(day===0?-6:1-day));x.setHours(12,0,0,0);return x};
export const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
export const weeklySlots=(apps:Appointment[],consultant:string,week:Date)=>apps.filter(a=>a.consultant===consultant && a.status!=="Cancelado" && !!a.date && a.date>=asLocalDate(week) && a.date<=asLocalDate(addDays(week,4))).reduce((sum,a)=>sum+(a.shift==="Dia Inteiro"?2:1),0);
export const projectOwner=(p:Project)=>p.implementationOwner||p.integrationOwner||"Não definido";
