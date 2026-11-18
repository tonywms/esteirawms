// V11 · Status report para o cliente.
//  mode "pdf"  → devolve o relatório-base (base64) + links temporários dos PDFs assinados; o navegador junta tudo.
//                (assim o download não esbarra no limite de 4,5 MB de resposta da Vercel)
//  mode "send" → o servidor junta relatório + PDFs assinados, envia por e-mail e registra na linha do tempo.
import { audit, loadState, problem, transact } from "@/lib/storage";
import { buildStatusReportBase } from "@/lib/status-report-pdf";
import { assembleReport } from "@/lib/status-report";
import { clean } from "@/lib/escalation-pdf";
import { mailFrom, mailProvider, sendMail } from "@/lib/mailer";
import { currentUser } from "@/lib/master";
import { sbDocSignedUrl, supabaseConfigured } from "@/lib/supabase-store";
import { PHASES, phaseIndex, phaseOf } from "@/lib/flow";
import type { State } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { projectId?: string; mode?: "pdf" | "send"; summary?: string; kinds?: string[]; since?: string | null; exclude?: string[]; annex?: boolean; to?: string; cc?: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const list = (v?: string) => [...new Set((v || "").split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const MAX_MAIL = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as Body;
  if (!b.projectId) return problem("Projeto inválido.");
  const s = await loadState();
  const p = s.projects.find(x => x.id === b.projectId);
  if (!p) return problem("Projeto não encontrado.", 404);
  const client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
  const who = await currentUser();
  const annex = b.annex !== false && supabaseConfigured();
  const input = { summary: (b.summary || "").trim(), kinds: b.kinds, since: b.since || null, exclude: b.exclude, annex, requester: who.name };
  const { bytes, annexes } = await buildStatusReportBase(s, p, input);
  const footer = clean(`WMS Expert · Status report · ${client} · emitido em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  const filename = `status-report-${slug(client)}-${new Date().toISOString().slice(0, 10)}.pdf`;

  if (b.mode !== "send") {
    const links = await Promise.all(annexes.map(a => sbDocSignedUrl(p.id, a.phase, a.path).catch(() => null)));
    return Response.json({ pdf: Buffer.from(bytes).toString("base64"), annexes: links, footer, filename });
  }

  const to = list(b.to), cc = list(b.cc);
  const bad = [...to, ...cc].filter(x => !EMAIL.test(x));
  if (!to.length) return problem("Informe o e-mail do cliente.");
  if (bad.length) return problem(`E-mail inválido: ${bad.join(", ")}`);
  if (to.length + cc.length > 15) return problem("Máximo de 15 destinatários por envio.");
  if (!mailProvider()) return problem("O envio de e-mail ainda não foi configurado. Baixe o PDF e envie manualmente.");
  const files = await Promise.all(annexes.map(async a => {
    try { const url = await sbDocSignedUrl(p.id, a.phase, a.path); const r = await fetch(url, { cache: "no-store" }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; }
  }));
  const pdf = Buffer.from(await assembleReport(bytes, annexes.length, files, footer));
  if (pdf.length > MAX_MAIL) return problem(`O relatório com os anexos ficou com ${(pdf.length / 1048576).toFixed(1)} MB, acima do limite de e-mail. Desmarque "Anexar PDFs assinados" ou envie o link do download.`);

  const k = phaseOf(p), stage = PHASES[phaseIndex(k)].label;
  const html = `<!doctype html><html><body style="margin:0;background:#eef3f7;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e6edf2"><img src="${new URL(req.url).origin}/wms-expert-logo-azul.png" alt="WMS Expert" height="30" style="display:block;height:30px"></td></tr>
<tr><td style="background:#0b1f33;padding:26px 28px;border-bottom:4px solid #10c1fc">
<div style="color:#10c1fc;font-size:11px;font-weight:800;letter-spacing:.14em">STATUS REPORT DO PROJETO</div>
<div style="color:#fff;font-size:26px;font-weight:800;margin-top:6px">${esc(client)}</div>
<div style="color:#bfdbee;font-size:13px;margin-top:6px">${esc(p.system)} · Etapa atual: ${esc(stage)}</div></td></tr>
${input.summary ? `<tr><td style="padding:24px 28px 4px"><div style="padding:14px 16px;background:#f4f8fb;border-left:4px solid #10c1fc;border-radius:10px;color:#13263a;font-size:14.5px;line-height:1.55;white-space:pre-wrap">${esc(input.summary)}</div></td></tr>` : ""}
<tr><td style="padding:20px 28px 26px;color:#46596b;font-size:13.5px;line-height:1.55">Segue em anexo o status report com o andamento por etapa, os próximos passos, o histórico do projeto${annexes.length ? ` e os ${annexes.length} documento(s) assinado(s)` : ""}.<br><br>Qualquer dúvida, basta responder este e-mail.<br><br><b>${esc(who.name)}</b><br>WMS Expert</td></tr>
</table></td></tr></table></body></html>`;
  try {
    await sendMail({ to, cc: cc.length ? cc : undefined, replyTo: who.email || undefined, subject: `Status report · ${client} · ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, html, text: `Status report - ${client}\n\n${input.summary}\n\nRelatório completo em anexo.\n\n${who.name}\nWMS Expert`, attachments: [{ filename, content: pdf, contentType: "application/pdf" }] });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha no envio do e-mail.", 502); }

  const now = new Date().toISOString();
  await transact((st: State) => {
    const pp = st.projects.find(x => x.id === p.id); if (!pp) return;
    const text = `Status report enviado ao cliente (${to.join(", ")}${cc.length ? `; cópia: ${cc.join(", ")}` : ""}) com ${annexes.length} documento(s) assinado(s) anexado(s)`;
    pp.timeline = [{ id: crypto.randomUUID(), at: now, kind: "report", author: who.name, text }, ...(pp.timeline || [])];
    pp.updatedAt = now;
    audit(st, "projects", "status report enviado", pp.id, `${client} -> ${to.join(", ")}`);
  });
  return Response.json({ ok: true, message: `Status report enviado para ${to.length + cc.length} destinatário(s)`, from: mailFrom() });
}
