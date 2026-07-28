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

export function mlOAuthStatusFeedback(status) {
  const messages = {
    connected: {
      title: "Mercado Livre conectado",
      message: "A conta foi autorizada com sucesso e será sincronizada somente com esta empresa.",
      tone: "success",
    },
    reconnected: {
      title: "Mercado Livre reconectado",
      message: "A autorização foi renovada com sucesso para esta empresa.",
      tone: "success",
    },
    already_linked: {
      title: "Não foi possível autorizar esta conta",
      message: "Saia da sessão atual do Mercado Livre e tente novamente com a conta correta para este ambiente.",
      tone: "warning",
    },
  };
  return messages[status] || {
    title: "Não foi possível conectar ao Mercado Livre",
    message: "Tente novamente pela área de Configurações do Marketplace.",
    tone: "error",
  };
}
