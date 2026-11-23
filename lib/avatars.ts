// V18.1 · Foto do consultor pelo nome (qualquer parte do nome serve: "Félix", "José Eduardo Félix"...).
// V26 · Fotos enviadas pelo app (Usuários / Equipe) valem para qualquer tela onde o nome aparece:
//       primeiro pelo nome completo; depois pelo primeiro nome, se ele for único entre as fotos enviadas.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const KEYS: [RegExp, string][] = [
  [/\bnadson\b/, "nadson"],
  [/\bgiovann?i\b/, "giovani"],
  [/\bfelix\b|\bjose eduardo\b/, "felix"],
  [/\brobson\b/, "robson"],
  [/\bcarlos\b/, "carlos"],
  [/\bwever(ton)?\b/, "weverton"],
];
export type AvatarEntry = { key: string; name: string; v: string };

let dyn: { key: string; full: string; first: string; v: string }[] = [];
let firstCount = new Map<string, number>();
let sig = "";
/** Recebe a lista de fotos enviadas (vem junto com /api/state). */
export function registerAvatars(list?: AvatarEntry[] | null) {
  if (!Array.isArray(list)) return;
  const s = list.map(a => `${a.key}:${a.v}`).join("|"); if (s === sig) return; sig = s;
  dyn = list.map(a => { const full = norm(a.name); return { key: a.key, full, first: full.split(" ")[0] || "", v: a.v }; });
  firstCount = new Map(); for (const d of dyn) firstCount.set(d.first, (firstCount.get(d.first) || 0) + 1);
}
function dynFor(n: string) {
  if (!n || !dyn.length) return null;
  const exact = dyn.find(d => d.full === n); if (exact) return exact;
  const words = n.split(" ");
  // "Denilson" → "Denilson Maia"; "Robson Pereira" → "Robson"
  const byFirst = dyn.find(d => d.first.length >= 3 && firstCount.get(d.first) === 1 && words[0] === d.first);
  return byFirst || null;
}
export function avatarKey(name?: string | null) {
  const n = norm(name || "");
  const d = dynFor(n); if (d) return d.key;
  return KEYS.find(([re]) => re.test(n))?.[1] || null;
}
export const avatarUrl = (name?: string | null) => {
  const n = norm(name || ""); const d = dynFor(n);
  if (d) return `/api/avatar/${d.key}?v=${d.v}`;
  const k = KEYS.find(([re]) => re.test(n))?.[1];
  return k ? `/api/avatar/${k}` : null;
};
export const initials = (name: string) => name.split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";
