// V24 · Rotinas automáticas do servidor (7h, horário de São Paulo):
//  · diária (seg–sex): foto do dia + alertas por e-mail para cada responsável
//  · semanal (segunda): resumo da semana para os masters e para quem recebe escalonamento
// Tudo é calculado a partir do estado atual; nada aqui altera projetos ou atividades.
import type { Project, State, Task } from "./types";
import { PHASES, healthOf, isArchived, phaseOf, phaseOwner, phaseLabel } from "./flow";
import { attackFirst, gargalosSummary, heatmap, businessDays } from "./gargalos";
import { snapshotRows, type Snap } from "./evolucao";
import { isDone } from "./metrics";
import { masterEmails } from "./master";
import { forecastAll, paceByOwner } from "./forecast";
import { raioX } from "./raiox";
import { infraSummary, pendText } from "./infra";

export type AlertKind = "task-late" | "task-tomorrow" | "idle" | "phase-due" | "phase-late" | "next-late" | "next-missing" | "infra";
export type Alert = { kind: AlertKind; project: string; text: string; sev: number };
export type Mail = { to: string[]; name: string; subject: string; html: string; text: string; count: number };

const norm = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const br = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const weekdaySP = (iso: string) => new Date(iso + "T12:00:00").getDay(); // 0 dom … 6 sáb
/** Próximo dia útil depois de `iso`. */
export function nextBusinessDay(iso: string) { let d = addDays(iso, 1); while ([0, 6].includes(weekdaySP(d))) d = addDays(d, 1); return d; }
/** `iso` + n dias úteis. */
export function addBusinessDays(iso: string, n: number) { let d = iso; for (let i = 0; i < n; i++) d = nextBusinessDay(d); return d; }

const clientOf = (s: State, p: Project) => s.clients.find(c => c.id === p.clientId)?.name || p.name;
const openTask = (t: Task) => !isDone(t.status) && !norm(t.status).includes("cancel");
const blank = (v?: string | null) => { const x = (v || "").trim(); return !x || x === "-" || x === "—"; };

/** Liga o nome usado nos projetos/atividades ao e-mail cadastrado (equipe ou usuários do sistema). */
export function emailDirectory(s: State) {
  const rows = [
    ...s.staff.filter(x => x.active !== false && x.email).map(x => ({ name: x.name, email: String(x.email).trim().toLowerCase() })),
    ...s.users.filter(x => x.active !== false && x.email).map(x => ({ name: x.name, email: String(x.email).trim().toLowerCase() })),
  ];
  return (who: string): string | null => {
    const n = norm(who); if (!n) return null;
    if (/@/.test(n)) return n;
    const exact = rows.find(r => norm(r.name) === n); if (exact) return exact.email;
    const first = n.split(/\s+/)[0];
    const byFirst = rows.filter(r => norm(r.name).split(/\s+/)[0] === first);
    return byFirst.length === 1 && first.length >= 3 ? byFirst[0].email : null;
  };
}

