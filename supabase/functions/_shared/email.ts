import { renderSafeTemplate, sanitizeHtml } from "./security.ts";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

type SupabaseAdmin = { from: (table: string) => any };
type QueueItem = {
  id: string;
  organization_id?: string | null;
  recipient_email: string;
  template_code: string;
  variables?: Record<string, unknown>;
  attempts?: number;
};

function senderFromEnvironment() {
  const configured = Deno.env.get("EMAIL_FROM")?.trim();
  if (!configured) throw new Error("EMAIL_FROM nao configurado.");
  const match = configured.match(/^(.*?)\s*<([^>]+)>$/);
  return match
    ? { name: match[1].trim() || "3D.AFT", email: match[2].trim() }
    : { name: "3D.AFT", email: configured };
}

async function writeDeliveryLog(
  supabase: SupabaseAdmin,
  item: QueueItem,
  status: string,
  attempt: number,
  details: { providerMessageId?: string; error?: string; response?: Record<string, unknown> } = {},
) {
  await supabase.from("saas_email_delivery_logs").insert({
    outbox_id: item.id,
    organization_id: item.organization_id || null,
    recipient_email: item.recipient_email,
    template_code: item.template_code,
    provider: "brevo",
    status,
    attempt,
    provider_message_id: details.providerMessageId || null,
    error_message: details.error || null,
    response_payload: details.response || {},
  });
}

export async function sendQueuedEmail(
  supabase: SupabaseAdmin,
  item: QueueItem,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const attempt = Number(item.attempts || 0) + 1;
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY")?.trim();
    if (!apiKey) throw new Error("BREVO_API_KEY nao configurada.");
    const { data: template, error: templateError } = await supabase
      .from("saas_email_templates")
      .select("subject,html_body,active")
      .eq("code", item.template_code)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template?.active) throw new Error(`Template ${item.template_code} nao encontrado ou inativo.`);

    const variables = item.variables || {};
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: senderFromEnvironment(),
        to: [{ email: item.recipient_email }],
        subject: renderSafeTemplate(template.subject, variables),
        htmlContent: sanitizeHtml(renderSafeTemplate(template.html_body, variables)),
        tags: ["3daft", item.template_code],
        params: variables,
      }),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(responseBody?.message || responseBody?.code || `Brevo HTTP ${response.status}`));
    }

    const messageId = String(responseBody?.messageId || "");
    await supabase.from("saas_email_outbox").update({
      status: "sent",
      attempts: attempt,
      last_error: null,
      sent_at: new Date().toISOString(),
      provider_message_id: messageId || null,
      provider_response: responseBody,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    await writeDeliveryLog(supabase, item, "sent", attempt, {
      providerMessageId: messageId,
      response: responseBody,
    });
    return { ok: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryMinutes = Math.min(1440, Math.max(5, 5 * (2 ** Math.min(attempt - 1, 8))));
    const terminal = attempt >= 8;
    await supabase.from("saas_email_outbox").update({
      status: terminal ? "failed" : "retry",
      attempts: attempt,
      last_error: message,
      next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    await writeDeliveryLog(supabase, item, terminal ? "failed" : "retry", attempt, { error: message });
    return { ok: false, error: message };
  }
}

export async function dispatchPendingEmails(supabase: SupabaseAdmin, limit = 30) {
  const now = new Date().toISOString();
  const { data: queue, error } = await supabase
    .from("saas_email_outbox")
    .select("id,organization_id,recipient_email,template_code,variables,attempts")
    .in("status", ["pending", "retry"])
    .lte("scheduled_at", now)
    .lte("next_attempt_at", now)
    .lt("attempts", 8)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let sent = 0;
  let retry = 0;
  for (const item of queue || []) {
    const result = await sendQueuedEmail(supabase, item);
    if (result.ok) sent += 1;
    else retry += 1;
  }
  return { processed: (queue || []).length, sent, retry };
}
