// V9 · Escalonamento: gera o histórico do projeto em PDF (marca WMS Expert) e envia por e-mail
// aos responsáveis cadastrados em Equipe. O envio fica registrado na linha do tempo e na auditoria.
import { audit, loadState, problem, transact } from "@/lib/storage";
import { buildEscalationPdf } from "@/lib/escalation-pdf";
import { mailFrom, mailProvider, sendMail } from "@/lib/mailer";
import { currentUser } from "@/lib/master";
import { ballOf, healthLabel, healthOf, phaseLabel, phaseOf, phaseOwner } from "@/lib/flow";
import type { Project, State } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { projectId?: string; to?: string[]; extra?: string; message?: string; urgency?: string; mode?: "pdf" | "send" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export async function GET() {
  const p = mailProvider();
  return Response.json({ configured: !!p, provider: p, from: p ? mailFrom() : null });
}

function emailHtml(s: State, p: Project, client: string, b: Required<Pick<Body, "message" | "urgency">>, who: { name: string; email: string }, origin: string) {
  const h = healthOf(p), c = h.health === "red" ? "#e0475f" : h.health === "amber" ? "#d98c12" : "#0f9a68";
  const blocker = (p.blocker || "").trim() && p.blocker !== "-" ? p.blocker : "Não informado";
  const row = (l: string, v: string) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e6edf2;color:#6b7d8c;font-size:12px;font-weight:700;width:170px;vertical-align:top">${esc(l)}</td><td style="padding:9px 0;border-bottom:1px solid #e6edf2;color:#13263a;font-size:13.5px">${esc(v)}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#eef3f7;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 18px 40px -24px rgba(11,31,51,.5)">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e6edf2"><img src="${origin}/wms-expert-logo-azul.png" alt="WMS Expert" height="30" style="display:block;height:30px"></td></tr>
<tr><td style="background:#0b1f33;padding:26px 28px;border-bottom:4px solid #10c1fc">
<div style="color:#10c1fc;font-size:11px;font-weight:800;letter-spacing:.14em">ESCALONAMENTO · URGÊNCIA ${esc(b.urgency.toUpperCase())}</div>
<div style="color:#fff;font-size:26px;font-weight:800;margin-top:6px">${esc(client)}</div>
<div style="color:#bfdbee;font-size:13px;margin-top:6px">${esc(p.system)} · ${esc(p.wave || "Sem onda")} · Fase: ${esc(phaseLabel(phaseOf(p)))}</div>
<div style="margin-top:14px"><span style="display:inline-block;background:${c};color:#fff;font-size:11px;font-weight:800;padding:5px 10px;border-radius:99px">${esc(healthLabel[h.health].toUpperCase())}</span> <span style="display:inline-block;background:#1d3a55;color:#fff;font-size:11px;font-weight:800;padding:5px 10px;border-radius:99px">${h.inPhase ?? "—"} DIAS NA FASE</span></div></td></tr>
<tr><td style="padding:24px 28px 6px"><div style="font-size:12px;font-weight:800;color:#0b98b5;letter-spacing:.08em">PEDIDO DE INTERVENÇÃO</div>
<div style="margin-top:10px;padding:14px 16px;background:#f4f8fb;border-left:4px solid #10c1fc;border-radius:10px;color:#13263a;font-size:14.5px;line-height:1.55;white-space:pre-wrap">${esc(b.message)}</div>
<div style="margin-top:8px;color:#6b7d8c;font-size:12px">Solicitado por <b>${esc(who.name)}</b>${who.email ? ` &lt;${esc(who.email)}&gt;` : ""}</div></td></tr>
<tr><td style="padding:18px 28px 6px"><div style="font-size:12px;font-weight:800;color:#e0475f;letter-spacing:.08em">ENTRAVE ATUAL</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${row("Empecilho", blocker)}${row("Com quem está a bola", ballOf(p))}${row("Dono da fase", phaseOwner(p))}${row("Próxima ação", p.nextAction || "Sem próxima ação definida")}${row("Sem movimentação", `${h.idle ?? "—"} dias`)}</table></td></tr>
<tr><td style="padding:18px 28px 26px;color:#46596b;font-size:13px;line-height:1.5">O histórico completo do projeto (linha do tempo, documentos da esteira, datas, atividades e agenda) está no PDF anexo.</td></tr>
<tr><td style="padding:16px 28px;background:#f4f8fb;color:#7d8f9e;font-size:11.5px">WMS Expert · Esteira de Entregas · mensagem registrada no aplicativo em ${esc(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as Body;
  const message = (b.message || "").trim(), urgency = ["Crítica", "Alta", "Média"].includes(b.urgency || "") ? b.urgency! : "Alta";
  if (!b.projectId) return problem("Projeto inválido.");
  if (message.length < 10) return problem("Descreva o pedido de intervenção (mínimo 10 caracteres).");
  const s = await loadState();
  const p = s.projects.find(x => x.id === b.projectId);
  if (!p) return problem("Projeto não encontrado.", 404);
  const client = s.clients.find(c => c.id === p.clientId)?.name || p.name;
  const who = await currentUser();
  const extra = (b.extra || "").split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  const wanted = [...new Set([...(b.to || []), ...extra].map(x => x.toLowerCase()))];
  const bad = wanted.filter(x => !EMAIL.test(x));
  if (bad.length) return problem(`E-mail inválido: ${bad.join(", ")}`);
  const recipients = wanted.map(e => { const st = s.staff.find(x => (x.email || "").toLowerCase() === e); return { name: st?.name || e, email: e, sector: st?.sector || undefined }; });
  const pdf = Buffer.from(await buildEscalationPdf(s, p, { message, urgency, requester: who.name, requesterEmail: who.email, recipients }));
  const filename = `escalonamento-${slug(client)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  if (b.mode !== "send") return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "no-store" } });

  if (!recipients.length) return problem("Selecione ao menos um destinatário.");
  if (recipients.length > 15) return problem("Máximo de 15 destinatários por envio.");
  const origin = new URL(req.url).origin;
  try {
    await sendMail({
      to: recipients.map(r => r.email), replyTo: who.email || undefined,
      subject: `[Escalonamento · ${urgency}] ${client} — ${(p.blocker || "").trim() && p.blocker !== "-" ? p.blocker : phaseLabel(phaseOf(p))}`.slice(0, 180),
      html: emailHtml(s, p, client, { message, urgency }, who, origin),
      text: `Escalonamento (${urgency}) - ${client}\n\nPedido: ${message}\n\nEmpecilho: ${p.blocker || "-"}\nBola com: ${ballOf(p)}\nFase: ${phaseLabel(phaseOf(p))}\n\nHistórico completo no PDF anexo.\nSolicitado por ${who.name}`,
      attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) { return problem(e instanceof Error ? e.message : "Falha no envio do e-mail.", 502); }
  const now = new Date().toISOString();
  await transact((st: State) => {
    const pp = st.projects.find(x => x.id === p.id); if (!pp) return;
    const text = `Escalonado (${urgency}) para ${recipients.map(r => r.sector ? `${r.name} · ${r.sector}` : r.name).join(", ")}. Pedido: ${message}`;
    pp.timeline = [{ id: crypto.randomUUID(), at: now, kind: "escalonamento", author: who.name, text }, ...(pp.timeline || [])].slice(0, 200);
    pp.updatedAt = now;
    audit(st, "projects", "escalonamento enviado", pp.id, `${client} -> ${recipients.map(r => r.email).join(", ")}`);
  });
  return Response.json({ ok: true, message: `Escalonamento enviado para ${recipients.length} destinatário(s)` });
}