/** Alertas do dia agrupados por responsável (nome como está na esteira). */
export function dailyAlerts(s: State, today: string) {
  const tomorrow = nextBusinessDay(today);
  const out = new Map<string, Alert[]>();
  const push = (who: string, a: Alert) => { const k = (who || "").trim() || "Sem responsável"; out.set(k, [...(out.get(k) || []), a]); };
  const active = s.projects.filter(p => !isArchived(p, today) && phaseOf(p) !== "fim");
  const ids = new Set(active.map(p => p.id));
  for (const t of s.tasks.filter(t => ids.has(t.projectId) && openTask(t) && t.dueDate)) {
    const p = active.find(x => x.id === t.projectId)!; const c = clientOf(s, p);
    if (String(t.dueDate) < today) push(t.owner, { kind: "task-late", project: c, sev: 3, text: `Atividade vencida em ${br(t.dueDate)} (${businessDays(t.dueDate, today)} dia(s) úteis): “${t.title}”` });
    else if (String(t.dueDate) <= tomorrow) push(t.owner, { kind: "task-tomorrow", project: c, sev: 2, text: `Atividade vence ${t.dueDate === today ? "hoje" : `em ${br(t.dueDate)}`}: “${t.title}”` });
  }
  for (const p of active) {
    const k = phaseOf(p), owner = phaseOwner(p, k), c = clientOf(s, p), h = healthOf(p, today, s.tasks);
    if (h.idle !== null && h.idle >= 7) push(owner, { kind: "idle", project: c, sev: 3, text: `Sem movimentação há ${h.idle} dias (${phaseLabel(k)})` });
    const due = p.phases?.[k]?.due;
    if (due && due < today) push(owner, { kind: "phase-late", project: c, sev: 3, text: `Prazo da fase ${phaseLabel(k)} venceu em ${br(due)}` });
    else if (due && due <= addDays(today, 2)) push(owner, { kind: "phase-due", project: c, sev: 2, text: `Prazo da fase ${phaseLabel(k)} vence ${due === today ? "hoje" : `em ${br(due)}`}` });
    for (const it of infraSummary(p).pending) { // V28: pendência de infraestrutura com prazo vencendo/vencido
      if (!it.due || it.due > tomorrow) continue;
      const who = it.owner && !/^(cliente|erp)/i.test(it.owner) ? it.owner : owner;
      push(who, { kind: "infra", project: c, sev: it.due < today ? 3 : 2, text: `Infraestrutura · ${pendText(it)}${it.owner && who !== it.owner ? ` (com ${it.owner})` : ""} — ${it.due < today ? "venceu" : "vence"} em ${br(it.due)}` });
    }
    if (blank(p.nextAction)) push(owner, { kind: "next-missing", project: c, sev: 1, text: "Sem próxima ação definida — o que precisa acontecer para o projeto andar?" });
    else if (p.nextActionDue && p.nextActionDue < today) push(p.nextActionOwner || owner, { kind: "next-late", project: c, sev: 2, text: `Próxima ação vencida em ${br(p.nextActionDue)}: “${p.nextAction}”` });
  }
  for (const [k, v] of out) out.set(k, v.sort((a, b) => b.sev - a.sev || a.project.localeCompare(b.project)));
  return out;
}

const KIND_LABEL: Record<AlertKind, string> = {
  "task-late": "Atividades vencidas", "task-tomorrow": "Vencem hoje ou no próximo dia útil", "phase-late": "Prazo da fase vencido",
  "phase-due": "Prazo da fase nos próximos 2 dias", infra: "Pendências de infraestrutura", idle: "Projetos parados há 7 dias ou mais", "next-late": "Próxima ação vencida", "next-missing": "Projetos sem próxima ação",
};
const ORDER: AlertKind[] = ["task-late", "phase-late", "infra", "idle", "next-late", "task-tomorrow", "phase-due", "next-missing"];
const DOT: Record<number, string> = { 3: "#e5484d", 2: "#f2994a", 1: "#8a97a8" };

function shell(title: string, intro: string, body: string, appUrl: string, cta = "Abrir a esteira") {
  return `<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Segoe UI,Arial,sans-serif;color:#14213d">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
<div style="background:#0b2a4a;color:#fff;border-radius:14px 14px 0 0;padding:18px 22px"><div style="font-size:11px;letter-spacing:.12em;opacity:.75">WMS EXPERT · ESTEIRA</div><div style="font-size:20px;font-weight:700;margin-top:4px">${esc(title)}</div></div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:20px 22px;border:1px solid #e3e9f1;border-top:0">
<p style="margin:0 0 16px;font-size:14px;line-height:1.5">${intro}</p>${body}
<p style="margin:22px 0 0"><a href="${esc(appUrl)}" style="background:#16b8d4;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px">${esc(cta)}</a></p>
</div><p style="font-size:11px;color:#7a8799;text-align:center;margin-top:14px">E-mail automático da rotina das 7h. Para parar de receber, atualize a esteira — os alertas somem quando o item é resolvido.</p></div></body></html>`;
}

export function dailyMail(name: string, alerts: Alert[], today: string, appUrl: string, paceLine = ""): Omit<Mail, "to"> {
  const first = name.split(/\s+/)[0];
  const groups = ORDER.map(k => ({ k, items: alerts.filter(a => a.kind === k) })).filter(g => g.items.length);
  const body = (paceLine ? `<p style="margin:0 0 6px;padding:8px 10px;border-radius:8px;background:#eef8fb;font-size:12.5px;color:#0b4f63">${paceLine}</p>` : "") + groups.map(g => `<h3 style="font-size:13px;margin:16px 0 6px;color:#0b2a4a">${KIND_LABEL[g.k]} (${g.items.length})</h3>` +
    g.items.map(a => `<div style="padding:8px 10px;border-left:3px solid ${DOT[a.sev]};background:#f7f9fc;margin:0 0 6px;border-radius:0 8px 8px 0;font-size:13px"><b>${esc(a.project)}</b><br>${esc(a.text)}</div>`).join("")).join("");
  const late = alerts.filter(a => a.sev === 3).length;
  const subject = `Esteira · ${br(today)} · ${alerts.length} ponto(s) para você${late ? ` (${late} vencido/parado)` : ""}`;
  const text = `Bom dia, ${first}. Pontos da esteira para hoje (${br(today)}):\n\n` + groups.map(g => `${KIND_LABEL[g.k]}:\n` + g.items.map(a => ` - ${a.project}: ${a.text}`).join("\n")).join("\n\n") + `\n\n${appUrl}`;
  return { name, subject, count: alerts.length, text, html: shell(`Seu dia na esteira · ${br(today)}`, `Bom dia, <b>${esc(first)}</b>. Estes são os pontos que dependem de você hoje.`, body, `${appUrl}/minha-semana`, "Abrir minha semana") };
}

