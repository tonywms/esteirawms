// V23 · Cor fixa por consultor (agenda e cards). Os conhecidos têm cor reservada; os demais recebem uma
// cor estável calculada pelo nome (sempre a mesma para a mesma pessoa).
import { avatarKey } from "./avatars";

type Tone = { accent: string; bg: string; bg2: string; ink: string; line: string };
const T: Record<string, Tone> = {
  teal:   { accent: "#0b98b5", bg: "#e2f8fb", bg2: "#eefbf8", ink: "#0b5d70", line: "rgba(11,152,181,.32)" },
  violet: { accent: "#7c5cf0", bg: "#efeaff", bg2: "#f6f2ff", ink: "#4a2fb0", line: "rgba(124,92,240,.32)" },
  amber:  { accent: "#e09412", bg: "#fff3d9", bg2: "#fff9ea", ink: "#7f5200", line: "rgba(224,148,18,.36)" },
  green:  { accent: "#1f9d5c", bg: "#e3f6ea", bg2: "#f0fbf4", ink: "#166239", line: "rgba(31,157,92,.32)" },
  rose:   { accent: "#df4f76", bg: "#fde8ee", bg2: "#fff3f6", ink: "#962046", line: "rgba(223,79,118,.32)" },
  blue:   { accent: "#3a78de", bg: "#e6effd", bg2: "#f2f7ff", ink: "#1d4c97", line: "rgba(58,120,222,.32)" },
  orange: { accent: "#ea6d2f", bg: "#fdebe1", bg2: "#fff5ef", ink: "#8f3810", line: "rgba(234,109,47,.32)" },
  slate:  { accent: "#56738d", bg: "#e9eff4", bg2: "#f4f7fa", ink: "#2e4559", line: "rgba(86,115,141,.32)" },
};
const BY_PERSON: Record<string, keyof typeof T> = { felix: "teal", giovani: "violet", nadson: "amber", robson: "green", carlos: "rose", weverton: "blue" };
const ORDER = ["orange", "slate", "violet", "green", "rose", "blue", "amber", "teal"] as const;

export function consultantTone(name?: string | null): Tone {
  const k = avatarKey(name);
  if (k && BY_PERSON[k]) return T[BY_PERSON[k]];
  const n = (name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return T[ORDER[h % ORDER.length]];
}
/** Variáveis CSS para o card/slot do consultor. */
export const toneVars = (name?: string | null) => { const t = consultantTone(name); return { "--c-accent": t.accent, "--c-bg": t.bg, "--c-bg2": t.bg2, "--c-ink": t.ink, "--c-line": t.line } as React.CSSProperties; };
