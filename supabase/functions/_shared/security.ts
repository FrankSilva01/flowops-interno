export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char] || char));
}

export function sanitizeHtml(html: unknown) {
  let output = String(html ?? "");
  output = output.replace(/<\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  output = output.replace(/<\s*(script|iframe|object|embed|style|link|meta)\b[^>]*\/?\s*>/gi, "");
  output = output.replace(/\s+on[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  output = output.replace(/\s+(href|src|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, " $1=\"#\"");
  output = output.replace(/\s+(href|src|xlink:href)\s*=\s*javascript:[^\s>]+/gi, " $1=\"#\"");
  return output;
}

export function renderSafeTemplate(value: unknown, variables: Record<string, unknown> = {}) {
  return String(value || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) =>
    escapeHtml(variables[key] ?? "")
  );
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  const redacted: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/token|secret|password|authorization|apikey|api_key|client_secret/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = redactSecrets(raw);
    }
  }
  return redacted;
}

