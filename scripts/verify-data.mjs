import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('../data/state.json', import.meta.url), 'utf8'));
const entities=['clients','projects','tasks','appointments','staff'];
for(const name of entities){if(!Array.isArray(data[name]))throw new Error(`Colecao ausente: ${name}`)}
const clientIds=new Set(data.clients.map(c=>c.id));
const projectIds=new Set(data.projects.map(p=>p.id));
const unique=(rows,name)=>{
 const ids=rows.map(r=>r.id);
 if(ids.length!==new Set(ids).size)throw new Error(`IDs duplicados em ${name}`);
 if(ids.some(id=>!id))throw new Error(`ID vazio em ${name}`);
};
for(const name of entities)unique(data[name],name);
if(!data.projects.every(p=>clientIds.has(p.clientId)))throw new Error('Projeto sem cliente vinculado');
if(!data.tasks.every(t=>projectIds.has(t.projectId)&&clientIds.has(t.clientId)))throw new Error('Atividade sem vinculo valido');
if(!data.appointments.every(a=>projectIds.has(a.projectId)&&clientIds.has(a.clientId)))throw new Error('Agendamento sem vinculo valido');
for(const t of data.tasks){
 const p=data.projects.find(p=>p.id===t.projectId);
 if(p.clientId!==t.clientId)throw new Error(`Vinculo cruzado inconsistente em ${t.id}`);
}
for(const a of data.appointments){
 const p=data.projects.find(p=>p.id===a.projectId);
 if(p.clientId!==a.clientId)throw new Error(`Vinculo cruzado inconsistente em ${a.id}`);
}
console.log('Integridade:',Object.fromEntries(entities.map(name=>[name,data[name].length])));
console.log('OK: dados e relacionamentos inteiros. Novos cadastros sao aceitos.');