/** Monta todos os e-mails da rotina diária. Quem não tem e-mail cadastrado vai para os masters. */
export function buildDaily(s: State, today: string, appUrl: string) {
  const alerts = dailyAlerts(s, today), find = emailDirectory(s), pace = paceByOwner(s, today);
  const mails: Mail[] = [], orphan: { name: string; alerts: Alert[] }[] = [];
  for (const [name, list] of alerts) {
    const email = find(name);
    if (email) {
      const pc = pace.of(name); // V29: ritmo da pessoa x equipe
      const paceLine = pc.n >= 2 ? `Seu ritmo nas fases concluídas: <b>${pc.ratio.toFixed(1).replace(".", ",")}× a meta</b> (equipe: ${pace.global.toFixed(1).replace(".", ",")}×). ${pc.ratio <= pace.global ? "Acima da média da equipe. 👏" : "Abaixo da média da equipe — vale olhar os parados."}` : "";
      mails.push({ ...dailyMail(name, list, today, appUrl, paceLine), to: [email] });
    }
    else orphan.push({ name, alerts: list });
  }
  if (orphan.length) {
    const body = orphan.map(o => `<h3 style="font-size:13px;margin:16px 0 6px;color:#0b2a4a">${esc(o.name)} (${o.alerts.length})</h3>` +
      o.alerts.slice(0, 15).map(a => `<div style="padding:6px 10px;border-left:3px solid ${DOT[a.sev]};background:#f7f9fc;margin:0 0 5px;font-size:13px"><b>${esc(a.project)}</b> · ${esc(a.text)}</div>`).join("") + (o.alerts.length > 15 ? `<div style="font-size:12px;color:#7a8799">+${o.alerts.length - 15}</div>` : "")).join("");
    const n = orphan.reduce((a, o) => a + o.alerts.length, 0);
    mails.push({ to: masterEmails(), name: "Masters", count: n, subject: `Esteira · ${br(today)} · ${n} alerta(s) de responsáveis sem e-mail`,
      text: orphan.map(o => `${o.name}:\n` + o.alerts.map(a => ` - ${a.project}: ${a.text}`).join("\n")).join("\n\n"),
      html: shell("Alertas sem destinatário", `Estes responsáveis não têm e-mail cadastrado na <b>Equipe</b> (ou o nome não bate). Cadastre o e-mail para eles receberem direto.`, body, appUrl) });
  }
  // V29: sobrecarga — quem passou de 100% da capacidade de turnos na semana
  const over = raioX(s, [], [], 30, today).consultants.filter(c => c.loadPct !== null && c.loadPct > 100);
  if (over.length) mails.push({ to: masterEmails(), name: "Sobrecarga", count: over.length, subject: `Esteira · ${br(today)} · ${over.length} consultor(es) acima da capacidade`,
    text: over.map(c => `${c.name}: ${c.slots} turnos agendados para ${c.cap} de capacidade (${c.loadPct}%)`).join("\n"),
    html: shell("Consultores acima da capacidade", "A agenda desta semana passou da capacidade cadastrada em Equipe & capacidade. Redistribua ou ajuste a capacidade.", over.map(c => `<div style="padding:8px 10px;border-left:3px solid #e5484d;background:#f7f9fc;margin:0 0 6px;font-size:13px"><b>${esc(c.name)}</b>: ${c.slots} turnos agendados · capacidade ${c.cap} · <b>${c.loadPct}%</b></div>`).join(""), `${appUrl}/raio-x`, "Abrir o Raio-X") });
  return { mails, people: alerts.size, total: [...alerts.values()].reduce((a, l) => a + l.length, 0), orphans: orphan.map(o => o.name), sobrecarga: over.length };
}

