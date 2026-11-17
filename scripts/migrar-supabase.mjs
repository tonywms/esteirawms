// WMS Expert · Esteira V7 · Vincula o app ao Supabase e migra data/state.json.
// Uso: node scripts/migrar-supabase.mjs --claim        (registra a chave do app no banco, 1a vez)
//      node scripts/migrar-supabase.mjs --migrar       (envia data/state.json; SUBSTITUI a base online)
// Lê SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e ESTEIRA_DB_CHAVE do .env.local.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
for (const k of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "ESTEIRA_DB_CHAVE"]) if (!process.env[k]) { console.error(`[ERRO] ${k} ausente no .env.local`); process.exit(2); }

if (process.argv.includes("--claim")) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/esteira_claim`, { method: "POST", headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_key: process.env.ESTEIRA_DB_CHAVE }) });
  const ok = r.ok && (await r.json()) === true;
  if (!ok) { console.error("[ERRO] O banco ja esta vinculado a outra chave (ESTEIRA_DB_CHAVE). Use a chave original do .env.local."); process.exit(3); }
  console.log("[OK] Chave do aplicativo vinculada ao Supabase.");
  process.exit(0);
}
async function loadStore() {
  const src = readFileSync(resolve(root, "lib", "supabase-store.ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tmp = resolve(root, `.migrar-${Date.now()}.mjs`);
  writeFileSync(tmp, js);
  try { return await import(pathToFileURL(tmp).href); } finally { rmSync(tmp, { force: true }); }
}
// Cria/atualiza o Administrador (ADMIN_NOME, ADMIN_EMAIL, ADMIN_SENHA vindos do ambiente)
if (process.argv.includes("--admin")) {
  const { sbLoad, sbSaveDiff, sbSetPassword } = await loadStore();
  const nome = (process.env.ADMIN_NOME || "").trim(), email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase(), senha = process.env.ADMIN_SENHA || "";
  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || senha.length < 8) { console.error("[ERRO] Informe nome, e-mail valido e senha com 8+ caracteres."); process.exit(2); }
  const before = await sbLoad(), after = structuredClone(before), now = new Date().toISOString();
  let u = after.users.find(x => (x.email || "").toLowerCase() === email);
  if (u) Object.assign(u, { name: nome, role: "Administrador", active: true, updatedAt: now });
  else { u = { id: crypto.randomUUID(), name: nome, email, role: "Administrador", active: true, notes: "Criado pelo instalador", createdAt: now, updatedAt: now }; after.users.push(u); }
  await sbSaveDiff(before, after);
  await sbSetPassword(u.id, senha);
  console.log(`[OK] Administrador pronto: ${email}`);
  process.exit(0);
}
if (process.argv.includes("--migrar")) {
  const src = readFileSync(resolve(root, "lib", "supabase-store.ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tmp = resolve(root, `.migrar-${Date.now()}.mjs`);
  writeFileSync(tmp, js);
  try {
    const { sbReplace, sbLoad } = await import(pathToFileURL(tmp).href);
    const state = JSON.parse(readFileSync(resolve(root, "data", "state.json"), "utf8"));
    for (const k of ["clients", "projects", "tasks", "appointments", "staff", "users", "audit"]) if (!Array.isArray(state[k])) state[k] = [];
    const r = await sbReplace(state);
    const check = await sbLoad();
    console.log(`[OK] Migrado para o Supabase: ${check.clients.length} clientes, ${check.projects.length} projetos, ${check.tasks.length} atividades, ${check.appointments.length} agendamentos, ${check.staff.length} profissionais (${r.written} linhas).`);
    if (check.clients.length !== state.clients.length || check.projects.length !== state.projects.length) { console.error("[ERRO] Contagem divergente apos a migracao."); process.exit(4); }
  } finally { rmSync(tmp, { force: true }); }
  process.exit(0);
}
console.log("Use --claim ou --migrar");
