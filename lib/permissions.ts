// V7.6 · Parâmetros de acesso por perfil (usado no menu, nas telas e no servidor).
// Fonte única: altere aqui para mudar o que cada perfil vê ou edita.
export type Profile = "Administrador" | "Gestor" | "Analista" | "Consultor" | "Visualizador" | "Painel";
export const PROFILES: Profile[] = ["Administrador", "Gestor", "Analista", "Consultor", "Visualizador", "Painel"];

const ALL = ["/", "/esteira", "/clientes", "/projetos", "/atividades", "/integracoes", "/implantacao", "/agenda", "/equipe", "/relatorios", "/configuracoes", "/usuarios"];
const SEM_ADMIN = ALL.filter(p => p !== "/configuracoes" && p !== "/usuarios"); // Inteligência: somente Relatórios

/** Telas que cada perfil enxerga no menu e pode abrir. */
export const PAGES: Record<Profile, string[]> = {
  Administrador: ALL,
  Gestor: ALL,
  Analista: SEM_ADMIN,
  Visualizador: SEM_ADMIN,
  Consultor: ["/atividades", "/implantacao", "/agenda"],
  Painel: ["/tv"], // só o painel de TV, sem menu e sem edição
};

/** O que cada perfil pode gravar: "*" = criar, editar e excluir; "edit" = só editar. */
const WRITE: Record<Profile, Partial<Record<string, "*" | "edit">>> = {
  Administrador: { clients: "*", projects: "*", tasks: "*", appointments: "*", staff: "*", users: "*" },
  Gestor: { clients: "*", projects: "*", tasks: "*", appointments: "*", staff: "*", users: "*" },
  Analista: { clients: "*", projects: "*", tasks: "*", appointments: "*", staff: "*" },
  Consultor: { tasks: "*", appointments: "*", projects: "edit" },
  Visualizador: {},
  Painel: {},
};

export const asProfile = (v?: string | null): Profile | null => (PROFILES as string[]).includes(String(v)) ? (v as Profile) : null;
const root = (path: string) => "/" + (path.split("?")[0].split("/").filter(Boolean)[0] || "");
export const canSeePath = (p: Profile, path: string) => PAGES[p].includes(root(path));
export const homeFor = (p: Profile) => PAGES[p][0] || "/entrar";
export function canWriteEntity(p: Profile, entity: string, method = "POST") {
  const w = WRITE[p][entity];
  if (!w) return false;
  return w === "*" || method === "PATCH" || method === "PUT";
}
export const canManageUsers = (p: Profile) => p === "Administrador" || p === "Gestor";
export const canImport = canManageUsers;
export const canExport = (p: Profile) => p !== "Consultor" && p !== "Painel";
export const isReadOnly = (p: Profile) => Object.keys(WRITE[p]).length === 0;
