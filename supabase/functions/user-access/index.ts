import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendQueuedEmail } from "../_shared/email.ts";
import { clientIp, corsHeadersFor } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function applyCors(req: Request) {
  for (const key of Object.keys(corsHeaders)) delete (corsHeaders as Record<string, string>)[key];
  Object.assign(corsHeaders, corsHeadersFor(req, "POST, OPTIONS"));
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const defaultOrganizationId = "00000000-0000-0000-0000-000000000001";
    if (!email || !email.includes("@")) return json({ ok: false, error: "E-mail invalido." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Configuracao do Supabase ausente.");
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ip = clientIp(req);

    if (action === "recover-password") {
      await enforceRateLimit(admin, `recover-email:${email}`, 3, 15);
      await enforceRateLimit(admin, `recover-ip:${ip}`, 20, 15);
      const requestedRedirect = cleanPublicAppUrl(String(body.redirect_to || "").trim());
      const configuredRedirect = cleanPublicAppUrl(Deno.env.get("INTERNAL_APP_URL")?.trim() || "")
        || cleanPublicAppUrl(Deno.env.get("APP_URL")?.trim() || "");
      const redirectTo = requestedRedirect || configuredRedirect || "https://rainbow-lokum-1fad14.netlify.app/";
      const { data: approved } = await admin
        .from("approved_users")
        .select("organization_id")
        .eq("email", email)
        .maybeSingle();
      if (!approved) return json({ ok: true });

      const { data: recentRecovery } = await admin
        .from("saas_email_outbox")
        .select("id")
        .eq("recipient_email", email)
        .eq("template_code", "password_recovery")
        .gt("created_at", minutesAgo(10))
        .limit(1);
      if ((recentRecovery || []).length > 0) return json({ ok: true });

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (linkError || !linkData?.properties?.action_link) {
        return json({ ok: true });
      }
      const recoveryUrl = rewriteActionLink(linkData.properties.action_link, redirectTo);
      const { data: queued, error: queueError } = await admin.from("saas_email_outbox").insert({
        organization_id: approved.organization_id || defaultOrganizationId,
        recipient_email: email,
        template_code: "password_recovery",
        variables: { recovery_url: recoveryUrl },
      }).select("id,organization_id,recipient_email,template_code,variables,attempts").single();
      if (!queueError && queued) {
        await sendQueuedEmail(admin, queued).catch(() => null);
      } else if (queueError) {
        try {
          await admin.from("saas_email_delivery_logs").insert({
            organization_id: approved.organization_id || defaultOrganizationId,
            recipient_email: email,
            template_code: "password_recovery",
            provider: "brevo",
            status: "failed",
            attempt: 1,
            error_message: queueError.message || String(queueError),
            response_payload: { source: "recover-password" },
          });
        } catch {
          // Recovery response must not disclose telemetry failures.
        }
      }
      return json({ ok: true });
    }

    if (password.length < 8) return json({ ok: false, error: "A senha precisa ter pelo menos 8 caracteres." }, 400);

    if (action === "request") {
      await enforceRateLimit(admin, `access-request-email:${email}`, 3, 60);
      await enforceRateLimit(admin, `access-request-ip:${ip}`, 20, 60);
      const organizationId = String(body.organization_id || defaultOrganizationId);
      const { data: approved } = await admin
        .from("approved_users")
        .select("email")
        .eq("email", email)
        .maybeSingle();
      if (approved) return json({ ok: false, code: "already_approved", error: "Este e-mail ja possui acesso ativo." }, 409);

      const { data: recentRequest } = await admin
        .from("access_requests")
        .select("email")
        .eq("email", email)
        .eq("status", "pending")
        .gt("requested_at", minutesAgo(15))
        .limit(1);
      if ((recentRequest || []).length > 0) {
        return json({ ok: false, code: "rate_limited", error: "Ja existe uma solicitacao recente para este e-mail. Aguarde alguns minutos antes de tentar novamente." }, 429);
      }

      await createOrUpdateAuthUser(admin, email, password, name, "pending");
      const { error } = await admin.from("access_requests").upsert({
        organization_id: organizationId,
        email,
        name,
        status: "pending",
        requested_at: new Date().toISOString(),
        decided_at: null,
        decided_by: null,
      }, { onConflict: "email" });
      if (error) throw error;
      await admin.from("notifications").insert({
        organization_id: organizationId,
        role_target: "admin",
        type: "access",
        title: "Usuário pendente de aprovação",
        message: `${name || email} solicitou acesso`,
        related_entity: "access_request",
        related_entity_id: email,
        priority: "normal",
      });
      await queueAccessRequestEmail(admin, organizationId, email, name).catch(() => null);
      return json({ ok: true, email_queued: true });
    }

    if (action === "manual-create") {
      const actor = await requireAdmin(req, admin);
      const role = String(body.role || "Edicao");
      await assertUserCapacity(admin, actor.organizationId, email);
      await createOrUpdateAuthUser(admin, email, password, name, "approved");
      const approvedAt = new Date().toISOString();
      const { error: approvedError } = await admin.from("approved_users").upsert({
        organization_id: actor.organizationId,
        email,
        role,
        approved_at: approvedAt,
      }, { onConflict: "email" });
      if (approvedError) throw approvedError;
      await admin.from("access_requests").upsert({
        organization_id: actor.organizationId,
        email,
        name,
        status: "approved",
        requested_at: approvedAt,
        decided_at: approvedAt,
        decided_by: actor.email,
      }, { onConflict: "email" });
      await admin.from("organization_members").upsert({
        organization_id: actor.organizationId,
        user_email: email,
        role,
        status: "active",
        updated_at: approvedAt,
      }, { onConflict: "organization_id,user_email" });
      await queueCredentialsEmail(admin, actor.organizationId, email, name, password);
      return json({ ok: true });
    }

    if (action === "approve-request") {
      const actor = await requireAdmin(req, admin);
      const role = String(body.role || "Edicao");
      await assertUserCapacity(admin, actor.organizationId, email);
      const approvedAt = new Date().toISOString();
      const { data: request } = await admin
        .from("access_requests")
        .select("name")
        .eq("organization_id", actor.organizationId)
        .eq("email", email)
        .maybeSingle();
      const { error: approvedError } = await admin.from("approved_users").upsert({
        organization_id: actor.organizationId,
        email,
        role,
        approved_at: approvedAt,
      }, { onConflict: "email" });
      if (approvedError) throw approvedError;
      const { error: memberError } = await admin.from("organization_members").upsert({
        organization_id: actor.organizationId,
        user_email: email,
        role,
        status: "active",
        updated_at: approvedAt,
      }, { onConflict: "organization_id,user_email" });
      if (memberError) throw memberError;
      const { error: requestError } = await admin.from("access_requests").update({
        status: "approved",
        decided_at: approvedAt,
        decided_by: actor.email,
      }).eq("organization_id", actor.organizationId).eq("email", email);
      if (requestError) throw requestError;
      await queueWelcomeEmail(admin, actor.organizationId, email, request?.name || "");
      return json({ ok: true });
    }

    return json({ ok: false, error: "Acao invalida." }, 400);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
});

async function assertUserCapacity(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  candidateEmail: string,
) {
  const { data: existing } = await admin
    .from("organization_members")
    .select("user_email,status")
    .eq("organization_id", organizationId)
    .eq("user_email", candidateEmail)
    .maybeSingle();
  if (existing?.status === "active") return;

  const [
    { data: organization, error: organizationError },
    { data: memberRows, error: memberError },
    { data: approvedRows, error: approvedError },
  ] = await Promise.all([
    admin.from("organizations").select("plan_code").eq("id", organizationId).single(),
    admin.from("organization_members")
      .select("user_email")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    admin.from("approved_users")
      .select("email")
      .eq("organization_id", organizationId),
  ]);
  if (organizationError) throw organizationError;
  if (memberError) throw memberError;
  if (approvedError) throw approvedError;
  const { data: subscription } = await admin
    .from("organization_subscriptions")
    .select("plan_code")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const planCode = subscription?.plan_code || organization.plan_code;
  const { data: plan, error: planError } = await admin
    .from("subscription_plans")
    .select("limits")
    .eq("code", planCode)
    .single();
  if (planError) throw planError;
  const limit = Number(plan?.limits?.users || 0);
  const users = new Set([
    ...(memberRows || []).map((item) => String(item.user_email || "").toLowerCase()),
    ...(approvedRows || []).map((item) => String(item.email || "").toLowerCase()),
  ].filter(Boolean));
  if (users.has(candidateEmail)) return;
  if (limit > 0 && users.size >= limit) {
    throw new Error(`Limite de usuarios do plano atingido (${users.size} de ${limit}). Remova um usuario ou altere o plano.`);
  }
}

async function queueWelcomeEmail(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  email: string,
  name: string,
) {
  const { data: organization } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  const { data: queued, error } = await admin.from("saas_email_outbox").insert({
    organization_id: organizationId,
    recipient_email: email,
    template_code: "welcome",
    variables: {
      name: name || email.split("@")[0],
      company: organization?.name || "3D.AFT",
    },
  }).select("id,organization_id,recipient_email,template_code,variables,attempts").single();
  if (!error && queued) await sendQueuedEmail(admin, queued).catch(() => null);
}

async function queueCredentialsEmail(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  email: string,
  name: string,
  temporaryPassword: string,
) {
  const { data: organization } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  const loginUrl = Deno.env.get("INTERNAL_APP_URL")?.trim()
    || Deno.env.get("APP_URL")?.trim()
    || "";
  const { data: queued, error } = await admin.from("saas_email_outbox").insert({
    organization_id: organizationId,
    recipient_email: email,
    template_code: "user_credentials",
    variables: {
      name: name || email.split("@")[0],
      company: organization?.name || "Empresa",
      email,
      temporary_password: temporaryPassword,
      login_url: loginUrl,
    },
  }).select("id,organization_id,recipient_email,template_code,variables,attempts").single();
  if (error) throw error;
  await sendQueuedEmail(admin, queued).catch(() => null);
}

async function queueAccessRequestEmail(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  requesterEmail: string,
  requesterName: string,
) {
  const { data: organization } = await admin
    .from("organizations")
    .select("name,owner_email")
    .eq("id", organizationId)
    .maybeSingle();
  const recipientEmail = String(organization?.owner_email || "").trim().toLowerCase();
  if (!recipientEmail) return;
  const { data: queued, error } = await admin.from("saas_email_outbox").insert({
    organization_id: organizationId,
    recipient_email: recipientEmail,
    template_code: "access_request",
    variables: {
      company: organization?.name || "3D.AFT",
      name: requesterName || requesterEmail.split("@")[0],
      requester_email: requesterEmail,
    },
  }).select("id,organization_id,recipient_email,template_code,variables,attempts").single();
  if (error) throw error;
  await sendQueuedEmail(admin, queued).catch(() => null);
}

async function createOrUpdateAuthUser(
  admin: ReturnType<typeof createClient>,
  email: string,
  password: string,
  name: string,
  accessStatus: string,
) {
  const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = usersData.users.find((user) => String(user.email || "").toLowerCase() === email);
  const attributes = {
    password,
    email_confirm: true,
    user_metadata: { name, access_status: accessStatus },
  };
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, attributes);
    if (error) throw error;
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, ...attributes });
  if (error) throw error;
  return data.user;
}

function rewriteActionLink(actionLink: string, publicAppUrl?: string) {
  if (!publicAppUrl) return actionLink;
  try {
    const source = new URL(actionLink);
    const target = new URL(publicAppUrl);
    target.search = source.search;
    target.hash = source.hash;
    return target.toString();
  } catch {
    return actionLink;
  }
}

function cleanPublicAppUrl(value: string) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

async function requireAdmin(req: Request, admin: ReturnType<typeof createClient>) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Autenticacao obrigatoria.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) throw new Error("Sessao invalida.");
  const email = data.user.email.toLowerCase();
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id,role,status")
    .eq("user_email", email)
    .eq("status", "active")
    .limit(1);
  const membership = memberships?.[0];
  if (!membership || !["administrador", "admin", "owner"].includes(String(membership.role || "").toLowerCase())) {
    throw new Error("Apenas administrador pode criar acessos.");
  }
  return { email, organizationId: membership.organization_id };
}
