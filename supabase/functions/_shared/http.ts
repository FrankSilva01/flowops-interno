const DEFAULT_ALLOWED_ORIGINS = [
  "https://rainbow-lokum-1fad14.netlify.app",
  "https://fancy-pastelito-51931f.netlify.app",
  "https://lively-figolla-c41308.netlify.app",
];

function configuredOrigins() {
  return (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return [...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins()].includes(origin);
}

export function corsHeadersFor(req: Request, methods = "GET, POST, OPTIONS") {
  const origin = req.headers.get("Origin");
  const allowOrigin = isAllowedOrigin(origin) ? (origin || DEFAULT_ALLOWED_ORIGINS[0]) : "";
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, X-FlowOps-Document-Count, X-FlowOps-Document-Source",
  };
}

export function preflight(req: Request, methods?: string) {
  if (!isAllowedOrigin(req.headers.get("Origin"))) {
    return new Response("Origem nao permitida.", { status: 403 });
  }
  return new Response("ok", { headers: corsHeadersFor(req, methods) });
}

export function jsonResponse(req: Request, data: unknown, status = 200, methods?: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeadersFor(req, methods), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return (req.headers.get("cf-connecting-ip") || forwarded.split(",")[0] || "unknown").trim();
}
