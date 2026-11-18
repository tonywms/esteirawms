// V9 · Envio de e-mail do app (escalonamentos). Dois provedores, escolhidos pelas variáveis:
//   SMTP (Gmail, Microsoft 365, etc.): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//   Resend (API):                      RESEND_API_KEY
// Remetente: ESTEIRA_EMAIL_FROM (ex.: "WMS Expert Esteira <esteira@wmsexpert.com.br>"); padrão = SMTP_USER.
type Mail = { to: string[]; cc?: string[]; replyTo?: string; subject: string; html: string; text: string; attachments?: { filename: string; content: Buffer; contentType: string }[] };
const env = (k: string) => (process.env[k] || "").trim();

export function mailProvider(): "smtp" | "resend" | null {
  if (env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS")) return "smtp";
  if (env("RESEND_API_KEY")) return "resend";
  return null;
}
export const mailFrom = () => env("ESTEIRA_EMAIL_FROM") || (env("SMTP_USER") ? `WMS Expert Esteira <${env("SMTP_USER")}>` : "WMS Expert Esteira <onboarding@resend.dev>");

export async function sendMail(m: Mail): Promise<string> {
  const provider = mailProvider();
  if (!provider) throw new Error("O envio de e-mail ainda não foi configurado (SMTP ou Resend). Baixe o PDF e envie manualmente, ou peça ao administrador para configurar.");
  if (provider === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mailFrom(), to: m.to, cc: m.cc, reply_to: m.replyTo, subject: m.subject, html: m.html, text: m.text, attachments: (m.attachments || []).map(a => ({ filename: a.filename, content: a.content.toString("base64") })) }),
    });
    const j = await r.json().catch(() => ({})) as { id?: string; message?: string };
    if (!r.ok) throw new Error(`Falha no envio (Resend): ${j.message || r.status}`);
    return j.id || "ok";
  }
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(env("SMTP_PORT") || 587);
  const t = nodemailer.createTransport({ host: env("SMTP_HOST"), port, secure: port === 465, auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") } });
  try {
    const info = await t.sendMail({ from: mailFrom(), to: m.to, cc: m.cc, replyTo: m.replyTo, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments });
    return info.messageId || "ok";
  } catch (e) { throw new Error(`Falha no envio (SMTP): ${e instanceof Error ? e.message : String(e)}`); }
}
