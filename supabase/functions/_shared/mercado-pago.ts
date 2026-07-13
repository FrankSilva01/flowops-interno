const API_URL = "https://api.mercadopago.com";

export class MercadoPagoApiError extends Error {
  status: number;
  code: string;
  statusDetail: string;

  constructor(message: string, status: number, data: Record<string, any> = {}) {
    super(message);
    this.name = "MercadoPagoApiError";
    this.status = status;
    this.code = String(data.error || data.code || "");
    this.statusDetail = String(
      data.status_detail || data.cause?.[0]?.code || data.cause?.[0]?.description || "",
    );
  }
}

export type MercadoPagoPlanInput = {
  id?: string | null;
  code: string;
  name: string;
  amount: number;
  currency?: string;
  active?: boolean;
};

function accessToken() {
  const token = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")?.trim();
  if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN nao configurado.");
  return token;
}

export async function mercadoPagoRequest(
  path: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message
      || data?.error
      || data?.cause?.[0]?.description
      || `Mercado Pago retornou HTTP ${response.status}.`;
    throw new MercadoPagoApiError(message, response.status, data);
  }
  return data;
}

export async function syncMercadoPagoPlan(input: MercadoPagoPlanInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      id: input.id || null,
      init_point: null,
      status: "not_applicable",
      skipped: true,
    };
  }
  const backUrl = Deno.env.get("MERCADO_PAGO_BACK_URL")?.trim()
    || Deno.env.get("INTERNAL_APP_URL")?.trim()
    || Deno.env.get("APP_URL")?.trim();
  if (!backUrl) throw new Error("MERCADO_PAGO_BACK_URL nao configurada.");
  const payload = {
    reason: `3D.AFT - ${input.name}`,
    back_url: backUrl,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: Number(input.amount),
      currency_id: input.currency || "BRL",
    },
  };
  if (input.id) {
    return await mercadoPagoRequest(`/preapproval_plan/${encodeURIComponent(input.id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }
  return await mercadoPagoRequest("/preapproval_plan", {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(payload),
  });
}

export async function createMercadoPagoSubscription(input: {
  planId: string;
  organizationId: string;
  planCode: string;
  payerEmail: string;
  reason: string;
}) {
  const backUrl = Deno.env.get("MERCADO_PAGO_BACK_URL")?.trim()
    || Deno.env.get("INTERNAL_APP_URL")?.trim()
    || Deno.env.get("APP_URL")?.trim();
  if (!backUrl) throw new Error("MERCADO_PAGO_BACK_URL nao configurada.");
  return await mercadoPagoRequest("/preapproval", {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      preapproval_plan_id: input.planId,
      payer_email: input.payerEmail,
      reason: input.reason,
      external_reference: `${input.organizationId}:${input.planCode}`,
      back_url: backUrl,
      status: "pending",
    }),
  });
}

export async function verifyMercadoPagoSignature(req: Request, dataId: string) {
  const secret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")?.trim();
  if (!secret) {
    console.error(JSON.stringify({ event: "mercado_pago_webhook_rejected", reason: "missing_webhook_secret" }));
    return false;
  }
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  if (!parts.ts || !parts.v1) return false;
  const normalizedId = String(dataId || "").toLowerCase();
  const manifest = [
    normalizedId ? `id:${normalizedId};` : "",
    requestId ? `request-id:${requestId};` : "",
    `ts:${parts.ts};`,
  ].join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  const calculated = [...new Uint8Array(signed)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return calculated === parts.v1;
}
