// V14 · Mensagens de erro em português claro (o detalhe técnico vai para o console / campo "detail").
const RULES: [RegExp, string][] = [
  [/could not find the function|schema cache|function .* does not exist|relation .* does not exist|column .* does not exist/i, "Este recurso ainda não foi ativado no banco de dados. Avise o administrador para aplicar a atualização do Supabase."],
  [/bucket not found|esteira-docs/i, "O armazenamento de arquivos ainda não foi ativado. Avise o administrador."],
  [/invalid api key|jwt|apikey|chave do app|assert_key/i, "As credenciais do banco de dados não conferem. Avise o administrador."],
  [/failed to fetch|networkerror|fetch failed|econnrefused|enotfound|etimedout|socket hang up|load failed/i, "Sem conexão com o servidor agora. Confira a internet e tente de novo."],
  [/timeout|timed out|demorou/i, "A operação demorou demais. Tente de novo em instantes."],
  [/payload too large|entity too large|\b413\b|exceeded the maximum allowed size/i, "Arquivo grande demais para enviar."],
  [/mime type|not supported|invalid_mime/i, "Tipo de arquivo não aceito. Envie PDF, JPG ou PNG."],
  [/duplicate key|already exists|unique constraint/i, "Já existe um registro com esses dados."],
  [/foreign key/i, "Este registro está ligado a outros e não pode ser alterado assim."],
  [/row-level security|permission denied|not authorized|unauthorized|\b401\b|\b403\b/i, "Sem permissão para esta ação. Entre de novo ou fale com o administrador."],
  [/zapsign.*(token|autentica)/i, "A ZapSign recusou o token configurado. Peça ao administrador para reconfigurar a integração (-ConfigurarZapSign)."],
  [/smtp|invalid login|535|username and password not accepted|auth.*fail/i, "O servidor de e-mail recusou o usuário ou a senha configurados. Peça ao administrador para rodar -ConfigurarEmail."],
  [/unexpected token|json/i, "O servidor respondeu de um jeito inesperado. Recarregue a página e tente de novo."],
];
const PT = /[ãõçáéíóúâêô]|\b(não|para|informe|selecione|falha|erro|atividade|projeto|documento|arquivo|assinatura|cliente)\b/i;

/** Converte uma mensagem técnica em uma frase clara. Mensagens que já estão em português ficam como estão. */
export function friendly(raw: unknown): string {
  const msg = String(raw instanceof Error ? raw.message : raw ?? "").replace(/^Banco de dados:\s*/i, "").trim();
  if (!msg) return "Algo deu errado. Tente de novo.";
  for (const [re, text] of RULES) if (re.test(msg)) return text;
  if (PT.test(msg)) return msg;
  return "Algo deu errado ao concluir a ação. Tente de novo; se continuar, avise o administrador.";
}
