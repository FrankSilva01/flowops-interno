import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendQueuedEmail } from "../_shared/email.ts";
import { clientIp, corsHeadersFor } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function applyCors(req: Request) {
  for (const key of Object.keys(corsHeaders)) delete (corsHeaders as Record<string, string>)[key];
  Object.assign(corsHeaders, corsHeadersFor(req));
}

const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuracao do Supabase ausente.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanText(value: unknown, max = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "empresa";
}

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  try {
    if (req.method === "GET") return await listPlans(admin);
    if (req.method !== "POST") return respond({ ok: false, error: "Use GET ou POST." }, 405);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "register");
    if (action === "plans") return await listPlans(admin);
    if (action !== "register") return respond({ ok: false, error: "Acao invalida." }, 400);

    const companyName = cleanText(body.company_name, 100);
    const contactName = cleanText(body.contact_name, 100);
    const phone = cleanText(body.phone, 30);
    const email = cleanText(body.email, 180).toLowerCase();
    const password = String(body.password || "");
    const planCode = cleanText(body.plan_code, 40) || "free";
    if (companyName.length < 2) return respond({ ok: false, error: "Informe o nome da empresa." }, 400);
    if (contactName.length < 2) return respond({ ok: false, error: "Informe seu nome." }, 400);
    if (!email.includes("@")) return respond({ ok: false, error: "Informe um e-mail valido." }, 400);
    if (password.length < 8) return respond({ ok: false, error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    if (body.accepted_terms !== true) return respond({ ok: false, error: "Aceite os termos para continuar." }, 400);
    const ip = clientIp(req);
    await enforceRateLimit(admin, `public-signup-email:${email}`, 3, 60);
    await enforceRateLimit(admin, `public-signup-ip:${ip}`, 20, 60);

    const { data: recentSignups } = await admin
      .from("public_signup_events")
      .select("id")
      .eq("email", email)
      .gt("created_at", minutesAgo(60))
      .limit(3);
    if ((recentSignups || []).length >= 3) {
      return respond({ ok: false, code: "rate_limited", error: "Muitas tentativas recentes para este e-mail. Aguarde alguns minutos e tente novamente." }, 429);
    }

    const { data: plan, error: planError } = await admin.from("subscription_plans")
      .select("*").eq("code", planCode).eq("active", true).single();
    if (planError || !plan) return respond({ ok: false, error: "Plano indisponivel." }, 400);
    if (plan.code === "enterprise") {
      return respond({
        ok: false,
        code: "sales_required",
        error: "O plano Enterprise requer uma proposta comercial. Fale com nosso atendimento.",
      }, 400);
    }

    const { data: authUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    if (authUsers.users.some((user) => String(user.email || "").toLowerCase() === email)) {
      return respond({ ok: false, code: "email_exists", error: "Este e-mail ja possui uma conta. Use a tela de login." }, 409);
    }

    const { data: existingOrganization } = await admin
      .from("organizations")
      .select("id,name,slug,status,plan_code,trial_ends_at")
      .eq("owner_email", email)
      .maybeSingle();
    if (existingOrganization) {
      const now = new Date().toISOString();
      const paid = Number(plan.price_monthly || 0) > 0;
      const trialEnd = existingOrganization.trial_ends_at
        || (paid ? new Date(Date.now() + Math.max(Number(plan.trial_days || 14), 1) * 86400000).toISOString() : null);
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: contactName,
          company_name: existingOrganization.name || companyName,
          organization_id: existingOrganization.id,
          access_status: "approved",
        },
      });
      if (authError || !authData.user) throw authError || new Error("Nao foi possivel criar o usuario.");
      await Promise.all([
        admin.from("organizations").update({
          name: existingOrganization.name || companyName,
          status: existingOrganization.status === "pending" ? (paid ? "trial" : "active") : existingOrganization.status,
          plan_code: existingOrganization.plan_code || plan.code,
          contact_name: contactName,
          contact_phone: phone || null,
          trial_ends_at: trialEnd,
          updated_at: now,
        }).eq("id", existingOrganization.id),
        admin.from("organization_members").upsert({
          organization_id: existingOrganization.id,
          user_email: email,
          role: "Administrador",
          status: "active",
          updated_at: now,
        }, { onConflict: "organization_id,user_email" }),
        admin.from("approved_users").upsert({
          organization_id: existingOrganization.id,
          email,
          role: "Administrador",
          approved_at: now,
        }, { onConflict: "email" }),
        admin.from("organization_subscriptions").upsert({
          organization_id: existingOrganization.id,
          plan_code: existingOrganization.plan_code || plan.code,
          status: paid ? "trial" : "free",
          provider: paid ? "mercado_pago" : "manual",
          trial_start: paid ? now : null,
          trial_end: trialEnd,
          current_period_start: now,
          current_period_end: trialEnd,
          metadata: { source: "landing_page_repair", card_required: false },
        }, { onConflict: "organization_id" }),
      ]);
      await queueWelcome(admin, existingOrganization.id, email, contactName, existingOrganization.name || companyName).catch(() => null);
      return respond({
        ok: true,
        repaired: true,
        organization: { id: existingOrganization.id, name: existingOrganization.name || companyName, slug: existingOrganization.slug },
        plan: { code: plan.code, name: plan.name, paid, trial_days: Number(plan.trial_days || 0), trial_end: trialEnd },
        login_url: Deno.env.get("INTERNAL_APP_URL") || Deno.env.get("APP_URL") || "",
      }, 200);
    }

    const slugBase = slugify(companyName);
    let slug = slugBase;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${slugBase}-${attempt + 2}`;
    }

    let createdUserId = "";
    let organizationId = "";
    try {
      const paid = Number(plan.price_monthly || 0) > 0;
      const trialDays = paid ? Math.max(Number(plan.trial_days || 14), 1) : 0;
      const nowDate = new Date();
      const trialEnd = paid
        ? new Date(nowDate.getTime() + trialDays * 86400000).toISOString()
        : null;
      const { data: organization, error: organizationError } = await admin.from("organizations").insert({
        name: companyName,
        slug,
        status: paid ? "trial" : "active",
        plan_code: plan.code,
        owner_email: email,
        contact_name: contactName,
        contact_phone: phone || null,
        trial_ends_at: trialEnd,
        settings: { onboarding_source: "landing_page", onboarding_step: "account_created", card_required: false },
      }).select("id").single();
      if (organizationError) throw organizationError;
      organizationId = organization.id;

      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: contactName, company_name: companyName, organization_id: organizationId, access_status: "approved" },
      });
      if (authError || !authData.user) throw authError || new Error("Nao foi possivel criar o usuario.");
      createdUserId = authData.user.id;

      const now = new Date().toISOString();
      const results = await Promise.all([
        admin.from("organization_members").insert({
          organization_id: organizationId, user_email: email, role: "Administrador", status: "active", updated_at: now,
        }),
        admin.from("approved_users").insert({
          organization_id: organizationId, email, role: "Administrador", approved_at: now,
        }),
        admin.from("organization_subscriptions").insert({
          organization_id: organizationId,
          plan_code: plan.code,
          status: paid ? "trial" : "free",
          provider: paid ? "mercado_pago" : "manual",
          trial_start: paid ? now : null,
          trial_end: trialEnd,
          current_period_start: now,
          current_period_end: trialEnd,
          metadata: { source: "landing_page", card_required: false },
        }),
      ]);
      const rowError = results.find((item) => item.error)?.error;
      if (rowError) throw rowError;

      await admin.from("public_signup_events").insert({
        organization_id: organizationId, email, plan_code: plan.code, status: "created",
        metadata: { company_name: companyName, contact_name: contactName },
      });
      await admin.from("platform_notifications").insert({
        type: "company", title: "Nova empresa cadastrada",
        message: `${companyName} criou uma conta no plano ${plan.name}.`,
        related_entity: "organization", related_entity_id: organizationId,
        organization_id: organizationId, priority: "normal",
      });
      await queueWelcome(admin, organizationId, email, contactName, companyName).catch(async (emailError) => {
        await admin.from("saas_email_delivery_logs").insert({
          organization_id: organizationId,
          recipient_email: email,
          template_code: "welcome",
          provider: "brevo",
          status: "failed",
          attempt: 1,
          error_message: emailError instanceof Error ? emailError.message : String(emailError),
          response_payload: { source: "public-onboarding" },
        }).catch(() => null);
      });
      return respond({
        ok: true,
        organization: { id: organizationId, name: companyName, slug },
        plan: { code: plan.code, name: plan.name, paid, trial_days: trialDays, trial_end: trialEnd },
        login_url: Deno.env.get("INTERNAL_APP_URL") || Deno.env.get("APP_URL") || "",
      }, 201);
    } catch (error) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => null);
      if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
      throw error;
    }
  } catch (error) {
    return respond({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function listPlans(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from("subscription_plans")
    .select("code,name,price_monthly,currency,limits,features,marketing_description,marketing_highlights,marketing_badge,marketing_cta,marketing_featured,display_order")
    .eq("active", true).order("display_order", { ascending: true }).order("price_monthly", { ascending: true });
  if (error) throw error;
  return respond({ ok: true, plans: data || [] });
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

async function queueWelcome(
  admin: ReturnType<typeof createClient>, organizationId: string, email: string, name: string, company: string,
) {
  const loginUrl = Deno.env.get("INTERNAL_APP_URL") || Deno.env.get("APP_URL") || "";
  const { data: queued, error } = await admin.from("saas_email_outbox").insert({
    organization_id: organizationId, recipient_email: email, template_code: "welcome",
    variables: { name, company, login_url: loginUrl },
  }).select("id,organization_id,recipient_email,template_code,variables,attempts").single();
  if (error) throw error;
  await sendQueuedEmail(admin, queued).catch(() => null);
}
