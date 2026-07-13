export const SUPABASE_CONFIG = window.SUPABASE_CONFIG;

export function supabaseFunctionUrl(path = "") {
  const explicitBase = String(SUPABASE_CONFIG?.FUNCTIONS_URL || "").replace(/\/$/, "");
  const projectBase = String(SUPABASE_CONFIG?.SUPABASE_URL || "").replace(/\/$/, "");
  const base = explicitBase || `${projectBase}/functions/v1`;
  return `${base}/${String(path).replace(/^\//, "")}`;
}
