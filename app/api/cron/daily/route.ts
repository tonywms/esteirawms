// V24 · Rotina automática das 7h (Vercel Cron → GET com "Authorization: Bearer CRON_SECRET").
//  GET  (cron)                 → foto do dia + alertas diários (seg–sex) + resumo semanal (segunda)
//  GET  ?status=1  (master)    → últimas execuções e configuração
//  POST {modo, enviar} (master)→ roda manualmente "diario" | "semanal"; enviar=false só pré-visualiza
import { timingSafeEqual } from "node:crypto";
import { audit, loadState, transact } from "@/lib/storage";
import { authEnabled } from "@/lib/auth";
import { currentUser, isMasterEmail } from "@/lib/master";
import { recordSnapshot, loadSnapshots, todaySP } from "@/lib/evolucao-store";
import { buildDaily, buildWeekly, weekdaySP, type Mail } from "@/lib/routines";
import { mailProvider, sendMail } from "@/lib/mailer";
import { logError } from "@/lib/error-log";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Modo = "diario" | "semanal";
const LABEL: Record<Modo, string> = { diario: "rotina diária", semanal: "resumo semanal" };

function cronOk(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!secret || !got) return false;
  const a = Buffer.from(secret), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function masterOk() { const u = await currentUser(); return { u, ok: !authEnabled() || isMasterEmail(u.email) }; }
const appUrl = (req: Request) => (process.env.ESTEIRA_APP_URL || "").trim() || new URL(req.url).origin;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function weekAgoSnaps(today: string) {
  const rows = await loadSnapshots(addDays(today, -14)).catch(() => []);
  const old = rows.filter(r => r.day <= addDays(today, -7));
  return old.length ? old : rows.filter(r => r.day <= addDays(today, -3));
}

async function compose(modo: Modo, req: Request, today: string): Promise<{ mails: Mail[]; info: Record<string, unknown> }> {
  const s = await loadState();
  if (modo === "diario") { const d = buildDaily(s, today, appUrl(req)); return { mails: d.mails, info: { pessoas: d.people, alertas: d.total, semEmail: d.orphans } }; }
  const w = buildWeekly(s, today, appUrl(req), await weekAgoSnaps(today));
  return { mails: w.mail.to.length ? [w.mail] : [], info: w.stats };
}

async function deliver(mails: Mail[]) {
  const sent: string[] = [], failed: { to: string; error: string }[] = [];
  if (!mailProvider()) return { sent, failed: mails.map(m => ({ to: m.to.join(", "), error: "E-mail não configurado (SMTP/Resend)" })) };
  for (const m of mails) {
    try { await sendMail({ to: m.to, subject: m.subject, html: m.html, text: m.text }); sent.push(m.to.join(", ")); }
    catch (e) { failed.push({ to: m.to.join(", "), error: e instanceof Error ? e.message : String(e) }); }
  }
  return { sent, failed };
}

async function record(modo: Modo, origem: string, label: string) {
  await transact(s => { audit(s, "rotinas", `${LABEL[modo]} (${origem})`, todaySP(), label); return null; });
}

async function alreadyRan(modo: Modo, today: string) {
  const s = await loadState();
  return s.audit.some(a => a.entity === "rotinas" && a.recordId === today && a.operation.startsWith(LABEL[modo]) && a.operation.includes("(automática)"));
}

async function run(modo: Modo, req: Request, origem: string, today: string) {
  const { mails, info } = await compose(modo, req, today);
  const r = await deliver(mails);
  const label = `${r.sent.length} e-mail(s) enviados${r.failed.length ? ` · ${r.failed.length} falha(s): ${r.failed.map(f => `${f.to}: ${f.error}`).join(" | ").slice(0, 300)}` : ""} · ${Object.entries(info).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : v}`).join(" · ")}`;
  await record(modo, origem, label);
  if (r.failed.length) await logError({ level: "erro", source: "rotina", action: LABEL[modo], message: `Rotina: ${r.failed.length} e-mail(s) não enviados`, detail: r.failed.map(f => `${f.to}: ${f.error}`).join("\n"), context: null }).catch(() => {});
  return { modo, enviados: r.sent.length, falhas: r.failed, info };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("status")) {
    const m = await masterOk(); if (!m.ok) return Response.json({ error: "Somente o master vê as rotinas." }, { status: 403 });
    const s = await loadState();
    return Response.json({
      hoje: todaySP(), email: mailProvider(), cron: !!(process.env.CRON_SECRET || "").trim(), horario: "07:00 (São Paulo), seg–sex · resumo semanal às segundas",
      execucoes: s.audit.filter(a => a.entity === "rotinas").slice(0, 30),
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!cronOk(req)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const today = todaySP(), wd = weekdaySP(today), out: unknown[] = [];
  try {
    await recordSnapshot(await loadState(), true);
    out.push({ foto: today });
  } catch (e) { await logError({ level: "erro", source: "rotina", action: "foto do dia", message: e instanceof Error ? e.message : String(e), context: null }).catch(() => {}); }
  if (wd >= 1 && wd <= 5) {
    for (const modo of (wd === 1 ? ["diario", "semanal"] : ["diario"]) as Modo[]) {
      if (await alreadyRan(modo, today)) { out.push({ modo, pulado: "já rodou hoje" }); continue; }
      try { out.push(await run(modo, req, "automática", today)); }
      catch (e) { await logError({ level: "erro", source: "rotina", action: LABEL[modo], message: e instanceof Error ? e.message : String(e), context: null }).catch(() => {}); out.push({ modo, erro: String(e) }); }
    }
  } else out.push({ fimDeSemana: true });
  return Response.json({ ok: true, hoje: today, resultado: out });
}

export async function POST(req: Request) {
  const m = await masterOk(); if (!m.ok) return Response.json({ error: "Somente o master pode rodar as rotinas." }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { modo?: string; enviar?: boolean };
  const modo: Modo = b.modo === "semanal" ? "semanal" : "diario";
  const today = todaySP();
  try {
    if (!b.enviar) {
      const { mails, info } = await compose(modo, req, today);
      return Response.json({ modo, preview: true, email: mailProvider(), info, mails: mails.map(x => ({ to: x.to, name: x.name, subject: x.subject, count: x.count, html: x.html })) });
    }
    if (modo === "diario") await recordSnapshot(await loadState(), true);
    const r = await run(modo, req, `manual · ${m.u.name || m.u.email}`, today);
    return Response.json({ ok: true, ...r, message: r.falhas.length ? `${r.enviados} enviado(s), ${r.falhas.length} falha(s)` : `${r.enviados} e-mail(s) enviado(s)` });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Falha ao rodar a rotina." }, { status: 500 }); }
}
