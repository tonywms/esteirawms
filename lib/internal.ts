// V39 · Cliente/projeto interno "WMS Expert" (escritório): só para a agenda dos consultores.
// Não tem fases, não entra na esteira, TV, métricas, previsão nem relatórios de projeto.
import type { Client, Project, State } from "./types";

export const INTERNAL_CLIENT_ID = "cli-wms-expert";
export const INTERNAL_PROJECT_ID = "prj-wms-expert-escritorio";
const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const isInternalProject = (p?: Pick<Project, "id" | "wave"> | null) => !!p && (p.id === INTERNAL_PROJECT_ID || norm(p.wave) === "interno");
export const isInternalClient = (c?: Pick<Client, "id"> | null) => !!c && c.id === INTERNAL_CLIENT_ID;

let internal: { clients: Client[]; projects: Project[] } = { clients: [], projects: [] };
/** Separa o interno do resto (as telas de operação recebem só os projetos reais). */
export function splitInternal<T extends State>(s: T): T {
  if (!s || !Array.isArray(s.projects)) return s;
  const ip = s.projects.filter(p => isInternalProject(p)), ids = new Set(ip.map(p => p.clientId));
  const ic = s.clients.filter(c => isInternalClient(c) || (ids.has(c.id) && !s.projects.some(p => p.clientId === c.id && !isInternalProject(p))));
  internal = { clients: ic, projects: ip };
  if (!ip.length && !ic.length) return s;
  return { ...s, projects: s.projects.filter(p => !isInternalProject(p)), clients: s.clients.filter(c => !ic.includes(c)) };
}
export const internalProjects = () => internal.projects;
export const internalName = (clientId: string) => internal.clients.find(c => c.id === clientId)?.name || "";
