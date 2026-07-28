export function publicErrorMessage(value, fallback = "Não foi possível concluir a operação.") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (value && typeof value === "object") {
    for (const key of ["message", "error_description", "msg", "error"]) {
      const candidate = value[key];
      if (candidate === value) continue;
      const message = publicErrorMessage(candidate, "");
      if (message) return message;
    }
  }
  return fallback;
}
