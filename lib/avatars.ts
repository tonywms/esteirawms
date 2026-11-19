// V18.1 · Foto do consultor pelo nome (qualquer parte do nome serve: "Félix", "José Eduardo Félix"...).
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const KEYS: [RegExp, string][] = [
  [/\bnadson\b/, "nadson"],
  [/\bgiovann?i\b/, "giovani"],
  [/\bfelix\b|\bjose eduardo\b/, "felix"],
  [/\brobson\b/, "robson"],
  [/\bcarlos\b/, "carlos"],
  [/\bwever(ton)?\b/, "weverton"],
];
export function avatarKey(name?: string | null) {
  const n = norm(name || "");
  return KEYS.find(([re]) => re.test(n))?.[1] || null;
}
export const avatarUrl = (name?: string | null) => { const k = avatarKey(name); return k ? `/api/avatar/${k}` : null; };
export const initials = (name: string) => name.split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";