/** Resumo semanal (segunda-feira): gargalos, atacar primeiro, quem andou/parou na semana, atividades vencidas. */
export function buildWeekly(s: State, today: string, appUrl: string, weekAgo: Snap[]) {
  const sum = gargalosSummary(s, today);
  const map = heatmap(s, "fase", today);
  const attack = attackFirst(map.heats, 5);
  const now = snapshotRows(s, today);
  const before = new Map<string, Snap>(); for (const r of weekAgo) { const b = before.get(r.project_id); if (!b || r.day > b.day) before.set(r.project_id, r); }
  const moves = now.map(r => { const b = before.get(r.project_id); return { r, b, d: b ? Math.round(r.progress - Number(b.progress)) : null, phaseChanged: !!b && b.phase !== r.phase }; })
    .filter(x => x.b && x.d !== null);
  const name = (r: Snap) => s.clients.find(c => c.id === r.client_id)?.name || "—";
  const ph = (k: string) => PHASES.find(p => p.key === k)?.short || k;
  const up = moves.filter(x => (x.d as number) > 0 || x.phaseChanged).sort((a, b) => (b.d as number) - (a.d as number)).slice(0, 6);
  const still = moves.filter(x => x.d === 0 && !x.phaseChanged && x.r.phase !== "fim");
  const ids = new Set(map.heats.map(h => h.p.id));
  const late = s.tasks.filter(t => ids.has(t.projectId) && openTask(t) && t.dueDate && t.dueDate < today);
  const byOwner = [...late.reduce((m, t) => m.set(t.owner || "Sem responsável", (m.get(t.owner || "Sem responsável") || 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const noNext = map.heats.filter(h => !h.nextAction);
  const fc = [...forecastAll(s, today).values()].filter(f => f.status !== "virou");
  const in30 = addDays(today, 30);
  const soon = fc.filter(f => f.forecast <= in30).sort((a, b) => a.forecast.localeCompare(b.forecast));
  const risk = fc.filter(f => f.status === "risco" || f.status === "atrasado").sort((a, b) => (b.diff || 0) - (a.diff || 0));
  const kpi = (v: string, l: string, c = "#0b2a4a") => `<td style="padding:10px;background:#f7f9fc;border-radius:10px;text-align:center;width:25%"><div style="font-size:22px;font-weight:700;color:${c}">${esc(v)}</div><div style="font-size:11px;color:#5b6b80">${esc(l)}</div></td>`;
  const sec = (t: string, inner: string) => `<h3 style="font-size:14px;margin:22px 0 8px;color:#0b2a4a">${t}</h3>${inner}`;
  const row = (a: string, b: string, color = "#16b8d4") => `<div style="padding:7px 10px;border-left:3px solid ${color};background:#f7f9fc;margin:0 0 5px;font-size:13px">${a}${b ? `<br><span style="color:#5b6b80">${b}</span>` : ""}</div>`;
  const body =
    `<table role="presentation" style="width:100%;border-spacing:6px"><tr>${kpi(String(sum.active), "projetos ativos")}${kpi(String(sum.red), "críticos", sum.red ? "#e5484d" : "#2fbf71")}${kpi(sum.pctInGoal === null ? "—" : `${sum.pctInGoal}%`, "dentro da meta")}${kpi(sum.cycle.avg === null ? "—" : `${sum.cycle.avg}d`, "ciclo médio (úteis)")}</tr></table>` +
    (sum.worst ? `<p style="font-size:13px;margin:12px 0 0">Maior gargalo agora: <b>${esc(sum.worst.label)}</b>${sum.hot.length ? ` — ${sum.hot.map(h => `${esc(h.row)} · ${esc(h.dim)}: ${esc(h.text)}`).join("; ")}` : ""}.</p>` : "") +
    sec("Atacar primeiro", attack.length ? attack.map((a, i) => row(`<b>${i + 1}. ${esc(a.h.client)}</b> · ${esc(ph(a.h.phase))} · ${esc(a.h.owner)}`, `${esc(a.problem)} → ${esc(a.next)}`, i < 2 ? "#e5484d" : "#f2994a")).join("") : row("Nenhum projeto com problema relevante.", "", "#2fbf71")) +
    (() => { // V29: ranking da semana
      const byOwner = new Map<string, number>(); for (const x of moves) if ((x.d as number) > 0 || x.phaseChanged) byOwner.set(x.r.owner, (byOwner.get(x.r.owner) || 0) + Math.max(0, x.d as number) + (x.phaseChanged ? 10 : 0));
      const best = [...byOwner.entries()].filter(([o]) => !/^(a definir|não definido|nao definido)$/i.test(o)).sort((a, b) => b[1] - a[1])[0];
      const rx = raioX(s, weekAgo, weekAgo, 7, today), worst = rx.clients[0];
      const items = [best ? row(`🏆 <b>Quem mais fez andar:</b> ${esc(best[0])}`, `${best[1]} pontos de avanço nos projetos em que é dono da fase (mudança de fase vale 10)`, "#2fbf71") : "",
        worst ? row(`⚠️ <b>Cliente que mais travou:</b> ${esc(worst.name)} · risco ${worst.risk}/100`, esc(worst.why.join(" · ")), "#e5484d") : ""].join("");
      return items ? sec("Ranking da semana", items) : "";
    })() +
    sec("Quem andou na semana", weekAgo.length ? (up.length ? up.map(x => row(`<b>${esc(name(x.r))}</b> · ${x.phaseChanged ? `${esc(ph(x.b!.phase))} → ${esc(ph(x.r.phase))}` : esc(ph(x.r.phase))}`, `${(x.d as number) >= 0 ? "+" : ""}${x.d} p.p. de avanço`, "#2fbf71")).join("") : row("Nenhum projeto avançou nos últimos 7 dias.", "", "#e5484d")) +
      (still.length ? `<p style="font-size:12px;color:#5b6b80;margin:6px 0 0">Sem avanço na semana (${still.length}): ${still.slice(0, 12).map(x => esc(name(x.r))).join(", ")}${still.length > 12 ? "…" : ""}</p>` : "") : `<p style="font-size:13px;color:#5b6b80">Ainda não há fotos de 7 dias atrás para comparar; a partir da próxima semana este bloco mostra quem andou.</p>`) +
    sec(`Go-lives previstos nos próximos 30 dias (${soon.length})`, soon.length ? soon.slice(0, 10).map(f => row(`<b>${esc(f.client)}</b> · previsto ${br(f.forecast)}${f.promised ? ` · prometido ${br(f.promised)}` : " · <i>sem data prometida</i>"}`, `${esc(ph(f.phase))} · ${esc(f.owner)} · confiança ${f.confidence}`, f.status === "atrasado" ? "#e5484d" : f.status === "risco" ? "#f2994a" : "#16b8d4")).join("") : row("Nenhuma virada prevista nos próximos 30 dias.", "", "#8a97a8")) +
    (risk.length ? sec(`Em risco vs data prometida (${risk.length})`, risk.slice(0, 8).map(f => row(`<b>${esc(f.client)}</b>: ${f.diff} dia(s) útil(eis) depois do prometido`, `prometido ${br(f.promised)} · previsto ${br(f.forecast)} · ${esc(f.reason)}`, "#e5484d")).join("")) : "") +
    sec(`Atividades vencidas (${late.length})`, late.length ? byOwner.map(([o, n]) => row(`<b>${esc(o)}</b>: ${n} vencida(s)`, "", "#e5484d")).join("") : row("Nenhuma atividade vencida.", "", "#2fbf71")) +
    sec(`Projetos sem próxima ação (${noNext.length} de ${map.heats.length})`, noNext.length ? `<p style="font-size:13px;margin:0">${noNext.slice(0, 20).map(h => `${esc(h.client)} <span style="color:#7a8799">(${esc(h.owner)})</span>`).join(" · ")}${noNext.length > 20 ? " …" : ""}</p>` : row("Todos os projetos têm próxima ação.", "", "#2fbf71"));
  const to = [...new Set([...masterEmails(), ...s.staff.filter(x => x.active !== false && x.escalation && x.email).map(x => String(x.email).trim().toLowerCase())])];
  const text = `Resumo semanal da esteira (${br(today)})\nAtivos: ${sum.active} · Críticos: ${sum.red} · Dentro da meta: ${sum.pctInGoal ?? "—"}%\n\nAtacar primeiro:\n` + attack.map((a, i) => `${i + 1}. ${a.h.client} (${ph(a.h.phase)}): ${a.problem} → ${a.next}`).join("\n") + `\n\nAtividades vencidas: ${late.length}\nSem próxima ação: ${noNext.length}\n\n${appUrl}`;
  const mail: Mail = { to, name: "Resumo semanal", count: attack.length, subject: `Esteira · resumo da semana · ${br(today)} · ${sum.red} crítico(s)`, text,
    html: shell(`Resumo da semana · ${br(today)}`, "Como a esteira está, onde trava e o que atacar primeiro nesta semana.", body, appUrl) };
  return { mail, stats: { active: sum.active, red: sum.red, attack: attack.length, late: late.length, noNext: noNext.length, moved: up.length, golive30: soon.length, risco: risk.length } };
}
