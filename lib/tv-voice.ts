// V43 · Voz da TV (Chrome · Web Speech API). Fala em português do Brasil com voz feminina, uma frase de cada vez,
// e só resolve quando terminou de falar — assim nunca há atropelo. Também toca o "dim-dom" de chamada.
"use client";

let chosen: SpeechSynthesisVoice | null = null;
const FEMALE = /(google portugu[eê]s do brasil|francisca|maria|luciana|vit[oó]ria|thalita|leila|raquel|fernanda|female|feminin)/i;
const MALE = /(daniel|ant[oô]nio|donato|fabio|f[aá]bio|humberto|julio|male\b|masculin)/i;

export function voiceSupported() { return typeof window !== "undefined" && "speechSynthesis" in window; }
function voices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(res => {
    const v = speechSynthesis.getVoices(); if (v.length) return res(v);
    const t = setTimeout(() => res(speechSynthesis.getVoices()), 1500);
    speechSynthesis.addEventListener("voiceschanged", () => { clearTimeout(t); res(speechSynthesis.getVoices()); }, { once: true });
  });
}
export async function pickVoice(): Promise<SpeechSynthesisVoice | null> {
  if (chosen) return chosen;
  const all = await voices();
  const pt = all.filter(v => /^pt[-_]BR/i.test(v.lang)), pt2 = pt.length ? pt : all.filter(v => /^pt/i.test(v.lang));
  chosen = pt2.find(v => FEMALE.test(v.name) && !MALE.test(v.name)) || pt2.find(v => !MALE.test(v.name)) || pt2[0] || null;
  return chosen;
}
export async function voiceName() { return (await pickVoice())?.name || ""; }

export type SpeakResult = "ok" | "blocked" | "off";
/** Fala um texto (quebrado em frases curtas por causa de um limite do Chrome) e espera terminar. */
export async function speak(text: string, opts: { rate?: number; signal?: { cancelled: boolean } } = {}): Promise<SpeakResult> {
  if (!voiceSupported()) return "off";
  const v = await pickVoice();
  const parts = text.split(/(?<=[.!?;:])\s+/).map(x => x.trim()).filter(Boolean);
  speechSynthesis.cancel();
  for (const part of parts) {
    if (opts.signal?.cancelled) return "ok";
    const r = await new Promise<SpeakResult | "error">(res => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = v?.lang || "pt-BR"; if (v) u.voice = v; u.rate = opts.rate ?? 1.75; u.pitch = 1.05; u.volume = 1;
      let done = false; const fin = (x: SpeakResult | "error") => { if (done) return; done = true; clearTimeout(safety); clearInterval(keep); res(x); };
      // segurança: o Chrome às vezes não avisa o fim da fala
      const safety = setTimeout(() => fin("ok"), 2500 + part.length * 120);
      const keep = setInterval(() => { if (speechSynthesis.paused) speechSynthesis.resume(); }, 4000);
      u.onend = () => fin("ok");
      u.onerror = e => fin(e.error === "not-allowed" ? "blocked" : e.error === "interrupted" || e.error === "canceled" ? "ok" : "error");
      speechSynthesis.speak(u);
    });
    if (r === "blocked") return "blocked";
    await new Promise(r2 => setTimeout(r2, 280)); // respiro entre as frases
  }
  return "ok";
}
export function stopSpeaking() { if (voiceSupported()) speechSynthesis.cancel(); }

let ctx: AudioContext | null = null;
/** "Dim-dom" de chamada (duas notas suaves). Retorna false se o navegador ainda não liberou o som. */
export async function chime(): Promise<boolean> {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (!AC) return false;
    ctx = ctx || new AC(); if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    if (ctx.state !== "running") return false;
    const t0 = ctx.currentTime;
    [[659.25, 0], [523.25, 0.55]].forEach(([f, d]) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ctx!.destination);
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.1);
      o.start(t0 + d); o.stop(t0 + d + 1.15);
    });
    await new Promise(r => setTimeout(r, 1500));
    return true;
  } catch { return false; }
}
/** Chamado num clique/tecla: libera som e voz nesta aba. */
export function unlockAudio() {
  try { const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; ctx = ctx || new AC(); void ctx.resume(); } catch {}
  if (voiceSupported()) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }
}
