export function mlOAuthErrorMessage(code) {
  const value = String(code || "").trim().toLowerCase();
  const messages = {
    state_ausente: "A autorização voltou sem a identificação da empresa. Inicie a conexão novamente pelo FlowOps.",
    state_invalido: "Esta tentativa de conexão não é mais válida. Inicie uma nova conexão pelo FlowOps.",
    state_ja_usado: "Esta autorização já foi utilizada. Inicie uma nova conexão pelo FlowOps.",
    state_expirado: "O tempo para autorizar a conta expirou. Clique em Conectar Mercado Livre e tente novamente.",
    code_ausente: "O Mercado Livre não concluiu a autorização. Tente conectar novamente.",
    access_denied: "A autorização foi cancelada no Mercado Livre. Tente novamente quando desejar.",
  };
  if (messages[value]) return messages[value];
  if (!value || value === "[object object]") {
    return "Não foi possível concluir a conexão. Tente novamente pela área de Configurações do Marketplace.";
  }
  return "Não foi possível concluir a conexão com o Mercado Livre. Tente novamente; se persistir, entre em contato com o suporte.";
}
