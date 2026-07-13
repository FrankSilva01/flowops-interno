import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendQueuedEmail } from "../_shared/email.ts";
import { corsHeadersFor } from "../_shared/http.ts";
import { syncMercadoPagoPlan } from "../_shared/mercado-pago.ts";
import { sanitizeHtml } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function applyCors(req: Request) {
  for (const key of Object.keys(corsHeaders)) delete (corsHeaders as Record<string, string>)[key];
  Object.assign(corsHeaders, corsHeadersFor(req));
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  // service_role e necessario no painel master para administrar empresas,
  // planos e logs globais. O acesso e bloqueado por requirePlatformAdmin().
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuracao Supabase ausente.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requirePlatformAdmin(req: Request) {
  const token = req.headers.get("Authorization").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sessao ausente.");
  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user.email) throw new Error("Sessao invalida.");
  const email = userData.user.email.toLowerCase();
  const { data, error } = await admin
    .from("platform_admins")
    .select("role")
    .eq("user_email", email)
    .maybeSingle();
  if (error || !data) throw new Error("Acesso restrito ao administrador da plataforma.");
  return { admin, email, role: data.role };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function templateCode(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

async function writeAdminLog(
  admin: ReturnType<typeof createClient>,
  actorEmail: string,
  action: string,
  organizationId: string | null,
  message: string,
  oldValue: unknown = null,
  newValue: unknown = null,
) {
  await admin.from("platform_admin_logs").insert({
    actor_email: actorEmail,
    action,
    organization_id: organizationId,
    entity_type: organizationId ? "organization" : "platform",
    entity_id: organizationId,
    old_value: oldValue,
    new_value: newValue,
    message,
  });
}

async function queueEmail(
  admin: ReturnType<typeof createClient>,
  organizationId: string | null,
  recipientEmail: string,
  templateCode: string,
  variables: Record<string, unknown> = {},
) {
  if (!recipientEmail) return;
  const { data } = await admin.from("saas_email_outbox").insert({
    organization_id: organizationId,
    recipient_email: recipientEmail,
    template_code: templateCode,
    variables,
  }).select("id").single();
  if (!data.id) return;
  const { data: item } = await admin
    .from("saas_email_outbox")
    .select("id,organization_id,recipient_email,template_code,variables,attempts")
    .eq("id", data.id)
    .single();
  if (item) await sendQueuedEmail(admin, item).catch(() => null);
}

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, email } = await requirePlatformAdmin(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || new URL(req.url).searchParams.get("action") || "summary");

    if (action === "summary" || action === "list-organizations") {
      const { data: organizations, error } = await admin
        .from("organizations")
        .select("id,name,slug,status,plan_code,owner_email,contact_name,contact_phone,trial_ends_at,settings,created_at,updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const organizationIds = (organizations || []).map((item) => item.id);
      const approvedUsers = organizationIds.length
        ? await admin
          .from("approved_users")
          .select("organization_id,email,role,approved_at")
          .in("organization_id", organizationIds)
        : { data: [], error: null };
      if (approvedUsers.error) throw approvedUsers.error;
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const [members, connectors, subscriptions, plans, sales, backups, listings, leadFiles, adminLogs, supportTickets, announcements, changelog, payments, emailTemplates, platformNotifications, emailDeliveryLogs, planChangeRequests] = await Promise.all([
        organizationIds.length ?
          admin.from("organization_members").select("organization_id,user_email,role,status,created_at").in("organization_id", organizationIds)
          : Promise.resolve({ data: [], error: null }),
        organizationIds.length ?
          admin.from("organization_connectors").select("organization_id,marketplace,status,external_account_name,last_sync_at,last_error,updated_at").in("organization_id", organizationIds)
          : Promise.resolve({ data: [], error: null }),
        organizationIds.length ?
          admin.from("organization_subscriptions").select("*").in("organization_id", organizationIds)
          : Promise.resolve({ data: [], error: null }),
        admin.from("subscription_plans").select("*").order("price_monthly", { ascending: true }),
        organizationIds.length ?
          admin.from("marketplace_order_links").select("organization_id,created_at").in("organization_id", organizationIds).gte("created_at", monthStart.toISOString())
          : Promise.resolve({ data: [], error: null }),
        organizationIds.length ?
          admin.from("backup_runs").select("organization_id,status,started_at,finished_at,size_bytes").in("organization_id", organizationIds).order("started_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        organizationIds.length ?
          admin.from("marketplace_listings").select("organization_id,marketplace,external_id,raw_payload").in("organization_id", organizationIds)
          : Promise.resolve({ data: [], error: null }),
        organizationIds.length ?
          admin.from("lead_files").select("organization_id,size_bytes").in("organization_id", organizationIds)
          : Promise.resolve({ data: [], error: null }),
        admin.from("platform_admin_logs").select("*").order("created_at", { ascending: false }).limit(200),
        admin.from("saas_support_tickets").select("*").order("created_at", { ascending: false }).limit(300),
        admin.from("saas_announcements").select("*").order("published_at", { ascending: false }).limit(100),
        admin.from("saas_changelog").select("*").order("published_at", { ascending: false }).limit(100),
        organizationIds.length ?
          admin.from("subscription_payments").select("*").in("organization_id", organizationIds).order("created_at", { ascending: false }).limit(500)
          : Promise.resolve({ data: [], error: null }),
        admin.from("saas_email_templates").select("code,name,subject,html_body,active,updated_at").order("name"),
        admin.from("platform_notifications").select("*").order("created_at", { ascending: false }).limit(300),
        admin.from("saas_email_delivery_logs").select("*").order("created_at", { ascending: false }).limit(500),
        admin.from("subscription_change_requests").select("*").order("created_at", { ascending: false }).limit(300),
      ]);
      if (members.error) throw members.error;
      if (connectors.error) throw connectors.error;
      if (subscriptions.error) throw subscriptions.error;
      if (plans.error) throw plans.error;
      if (sales.error) throw sales.error;
      if (backups.error) throw backups.error;
      if (listings.error) throw listings.error;
      if (leadFiles.error) throw leadFiles.error;
      if (adminLogs.error) throw adminLogs.error;
      if (supportTickets.error) throw supportTickets.error;
      if (announcements.error) throw announcements.error;
      if (changelog.error) throw changelog.error;
      if (payments.error) throw payments.error;
      if (emailTemplates.error) throw emailTemplates.error;
      if (platformNotifications.error) throw platformNotifications.error;
      if (emailDeliveryLogs.error) throw emailDeliveryLogs.error;
      if (planChangeRequests.error) throw planChangeRequests.error;
      const usage = (organizations || []).map((organization) => {
        const orgMembers = approvedUsers.data.filter((item) => item.organization_id === organization.id) || [];
        const orgConnectors = connectors.data.filter((item) => item.organization_id === organization.id) || [];
        const orgSales = sales.data.filter((item) => item.organization_id === organization.id) || [];
        const orgListings = listings.data.filter((item) => item.organization_id === organization.id) || [];
        const orgBackups = backups.data.filter((item) => item.organization_id === organization.id) || [];
        const orgLeadFiles = leadFiles.data.filter((item) => item.organization_id === organization.id) || [];
        const latestBackup = orgBackups[0] || null;
        return {
          organization_id: organization.id,
          active_users: orgMembers.length,
          imported_sales_month: orgSales.length,
          storage_bytes: [...orgLeadFiles, ...orgBackups].reduce((sum, item) => sum + Number(item.size_bytes || 0), 0),
          connected_marketplaces: orgConnectors.filter((item) => item.status === "connected").map((item) => item.marketplace),
          last_backup: latestBackup,
          onboarding: {
            organization_created: true,
            mercado_livre_connected: orgConnectors.some((item) => item.marketplace === "Mercado Livre" && item.status === "connected"),
            listings_imported: orgListings.length > 0,
            first_sale_imported: orgSales.length > 0,
            storefront_configured: orgListings.some((item) => Boolean(item.raw_payload.showcase_enabled)),
          },
        };
      });
      return respond({
        ok: true,
        organizations: organizations || [],
        members: members.data || [],
        connectors: connectors.data || [],
        subscriptions: subscriptions.data || [],
        plans: plans.data || [],
        approved_users: approvedUsers.data || [],
        usage,
        admin_logs: adminLogs.data || [],
        support_tickets: supportTickets.data || [],
        announcements: announcements.data || [],
        changelog: changelog.data || [],
        payments: payments.data || [],
        email_templates: emailTemplates.data || [],
        platform_notifications: platformNotifications.data || [],
        email_delivery_logs: emailDeliveryLogs.data || [],
        plan_change_requests: planChangeRequests.data || [],
      });
    }

    if (action === "create-organization") {
      const name = String(body.name || "").trim();
      const ownerEmail = String(body.owner_email || "").trim().toLowerCase();
      const temporaryPassword = String(body.temporary_password || "");
      if (!name || !ownerEmail) throw new Error("Nome e e-mail do responsavel sao obrigatorios.");
      if (temporaryPassword && temporaryPassword.length < 6) throw new Error("A senha temporaria precisa ter pelo menos 6 caracteres.");
      const slug = slugify(String(body.slug || name));
      if (!slug) throw new Error("Identificador da empresa invalido.");
      const now = new Date().toISOString();
      const planCode = String(body.plan_code || "free");
      const isFree = planCode === "free";
      const { data: organization, error } = await admin.from("organizations").insert({
        name,
        slug,
        owner_email: ownerEmail,
        contact_name: String(body.contact_name || "").trim() || null,
        contact_phone: String(body.contact_phone || "").trim() || null,
        plan_code: planCode,
        status: isFree ? "active" : "pending",
        settings: { created_by: email },
        updated_at: now,
      }).select("*").single();
      if (error) throw error;
      let userId: string | null = null;
      if (temporaryPassword) {
        const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
          email: ownerEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { name: String(body.contact_name || name), organization_id: organization.id },
        });
        if (createUserError && !/already|registered|exists/i.test(createUserError.message)) throw createUserError;
        userId = createdUser.user.id || null;
      }
      const { error: memberError } = await admin.from("organization_members").insert({
        organization_id: organization.id,
        user_email: ownerEmail,
        user_id: userId,
        role: "Administrador",
        status: "active",
        updated_at: now,
      });
      if (memberError) throw memberError;
      await admin.from("approved_users").upsert({
        organization_id: organization.id,
        email: ownerEmail,
        role: "Administrador",
        approved_at: now,
      }, { onConflict: "email" });
      const { error: connectorError } = await admin.from("organization_connectors").insert([
        { organization_id: organization.id, marketplace: "Mercado Livre", status: "not_connected", mode: "oauth" },
        { organization_id: organization.id, marketplace: "Shopee", status: "awaiting_credentials", mode: "oauth" },
        { organization_id: organization.id, marketplace: "Amazon", status: "awaiting_credentials", mode: "oauth" },
      ]);
      if (connectorError) throw connectorError;
      const { error: subscriptionError } = await admin.from("organization_subscriptions").insert({
        organization_id: organization.id,
        plan_code: planCode,
        status: isFree ? "free" : "pending",
        provider: "manual",
        administrative_note: "Cadastro administrativo.",
        metadata: { created_by: email },
        updated_at: now,
      });
      if (subscriptionError) throw subscriptionError;
      await queueEmail(admin, organization.id, ownerEmail, "welcome", {
        name: String(body.contact_name || name),
        company: name,
      });
      await writeAdminLog(admin, email, "organization_created", organization.id, `Empresa ${name} criada.`, null, organization);
      return respond({ ok: true, organization }, 201);
    }

    if (action === "update-subscription") {
      const organizationId = String(body.organization_id || "");
      const planCode = String(body.plan_code || "");
      const subscriptionStatus = String(body.status || "");
      if (!organizationId || !planCode || !subscriptionStatus) {
        throw new Error("Empresa, plano e status da assinatura sao obrigatorios.");
      }
      const now = new Date().toISOString();
      const customPriceMonthly = body.custom_price_monthly === null || body.custom_price_monthly === ""
        ? null
        : Number(body.custom_price_monthly);
      const { data: previousSubscription } = await admin
        .from("organization_subscriptions")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const updates = {
        plan_code: planCode,
        status: subscriptionStatus,
        provider: String(body.provider || "manual"),
        trial_end: body.trial_end || null,
        current_period_end: body.current_period_end || null,
        next_payment_at: body.next_payment_at || null,
        grace_ends_at: body.grace_ends_at || null,
        cancel_at_period_end: Boolean(body.cancel_at_period_end),
        administrative_note: String(body.administrative_note || "").trim() || null,
        metadata: {
          ...(previousSubscription.metadata || {}),
          custom_price_monthly: Number.isFinite(customPriceMonthly) && customPriceMonthly > 0 ? customPriceMonthly : null,
        },
        updated_at: now,
      };
      const { data: subscription, error: subscriptionError } = await admin
        .from("organization_subscriptions")
        .upsert(
          { organization_id: organizationId, ...updates },
          { onConflict: "organization_id" },
        )
        .select("*")
        .single();
      if (subscriptionError) throw subscriptionError;
      const organizationStatus =
        subscriptionStatus === "suspended" || subscriptionStatus === "cancelled"
          ? "suspended"
          : subscriptionStatus === "trial"
            ? "trial"
            : "active";
      const { error: organizationError } = await admin
        .from("organizations")
        .update({
          plan_code: planCode,
          status: organizationStatus,
          trial_ends_at: body.trial_end || null,
          updated_at: now,
        })
        .eq("id", organizationId);
      if (organizationError) throw organizationError;
      await admin
        .from("subscription_change_requests")
        .update({
          status: "approved",
          decided_at: now,
          decided_by: email,
        })
        .eq("organization_id", organizationId)
        .eq("requested_plan_code", planCode)
        .eq("status", "pending");
      const { data: organization } = await admin
        .from("organizations")
        .select("name,owner_email")
        .eq("id", organizationId)
        .single();
      const previousStatus = String(previousSubscription.status || "");
      const emailTemplate = subscriptionStatus === "suspended"
        ? "subscription_suspended"
        : subscriptionStatus === "past_due"
          ? "payment_declined"
          : subscriptionStatus === "active" && ["pending", "past_due"].includes(previousStatus)
            ? "payment_approved"
        : previousStatus === "suspended" && ["active", "trial"].includes(subscriptionStatus)
          ? "subscription_reactivated"
          : null;
      if (emailTemplate && organization.owner_email) {
        await queueEmail(admin, organizationId, organization.owner_email, emailTemplate, {
          company: organization.name,
          plan: planCode,
        });
      }
      await writeAdminLog(
        admin,
        email,
        "subscription_updated",
        organizationId,
        `Assinatura alterada para ${planCode} (${subscriptionStatus}).`,
        previousSubscription,
        subscription,
      );
      return respond({ ok: true, subscription });
    }

    if (action === "update-plan") {
      const code = String(body.code || "");
      if (!code) throw new Error("Plano nao informado.");
      const { data: previous } = await admin.from("subscription_plans").select("*").eq("code", code).single();
      const nextAmount = Number(body.price_monthly ?? previous.price_monthly);
      const mercadoPago = await syncMercadoPagoPlan({
        id: previous.mercado_pago_plan_id,
        code,
        name: String(body.name || previous.name),
        amount: nextAmount,
        currency: previous.currency,
        active: body.active !== false,
      });
      const updates = {
        name: String(body.name || previous.name),
        price_monthly: nextAmount,
        trial_days: Number(body.trial_days ?? previous.trial_days),
        limits: body.limits || previous.limits,
        features: body.features || previous.features,
        active: body.active !== false,
        marketing_description: String(body.marketing_description ?? previous.marketing_description ?? ""),
        marketing_highlights: Array.isArray(body.marketing_highlights) ? body.marketing_highlights : previous.marketing_highlights,
        marketing_badge: String(body.marketing_badge ?? previous.marketing_badge ?? "") || null,
        marketing_cta: String(body.marketing_cta ?? previous.marketing_cta ?? "Comecar agora"),
        marketing_featured: body.marketing_featured === true,
        display_order: Number(body.display_order ?? previous.display_order ?? 100),
        mercado_pago_plan_id: mercadoPago.id || previous.mercado_pago_plan_id,
        mercado_pago_init_point: mercadoPago.init_point || previous.mercado_pago_init_point,
        mercado_pago_status: mercadoPago.status || previous.mercado_pago_status,
        mercado_pago_synced_at: mercadoPago.skipped ? previous.mercado_pago_synced_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: plan, error: planError } = await admin
        .from("subscription_plans")
        .update(updates)
        .eq("code", code)
        .select("*")
        .single();
      if (planError) throw planError;
      await writeAdminLog(admin, email, "plan_updated", null, `Plano ${code} alterado.`, previous, plan);
      return respond({ ok: true, plan });
    }

    if (action === "access-organization") {
      const organizationId = String(body.organization_id || "");
      const reason = String(body.reason || "").trim();
      if (!organizationId) throw new Error("Empresa nao informada.");
      if (reason.length < 5) throw new Error("Informe o motivo do acesso de suporte.");
      const { data: organization, error: organizationError } = await admin
        .from("organizations")
        .select("id,name")
        .eq("id", organizationId)
        .single();
      if (organizationError) throw organizationError;
      await writeAdminLog(admin, email, "support_access", organizationId, `Acesso de suporte aberto para ${organization.name}. Motivo: ${reason}`, null, { reason });
      return respond({ ok: true, organization_id: organizationId });
    }

    if (action === "create-announcement") {
      const title = String(body.title || "").trim();
      const message = String(body.message || "").trim();
      if (!title || !message) throw new Error("Titulo e mensagem sao obrigatorios.");
      const organizationId = body.organization_id ? String(body.organization_id) : null;
      const { data, error } = await admin.from("saas_announcements").insert({
        title,
        message,
        category: String(body.category || "AtualizaÃ§Ã£o"),
        priority: String(body.priority || "normal"),
        organization_id: organizationId,
        expires_at: body.expires_at || null,
        created_by: email,
      }).select("*").single();
      if (error) throw error;
      const targets = organizationId ? [organizationId] : ((await admin.from("organizations").select("id")).data || []).map((item) => item.id);
      if (targets.length) {
        await admin.from("notifications").insert(targets.map((targetId) => ({
          organization_id: targetId,
          role_target: "all",
          type: "announcement",
          title,
          message,
          related_entity: "announcement",
          related_entity_id: data.id,
          priority: data.priority,
        })));
      }
      let ownerQuery = admin.from("organizations").select("id,name,owner_email").not("owner_email", "is", null);
      if (organizationId) ownerQuery = ownerQuery.eq("id", organizationId);
      const { data: emailTargets } = await ownerQuery;
      if ((emailTargets || []).length) {
        for (const target of emailTargets || []) {
          await queueEmail(admin, target.id, target.owner_email, "global_announcement", {
            title,
            message,
            company: target.name,
          }).catch(async (emailError) => {
            try {
              await admin.from("saas_email_delivery_logs").insert({
                organization_id: target.id,
                recipient_email: target.owner_email,
                template_code: "global_announcement",
                provider: "brevo",
                status: "failed",
                attempt: 1,
                error_message: emailError instanceof Error ? emailError.message : String(emailError),
                response_payload: { source: "create-announcement" },
              });
            } catch {
              // Announcement delivery remains best effort.
            }
          });
        }
      }
      await writeAdminLog(admin, email, "announcement_published", organizationId, `Comunicado publicado: ${title}.`, null, data);
      return respond({ ok: true, announcement: data });
    }

    if (action === "upsert-email-template") {
      const code = templateCode(String(body.code || ""));
      const name = String(body.name || "").trim().slice(0, 120);
      const subject = String(body.subject || "").trim().slice(0, 180);
      const htmlBody = sanitizeHtml(String(body.html_body || ""));
      if (!code || code.length < 3) throw new Error("Informe um codigo de template valido.");
      if (!name || !subject || !htmlBody) throw new Error("Nome, assunto e corpo HTML sao obrigatorios.");
      const { data: previous } = await admin.from("saas_email_templates").select("*").eq("code", code).maybeSingle();
      const { data: template, error } = await admin.from("saas_email_templates").upsert({
        code,
        name,
        subject,
        html_body: htmlBody,
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "code" }).select("*").single();
      if (error) throw error;
      await writeAdminLog(admin, email, previous ? "email_template_updated" : "email_template_created", null, `Template de e-mail ${code} salvo.`, previous, template);
      return respond({ ok: true, template });
    }

    if (action === "mark-platform-notification-read") {
      const notificationId = String(body.notification_id || "");
      if (!notificationId) throw new Error("Notificacao nao informada.");
      const { error } = await admin.from("platform_notifications").update({
        is_read: true,
        read_at: new Date().toISOString(),
      }).eq("id", notificationId);
      if (error) throw error;
      return respond({ ok: true });
    }

    if (action === "mark-all-platform-notifications-read") {
      const { error } = await admin.from("platform_notifications").update({
        is_read: true,
        read_at: new Date().toISOString(),
      }).is("dismissed_at", null).eq("is_read", false);
      if (error) throw error;
      return respond({ ok: true });
    }

    if (action === "dismiss-read-platform-notifications") {
      const { error } = await admin.from("platform_notifications").update({
        dismissed_at: new Date().toISOString(),
      }).eq("is_read", true).is("dismissed_at", null);
      if (error) throw error;
      return respond({ ok: true });
    }

    if (action === "retry-email") {
      const outboxId = String(body.outbox_id || "");
      if (!outboxId) throw new Error("E-mail nao informado.");
      const { error } = await admin.from("saas_email_outbox").update({
        status: "retry",
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", outboxId);
      if (error) throw error;
      return respond({ ok: true });
    }

    if (action === "create-changelog") {
      const version = String(body.version || "").trim();
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim();
      if (!version || !title || !description) throw new Error("Versao, titulo e descricao sao obrigatorios.");
      const { data, error } = await admin.from("saas_changelog").insert({
        version,
        title,
        description,
        category: String(body.category || "Plataforma"),
        created_by: email,
      }).select("*").single();
      if (error) throw error;
      await writeAdminLog(admin, email, "changelog_published", null, `Changelog ${version} publicado.`, null, data);
      return respond({ ok: true, changelog: data });
    }

    if (action === "update-support-ticket") {
      const ticketId = String(body.ticket_id || "");
      if (!ticketId) throw new Error("Ticket nao informado.");
      const updates = {
        status: String(body.status || "Em anÃ¡lise"),
        priority: String(body.priority || "Normal"),
        admin_response: String(body.admin_response || "").trim() || null,
        assigned_to: email,
        updated_at: new Date().toISOString(),
        closed_at: String(body.status || "") === "Fechado" ? new Date().toISOString() : null,
      };
      const { data, error } = await admin.from("saas_support_tickets").update(updates).eq("id", ticketId).select("*").single();
      if (error) throw error;
      if (data.admin_response) {
        await admin.from("notifications").insert({
          organization_id: data.organization_id,
          role_target: "all",
          type: "support",
          title: `Suporte: ${data.subject}`,
          message: data.admin_response,
          related_entity: "support_ticket",
          related_entity_id: data.id,
        });
      }
      await writeAdminLog(admin, email, "support_ticket_updated", data.organization_id, `Ticket ${data.subject} atualizado para ${data.status}.`, null, data);
      return respond({ ok: true, ticket: data });
    }

    if (action === "update-organization") {
      const organizationId = String(body.organization_id || "");
      if (!organizationId) throw new Error("Empresa nao informada.");
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const field of ["name", "status", "plan_code", "owner_email", "contact_name", "contact_phone", "trial_ends_at"]) {
        if (body[field] !== undefined) updates[field] = body[field] || null;
      }
      const { data: previous } = await admin.from("organizations").select("*").eq("id", organizationId).single();
      const { data, error } = await admin.from("organizations").update(updates).eq("id", organizationId).select("*").single();
      if (error) throw error;
      await writeAdminLog(admin, email, "organization_updated", organizationId, `Empresa ${data.name} atualizada.`, previous, data);
      return respond({ ok: true, organization: data });
    }

    if (action === "add-member") {
      const organizationId = String(body.organization_id || "");
      const userEmail = String(body.user_email || "").trim().toLowerCase();
      if (!organizationId || !userEmail) throw new Error("Empresa e e-mail sao obrigatorios.");
      const [{ data: organization }, { data: subscription }, { count }] = await Promise.all([
        admin.from("organizations").select("plan_code").eq("id", organizationId).single(),
        admin.from("organization_subscriptions").select("plan_code").eq("organization_id", organizationId).maybeSingle(),
        admin.from("organization_members").select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId).eq("status", "active"),
      ]);
      const { data: plan } = await admin.from("subscription_plans")
        .select("limits").eq("code", subscription.plan_code || organization.plan_code).single();
      const limit = Number(plan.limits.users || 0);
      if (limit > 0 && Number(count || 0) >= limit) {
        throw new Error(`Limite de usuarios do plano atingido (${count} de ${limit}).`);
      }
      const { error } = await admin.from("organization_members").upsert({
        organization_id: organizationId,
        user_email: userEmail,
        role: String(body.role || "Leitura"),
        status: "active",
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,user_email" });
      if (error) throw error;
      return respond({ ok: true });
    }

    throw new Error("Acao administrativa desconhecida.");
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : JSON.stringify(error);
    const status = /restrito|sessao/i.test(message) ? 401 : 400;
    return respond({ ok: false, error: message }, status);
  }
});

