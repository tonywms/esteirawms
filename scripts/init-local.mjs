import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const path = resolve("data/state.json");
if (existsSync(path)) { console.log("[OK] Base existente preservada."); process.exit(0); }
const state = { version: 1, importedAt: "", sourceFile: "", clients: [], projects: [], tasks: [], appointments: [], staff: [], users: [], audit: [] };
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(state, null, 2), { flag: "wx" });
console.log("[OK] Base local vazia criada. Nenhum dado de cliente foi incluido.");
