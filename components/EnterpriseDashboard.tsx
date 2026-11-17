"use client";
import {useMemo, type ReactNode} from "react";
import {
 Activity, AlertCircle, AlertTriangle, ArrowRight, ArrowUpRight, CalendarCheck2, CalendarDays,
 Check, CheckCircle2, ChevronRight, CircleDot, Clock3, Download, FileText, Flag, GitBranch,
 Layers3, ListChecks, Plus, Rocket, ShieldCheck, Target, TrendingUp, Users, Workflow
} from "lucide-react";
import {Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import type {Client, Project, State, Task} from "@/lib/types";
import {dueState, fmtDate, initials, isBlocked, isDone, projectOwner, summary} from "@/lib/metrics";

type Filters={clientId:string;projectId:string;owner:string;period:string};
type Props={data:State;filters:Filters;onNavigate:(href:string)=>void;onTask:(task:Task)=>void;onNewTask:()=>void;onExport:()=>void};
const SEA=["#07c7d4","#35d3a5","#56a8f7","#f4b45d","#ea6b80"];
const pipeline=[
 {status:"Pendente de Integração",label:"Integração",color:"integration"},
 {status:"Pendente de Implantação",label:"Implantação",color:"implementation"},
 {status:"Travado/Ajustes",label:"Ajustes",color:"adjustments"},
 {status:"Pendente de Finalização",label:"Finalização",color:"finalization"},
 {status:"Concluído",label:"Concluído",color:"complete"},
];
function CircleIcon({children,tone="cyan"}:{children:ReactNode;tone?:string}){return <span className={`ent-circle-icon ${tone}`}>{children}</span>}
function DashboardPanel({title,icon:Icon,action,children,extraClass=""}:{title:string;icon:typeof Users;action?:ReactNode;children:ReactNode;extraClass?:string}){return <section className={`ent-panel ${extraClass}`}><div className="ent-panel-head"><h2><Icon size={18} strokeWidth={2.1}/>{title}</h2>{action}</div>{children}</section>}
function MiniSpark({tone="cyan",id="a"}:{tone?:string;id?:string}){const col=tone==="red"?"#fb7688":"#04c4ce";return <svg viewBox="0 0 124 56" className="ent-spark" role="img" aria-label="Ilustração decorativa; não representa série histórica"><defs><linearGradient id={`spark-${tone}-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".24"/><stop offset="1" stopColor={col} stopOpacity="0"/></linearGradient></defs><path d="M2 44 L20 43 L36 27 L51 34 L69 18 L83 26 L101 10 L122 13 L122 56 L2 56Z" fill={`url(#spark-${tone}-${id})`}/><path d="M2 44 L20 43 L36 27 L51 34 L69 18 L83 26 L101 10 L122 13" stroke={col} strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function PanelLink({children,onClick}:{children:ReactNode;onClick:()=>void}){return <button className="ent-panel-link" onClick={onClick}>{children}<ArrowRight size={15}/></button>}
export default function EnterpriseDashboard({data,filters,onNavigate,onTask,onNewTask,onExport}:Props){
 const subset=useMemo(()=>{
  const projects=data.projects.filter(p=>(!filters.clientId||p.clientId===filters.clientId)&&(!filters.projectId||p.id===filters.projectId)&&(!filters.owner||[p.integrationOwner,p.implementationOwner,p.team].some(x=>x.toLowerCase().includes(filters.owner.toLowerCase()))));
  const projectIds=new Set(projects.map(p=>p.id));
  const clients=data.clients.filter(c=>(!filters.clientId||c.id===filters.clientId)&&(!filters.projectId||projects.some(p=>p.clientId===c.id))&&(!filters.owner||projects.some(p=>p.clientId===c.id)));
  const tasks=data.tasks.filter(t=>projectIds.has(t.projectId)&&(!filters.owner||t.owner.toLowerCase().includes(filters.owner.toLowerCase())||projects.find(p=>p.id===t.projectId)?.integrationOwner?.toLowerCase().includes(filters.owner.toLowerCase())||projects.find(p=>p.id===t.projectId)?.implementationOwner?.toLowerCase().includes(filters.owner.toLowerCase())));
  return {projects,clients,tasks,projectIds};
 },[data,filters.clientId,filters.projectId,filters.owner]);
 const base=useMemo(()=>({...data,projects:subset.projects,clients:subset.clients,tasks:subset.tasks}),[data,subset]);
 const m=useMemo(()=>summary(base),[base]);
 const today=useMemo(()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Fortaleza"}),[]);
 const days=filters.period==="30"?30:filters.period==="90"?90:0;
 const from=useMemo(()=>{if(!days)return "";const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`},[days,today]);
 const dateTasks=subset.tasks.filter(t=>!days||[t.startDate,t.dueDate,t.updatedAt?.slice(0,10)].some(d=>Boolean(d&&d>=from&&d<=today)));
 const overdue=dateTasks.filter(t=>dueState(t,today)==="Atrasada").length;
 const withDue=dateTasks.filter(t=>!!t.dueDate).length;
 const meetingCompliance=withDue?Math.round((dateTasks.filter(t=>t.dueDate&&dueState(t,today)!=="Atrasada").length/withDue)*100):null;
 const risk=subset.projects.filter(p=>isBlocked(p.status)||Boolean(p.blocker)).sort((a,b)=>Number(isBlocked(b.status))-Number(isBlocked(a.status))).slice(0,3);
 const urgents=dateTasks.filter(t=>!isDone(t.status)).sort((a,b)=>{
   const sa=dueState(a,today)==="Atrasada"?0:dueState(a,today)==="Vence hoje"?1:2;
   const sb=dueState(b,today)==="Atrasada"?0:dueState(b,today)==="Vence hoje"?1:2;
   return sa-sb||(a.dueDate||"9999").localeCompare(b.dueDate||"9999");
 }).slice(0,4);
 const pendingImpl=subset.projects.filter(p=>p.status==="Pendente de Implantação").length;
 const groupStatus=pipeline.map((p,i)=>({name:p.label,status:p.status,value:subset.projects.filter(x=>x.status===p.status).length,color:SEA[i]}));
 const totalForPie=groupStatus.filter(s=>s.value>0);
 const waves=["Onda 1","Onda 2","Onda 3","Congelado","Concluído"].map(w=>({name:w.replace("Onda ","Onda "),value:subset.projects.filter(p=>p.wave===w).length}));
 const chartData=waves.map(w=>({...w,total:w.value}));
 const readiness=[
  {name:"Conectividade",icon:Workflow,key:"connectivity" as const},
  {name:"Coletores",icon:Layers3,key:"collectors" as const},
  {name:"Base de testes",icon:ShieldCheck,key:"testBase" as const},
  {name:"Usuário-chave",icon:Users,key:"keyUser" as const},
 ].map(item=>({...item,yes:subset.projects.filter(p=>p.readiness?.[item.key]==="Sim").length,total:subset.projects.length}));
 const recent=data.audit.filter(a=>!days||a.at.slice(0,10)>=from).filter(a=>{
  if(!filters.clientId&&!filters.projectId&&!filters.owner)return true;
  if(a.entity==="clients")return subset.clients.some(c=>c.id===a.recordId);
  if(a.entity==="projects")return subset.projectIds.has(a.recordId);
  if(a.entity==="tasks")return subset.tasks.some(t=>t.id===a.recordId);
  if(a.entity==="appointments")return data.appointments.some(t=>t.id===a.recordId&&subset.projectIds.has(t.projectId));
  return false;
 }).slice(-4).reverse();
 const selectedClients=subset.clients.map(c=>({...c,project:subset.projects.find(p=>p.clientId===c.id)})).sort((a,b)=>Number(Boolean(b.project?.blocker))-Number(Boolean(a.project?.blocker))).slice(0,5);
 const clearFilters=!!(filters.clientId||filters.projectId||filters.owner||days);
 return <div className="ent-dashboard">
  <section className="ent-hero">
   <div className="ent-hero-copy"><div className="ent-eyebrow"><span/> WMS EXPERT · GESTÃO DE ENTREGAS</div><h1>Esteira de <span>Entregas</span></h1><p>Desenvolvimento, integrações, implantações e agendas de clientes em uma única gestão executiva.</p><div className="ent-data-integrity"><CircleDot size={13}/> Dados reais da sua esteira de projetos</div></div>
   <div className="ent-hero-actions"><button className="ent-btn ent-btn-quiet" onClick={onExport}><Download size={16}/> Exportar dados</button><button className="ent-btn ent-btn-outline" onClick={()=>onNavigate("/relatorios")}><FileText size={16}/> Relatório executivo</button><button className="ent-btn ent-btn-accent" onClick={onNewTask}><Plus size={17}/> Nova atividade</button></div>
  </section>
  {clearFilters&&<div className="ent-context"><CircleDot size={14}/><span>Visão filtrada: <strong>{subset.clients.length} clientes</strong>, <strong>{subset.projects.length} projetos</strong> e <strong>{dateTasks.length} atividades no período</strong>. Os projetos exibem o estado atual; o período limita atividades e auditoria.</span></div>}
  <section className="ent-kpis" aria-label="Indicadores executivos">
   {[
    {label:"Clientes",value:subset.clients.length,detail:`${subset.clients.filter(c=>c.system==="Web SaaS").length} Web SaaS · ${subset.clients.filter(c=>c.system==="Legacy").length} Legacy`,icon:Users,tone:"cyan"},
    {label:"Projetos ativos",value:subset.projects.filter(p=>!isDone(p.status)).length,detail:`${subset.projects.filter(p=>isDone(p.status)).length} concluído(s)`,icon:Layers3,tone:"cyan"},
    {label:"Atividades em atraso",value:overdue,detail:`${dateTasks.filter(t=>!t.dueDate&&!isDone(t.status)).length} sem prazo`,icon:AlertTriangle,tone:"red"},
    {label:"Aguardando implantação",value:pendingImpl,detail:`${subset.projects.filter(p=>isBlocked(p.status)).length} projeto(s) em ajustes`,icon:Rocket,tone:"cyan"},
    {label:"Prazos controlados",value:meetingCompliance===null?"—":`${meetingCompliance}%`,detail:withDue?`${withDue} atividade(s) com prazo`:"Sem atividades com prazo",icon:ShieldCheck,tone:"cyan"},
   ].map((item,i)=>{const Icon=item.icon;return <article className={`ent-kpi ${item.tone}`} key={item.label}><div className="ent-kpi-title"><Icon size={19} strokeWidth={2}/><span>{item.label}</span></div><div className="ent-kpi-lower"><div className="ent-kpi-copy"><strong>{item.value}</strong><span>{item.detail}</span></div>{i===4&&meetingCompliance!==null?<div className="ent-gauge" style={{background:`conic-gradient(#09b9be ${meetingCompliance}%,#e6edf2 ${meetingCompliance}%)`}}><div>{meetingCompliance}%</div></div>:<MiniSpark tone={item.tone} id={String(i)}/>}</div></article>})}
  </section>
  <div className="ent-analytics-grid">
   <DashboardPanel title="Distribuição das entregas por onda" icon={TrendingUp} extraClass="ent-analytics-main" action={<span className="ent-mini-hint">Distribuição atual · não é série histórica</span>}><div className="ent-area-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:15,right:14,left:-18,bottom:2}}><defs><linearGradient id="towerArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#07c6d2" stopOpacity=".35"/><stop offset="100%" stopColor="#07c6d2" stopOpacity=".02"/></linearGradient></defs><CartesianGrid stroke="#e7edf2" vertical={false}/><XAxis dataKey="name" tick={{fill:"#74879c",fontSize:11}} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} tick={{fill:"#8395a7",fontSize:11}} tickLine={false} axisLine={false}/><Tooltip formatter={(value)=>[String(value),"Projetos"]} contentStyle={{border:"1px solid #dfeaf1",borderRadius:12,fontSize:12}}/><Area type="monotone" dataKey="total" name="Projetos" stroke="#04b5c7" fill="url(#towerArea)" strokeWidth={3} dot={{stroke:"#00adbd",strokeWidth:2,fill:"#fff",r:4}} activeDot={{r:6}}/></AreaChart></ResponsiveContainer></div></DashboardPanel>
   <DashboardPanel title="Status da carteira de projetos" icon={Target} extraClass="ent-status-panel"><div className="ent-pie-wrap"><div className="ent-pie"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={totalForPie} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="87%" paddingAngle={2} stroke="none">{totalForPie.map(p=><Cell key={p.name} fill={p.color}/>)}</Pie><Tooltip formatter={(value)=>[String(value),"Projetos"]}/></PieChart></ResponsiveContainer><div className="ent-pie-total"><strong>{subset.projects.length}</strong><span>Projetos</span></div></div><div className="ent-status-legend">{groupStatus.map(row=><button key={row.status} title="Ver projetos" onClick={()=>onNavigate("/projetos")}><i style={{background:row.color}}/><span>{row.name}</span><strong>{row.value}</strong></button>)}</div></div></DashboardPanel>
   <DashboardPanel title="Prontidão para implantação" icon={ShieldCheck} extraClass="ent-readiness-panel"><div className="ent-readiness-bars">{readiness.map(r=>{const Icon=r.icon;const percent=r.total?Math.round((r.yes/r.total)*100):0;return <div className="ent-readiness-row" key={r.key}><div className="ent-ready-label"><Icon size={16}/><span>{r.name}</span></div><div className="ent-bar-bg"><span style={{width:`${percent}%`}}/></div><strong>{r.yes}/{r.total}</strong></div>})}</div><p className="ent-card-note">Projetos com item marcado como “Sim”; ausências não são presumidas como prontas.</p></DashboardPanel>
  </div>
  <div className="ent-operational-grid"><DashboardPanel title="Pipeline da esteira de entregas" icon={Target} extraClass="ent-pipeline-panel" action={<PanelLink onClick={()=>onNavigate("/projetos")}>Ver carteira</PanelLink>}><div className="ent-pipeline">{groupStatus.map((row,i)=><button key={row.status} className={`ent-pipeline-step ${pipeline[i].color}`} title={`Abrir projetos: ${row.name}`} onClick={()=>onNavigate("/projetos")}><span>{row.name}</span><strong>{row.value} {row.value===1?"projeto":"projetos"}</strong>{i===4?<Check size={17}/>:<ChevronRight size={18}/>}</button>)}</div></DashboardPanel><DashboardPanel title="Evolução da carteira" icon={TrendingUp} extraClass="ent-delivery-panel"><div className="ent-delivery"><strong>{m.progress}%</strong><span>Progresso médio informado</span><div className="ent-delivery-track"><i style={{width:`${m.progress}%`}}/></div></div></DashboardPanel></div>
  <div className="ent-bottom-grid">
   <DashboardPanel title="Clientes da esteira" icon={Users} extraClass="ent-clients-panel" action={<PanelLink onClick={()=>onNavigate("/clientes")}>Ver todos</PanelLink>}><div className="ent-table-scroll"><table className="ent-table"><thead><tr><th>Cliente</th><th>Modalidade</th><th>Status atual</th><th>Avanço</th><th>Próximo marco</th></tr></thead><tbody>{selectedClients.map(({project:p,...c})=><tr key={c.id} onClick={()=>onNavigate(`/clientes/${c.id}`)}><td><div className="ent-client-id"><span className="ent-client-avatar">{initials(c.name)}</span><strong>{c.name}</strong></div></td><td><span className={`ent-chip ${c.system==="Web SaaS"?"saas":"legacy"}`}>{c.system}</span></td><td><span className={`ent-chip ${p&&isBlocked(p.status)?"blocked":p&&isDone(p.status)?"completed":"active"}`}>{p?.status||"Sem projeto"}</span></td><td><span className="ent-progress-inline"><i style={{width:`${p?.progress||0}%`}}/>{p?.progress||0}%</span></td><td className="ent-date">{p?.goLiveDate?fmtDate(p.goLiveDate):p?.homologationDate?fmtDate(p.homologationDate):p?.integrationDelivery?fmtDate(p.integrationDelivery):"Sem data"}</td></tr>)}</tbody></table>{!selectedClients.length&&<p className="ent-empty-mini">Nenhum cliente encontrado para os filtros.</p>}</div></DashboardPanel>
   <DashboardPanel title="Movimentações da esteira" icon={Activity} extraClass="ent-events-panel" action={<PanelLink onClick={()=>onNavigate("/relatorios")}>Auditoria</PanelLink>}><div className="ent-timeline">{recent.map((a,i)=><div className="ent-event" key={a.id}><span className="ent-timeline-node"><CircleIcon tone={i%2===0?"cyan":"blue"}><CheckCircle2 size={15}/></CircleIcon></span><div><strong>{a.label||"Registro"}</strong><p>{a.operation} · {a.entity}</p></div><time>{new Date(a.at).toLocaleDateString("pt-BR")}</time></div>)}{!recent.length&&<div className="ent-empty"><Clock3 size={22}/><strong>Sem movimentações registradas</strong><span>Novas alterações nos cadastros aparecerão aqui, com data e operação reais.</span></div>}</div></DashboardPanel>
   <div className="ent-side-stack"><DashboardPanel title="Prioridades" icon={Flag} extraClass="ent-priority-panel" action={<span className="ent-count cyan">{urgents.length}</span>}><div className="ent-priorities">{urgents.map((t,i)=><button key={t.id} onClick={()=>onTask(t)}><span className="ent-priority-index">{i+1}</span><span className="ent-priority-text"><strong title={t.title}>{t.title}</strong><small>{data.clients.find(c=>c.id===t.clientId)?.name||"Cliente não informado"} · {t.owner||"Sem responsável"}</small></span><span className={`ent-priority-level ${dueState(t,today)==="Atrasada"?"urgent":"normal"}`}>{dueState(t,today)==="Atrasada"?"Atrasada":t.dueDate?fmtDate(t.dueDate):"Sem prazo"}</span><ChevronRight size={15}/></button>)}{!urgents.length&&<p className="ent-empty-mini">Nenhuma tarefa aberta neste filtro.</p>}</div></DashboardPanel><DashboardPanel title="Gargalos e bloqueios" icon={AlertTriangle} extraClass="ent-bottleneck-panel" action={<span className="ent-count danger">{risk.length}</span>}><div className="ent-bottlenecks">{risk.map(p=><button key={p.id} onClick={()=>onNavigate(`/projetos/${p.id}`)}><span className="ent-risk-dot"/><span><strong>{p.name}</strong><small>{p.blocker||p.status}</small></span><ChevronRight size={15}/></button>)}{!risk.length&&<p className="ent-empty-mini">Nenhum bloqueio registrado.</p>}</div></DashboardPanel><DashboardPanel title="Ações operacionais" icon={ListChecks} extraClass="ent-next-panel"><button className="ent-next-row" onClick={onNewTask}><Plus size={15}/><span>Cadastrar nova atividade e prazo</span><ArrowUpRight size={14}/></button><button className="ent-next-row" onClick={()=>onNavigate("/agenda")}><CalendarCheck2 size={16}/><span>Consultar a agenda de consultores</span><ArrowUpRight size={14}/></button></DashboardPanel></div>
  </div>
  <div className="ent-integrity-foot"><AlertCircle size={15}/><span>Os indicadores refletem o arquivo importado e os registros cadastrados. Não há histórico temporal nem SLA contratual suficientes para inventar tendências ou comparações com períodos anteriores.</span></div>
 </div>;
}
