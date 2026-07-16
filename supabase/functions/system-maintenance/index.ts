import { adminClient, corsHeaders, ensureMlFiscalAlerts, getMlAccountByUserId, importMlOrderWithRetry, json, logSync } from "../_shared/marketplace.ts";
import { dispatchPendingEmails } from "../_shared/email.ts";
import { mercadoPagoRequest } from "../_shared/mercado-pago.ts";
import { reconcileMercadoPagoSubscription } from "../_shared/subscription-billing.ts";

const BACKUP_TABLES = [
  "organizations",
  "organization_members",
  "orders",
  "cash_entries",
  "materials",
  "crm_leads",
  "lead_files",
  "custom_tags",
  "approved_users",
  "access_requests",
  "marketplace_accounts",
  "marketplace_listings",
  "marketplace_order_links",
  "marketplace_documents",
  "marketplace_document_versions",
  "marketplace_sync_log",
  "marketplace_reviews",
  "integration_jobs",
  "privacy_consents",
  "organization_data_requests",
  "storefront_events",
  "audit_events",
  "notifications",
];

const SYSTEM_TABLES = [
  "orders",
  "cash_entries",
  "materials",
  "crm_leads",
  "lead_files",
  "custom_tags",
];

const STOREFRONT_TABLES = [
  "marketplace_listings",
  "marketplace_reviews",
  "storefront_events",
];

const RESTORABLE_TABLES = new Set(BACKUP_TABLES.filter((table) =>
  !["audit_events", "storefront_events", "marketplace_sync_log"].includes(table)
));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || "scheduled");
    if (action === "export") {
      const actor = await requireAdmin(req);
      const scope = String(body.scope || "database");
      const tables = scope === "system"
        ? SYSTEM_TABLES
        : scope === "storefront"
          ? STOREFRONT_TABLES
          : BACKUP_TABLES;
      return json({ ok: true, snapshot: await createSnapshot(tables, actor, scope) });
    }
    if (action === "download") {
      await requireAdmin(req);
      return json({ ok: true, ...await createBackupDownload(String(body.backup_id || "")) });
    }
    if (action === "simulate-restore") {
      await requireAdmin(req);
      return json({ ok: true, ...await simulateRestore(body.snapshot) });
    }
    if (action === "restore") {
      const actor = await requireAdmin(req);
      return json({ ok: true, ...await restoreSnapshot(body.snapshot, actor) });
    }
    const actor = action === "manual" ? await requireAdmin(req) : "Sistema";
    const token = await maintainMlToken();
    const subscriptions = await maintainSubscriptions();
    const emails = await dispatchPendingEmails(adminClient());
    const integrationJobs = await processIntegrationJobs();
    const logs = await cleanupOperationalLogs();
    const governance = await cleanupGovernanceRecords();
    const marketplaceDocuments = await reconcileMarketplaceDocuments();
    const backup = await createBackup(actor, action === "manual");
    return json({ ok: true, token, subscriptions, emails, integration_jobs: integrationJobs, logs, governance, marketplace_documents: marketplaceDocuments, backup });
  } catch (error) {
    await createSystemNotification("Backup falhou", error.message || String(error), "high").catch(() => {});
    return json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }
});

async function processIntegrationJobs() {
  const supabase = adminClient();
  const { data: jobs, error } = await supabase.from("integration_jobs")
    .select("*").in("status", ["pending", "retry"]).lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at").limit(25);
  if (error) throw error;
  let completed = 0;
  let retry = 0;
  let deadLetter = 0;
  for (const job of jobs || []) {
    const attempt = Number(job.attempts || 0) + 1;
    await supabase.from("integration_jobs").update({ status: "processing", attempts: attempt, locked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    try {
      if (job.marketplace !== "Mercado Livre" || job.job_type !== "order_webhook") throw new Error("Tipo de job sem processador configurado.");
      const orderId = String(job.payload?.resource || "").split("/").filter(Boolean).pop();
      if (!orderId) throw new Error("Pedido ausente no payload do job.");
      const account = await getMlAccountByUserId(undefined, job.organization_id);
      await importMlOrderWithRetry(orderId, account);
      await supabase.from("integration_jobs").update({ status: "completed", completed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      completed += 1;
    } catch (jobError) {
      const terminal = attempt >= Number(job.max_attempts || 5);
      await supabase.from("integration_jobs").update({
        status: terminal ? "dead_letter" : "retry",
        last_error: String(jobError.message || jobError).slice(0, 1000),
        next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * (2 ** attempt)) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (terminal) deadLetter += 1; else retry += 1;
    }
  }
  return { processed: (jobs || []).length, completed, retry, dead_letter: deadLetter };
}

async function cleanupOperationalLogs() {
  const { data, error } = await adminClient().rpc("cleanup_sensitive_logs");
  if (error) throw error;
  return data || {};
}

async function cleanupGovernanceRecords() {
  const { data, error } = await adminClient().rpc("cleanup_governance_records");
  if (error) throw error;
  return data || {};
}

async function reconcileMarketplaceDocuments() {
  const supabase = adminClient();
  const { data: organizations, error } = await supabase.from("marketplace_accounts")
    .select("organization_id")
    .eq("marketplace", "Mercado Livre");
  if (error) throw error;
  const organizationIds = [...new Set((organizations || []).map((item) => item.organization_id).filter(Boolean))];
  let checked = 0;
  let errors = 0;
  for (const organizationId of organizationIds) {
    try {
      const account = await getMlAccountByUserId(undefined, organizationId);
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: links, error: linksError } = await supabase.from("marketplace_order_links")
        .select("external_order_id,internal_order_id,raw_payload")
        .eq("organization_id", organizationId)
        .eq("marketplace", "Mercado Livre")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (linksError) throw linksError;
      for (const link of links || []) {
        const order = { ...(link.raw_payload || {}), id: link.external_order_id };
        await ensureMlFiscalAlerts(order, account, link.internal_order_id).catch(() => { errors += 1; });
        checked += 1;
      }
    } catch (organizationError) {
      errors += 1;
      await logSync("Mercado Livre", "document-reconciliation", "error", organizationError.message || String(organizationError), {
        organizationId,
        actorEmail: "Sistema",
      }).catch(() => {});
    }
  }
  return { organizations: organizationIds.length, checked, errors };
}

async function maintainMlToken() {
  try {
    const account = await getMlAccountByUserId();
    return { ok: true, expires_at: account.token_expires_at };
  } catch (error) {
    await logSync("Mercado Livre", "token-refresh", "error", error.message || String(error), {
      actorEmail: "Sistema",
    }).catch(() => {});
    return { ok: false, error: error.message || String(error) };
  }
}

async function maintainSubscriptions() {
  const supabase = adminClient();
  const scheduled = await applyScheduledPlanChanges(supabase);
  const { data: subscriptions, error } = await supabase
    .from("organization_subscriptions")
    .select("*,organizations(name,owner_email),subscription_plans!organization_subscriptions_plan_code_fkey(name,price_monthly)")
    .in("status", ["trial", "active", "past_due", "pending"]);
  if (error) throw error;
  let trialAlerts = 0;
  let renewalAlerts = 0;
  let billingReconciled = 0;
  let billingErrors = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const subscription of subscriptions || []) {
    const dueTime = new Date(subscription.next_payment_at || subscription.current_period_end || 0).getTime();
    const lastReconciled = new Date(subscription.billing_reconciled_at || 0).getTime();
    const shouldReconcile = subscription.provider === "mercado_pago"
      && subscription.provider_subscription_id
      && (
        subscription.status === "past_due"
        || subscription.status === "pending"
        || (Number.isFinite(dueTime) && dueTime <= Date.now() + 86400000)
        || !Number.isFinite(lastReconciled)
        || lastReconciled <= Date.now() - 86400000
      );
    if (shouldReconcile) {
      try {
        await reconcileMercadoPagoSubscription(supabase, subscription);
        billingReconciled += 1;
      } catch (reconcileError) {
        billingErrors += 1;
        await supabase.from("audit_events").insert({
          organization_id: subscription.organization_id,
          actor_email: "Sistema",
          action: "subscription_billing_reconcile_error",
          entity_type: "subscription",
          entity_id: subscription.id,
          source: "system",
          metadata: {
            message: reconcileError.message || String(reconcileError),
          },
        }).catch(() => {});
      }
    }
    const isTrial = subscription.status === "trial";
    const renewalAt = isTrial ? subscription.trial_end : subscription.next_payment_at || subscription.current_period_end;
    if (!renewalAt) continue;
    const days = Math.max(0, Math.ceil((new Date(renewalAt).getTime() - Date.now()) / 86400000));
    if (!(isTrial ? [7, 3, 1, 0] : [7, 3, 1]).includes(days)) continue;

    const { data: latestPayment } = await supabase
      .from("subscription_payments")
      .select("payment_method,metadata,status")
      .eq("organization_id", subscription.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cardLastFour = latestPayment?.metadata?.card_last_four || latestPayment?.metadata?.last_four || "";
    const paymentMethod = cardLastFour ? `Cartão final ${cardLastFour}` : latestPayment?.payment_method || "";
    const hasPaymentMethod = Boolean(paymentMethod);
    const planName = subscription.subscription_plans?.name || subscription.plan_code;
    const amount = `R$ ${Number(subscription.subscription_plans?.price_monthly || 0).toFixed(2).replace(".", ",")}`;
    const title = isTrial
      ? days === 0
        ? "Seu período de teste termina hoje"
        : `Seu período de teste termina em ${days} dia${days === 1 ? "" : "s"}`
      : subscription.status === "past_due"
        ? "Pagamento da assinatura pendente"
        : !hasPaymentMethod
          ? "Método de pagamento não encontrado"
          : days === 1
            ? "Seu plano será renovado amanhã"
            : `Seu plano será renovado em ${days} dias`;
    const message = isTrial
      ? "Acesse Minha Assinatura para escolher um plano e evitar interrupções."
      : subscription.status === "past_due"
        ? "Atualize o pagamento para evitar a suspensão do acesso."
        : !hasPaymentMethod
          ? "Seu plano vence em breve. Adicione um cartão para evitar a suspensão do acesso."
          : `${planName} será renovado por ${amount}.`;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("organization_id", subscription.organization_id)
      .eq("type", "subscription")
      .eq("related_entity_id", `${isTrial ? "trial" : "renewal"}:${today}:${days}`)
      .maybeSingle();
    if (existing) continue;
    await supabase.from("notifications").insert({
      organization_id: subscription.organization_id,
      role_target: "all",
      type: "subscription",
      title,
      message,
      related_entity: "subscription",
      related_entity_id: `${isTrial ? "trial" : "renewal"}:${today}:${days}`,
      priority: (!hasPaymentMethod && !isTrial) || subscription.status === "past_due" || days <= 1 ? "high" : "normal",
      metadata: { renewal_at: renewalAt, days, payment_method: paymentMethod, plan_code: subscription.plan_code },
    });
    const ownerEmail = subscription.organizations?.owner_email;
    if (ownerEmail) {
      const templateCode = isTrial
        ? days === 0 ? "trial_expired" : "trial_ending"
        : days === 7 ? "renewal_7_days" : days === 1 ? "renewal_1_day" : null;
      if (templateCode) {
        await supabase.from("saas_email_outbox").insert({
          organization_id: subscription.organization_id,
          recipient_email: ownerEmail,
          template_code: templateCode,
          variables: {
            days,
            company: subscription.organizations?.name || "",
            plan: planName,
            amount,
            payment_method: paymentMethod || "Não cadastrado",
          },
        });
      }
    }
    if (isTrial) trialAlerts += 1;
    else renewalAlerts += 1;
  }
  return {
    trial_alerts: trialAlerts,
    renewal_alerts: renewalAlerts,
    scheduled_changes: scheduled,
    billing_reconciled: billingReconciled,
    billing_errors: billingErrors,
  };
}

async function applyScheduledPlanChanges(supabase: ReturnType<typeof adminClient>) {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("organization_subscriptions")
    .select("id,organization_id,plan_code,provider_subscription_id,pending_plan_code,pending_plan_effective_at,pending_deactivate_users")
    .not("pending_plan_code", "is", null)
    .lte("pending_plan_effective_at", now);
  if (error) throw error;
  let applied = 0;
  for (const subscription of rows || []) {
    const { data: targetPlan, error: planError } = await supabase
      .from("subscription_plans")
      .select("code,name,price_monthly")
      .eq("code", subscription.pending_plan_code)
      .single();
    if (planError) throw planError;
    if (subscription.provider_subscription_id && Number(targetPlan.price_monthly || 0) <= 0) {
      await mercadoPagoRequest(`/preapproval/${encodeURIComponent(subscription.provider_subscription_id)}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      }).catch(() => null);
    }
    const users = Array.isArray(subscription.pending_deactivate_users)
      ? subscription.pending_deactivate_users.map((item: unknown) => String(item || "").toLowerCase())
      : [];
    if (users.length) {
      await Promise.all([
        supabase.from("organization_members").update({ status: "inactive", updated_at: now })
          .eq("organization_id", subscription.organization_id).in("user_email", users),
        supabase.from("approved_users").delete()
          .eq("organization_id", subscription.organization_id).in("email", users),
      ]);
    }
    const nextStatus = Number(targetPlan.price_monthly || 0) > 0 ? "active" : "free";
    await Promise.all([
      supabase.from("organization_subscriptions").update({
        plan_code: targetPlan.code,
        status: nextStatus,
        provider: nextStatus === "free" ? "manual" : "mercado_pago",
        pending_plan_code: null,
        pending_plan_effective_at: null,
        pending_deactivate_users: [],
        updated_at: now,
      }).eq("id", subscription.id),
      supabase.from("organizations").update({
        plan_code: targetPlan.code,
        status: "active",
        updated_at: now,
      }).eq("id", subscription.organization_id),
      supabase.from("subscription_change_requests").update({
        status: "applied",
        decided_at: now,
        decided_by: "system",
      }).eq("organization_id", subscription.organization_id)
        .eq("requested_plan_code", targetPlan.code)
        .eq("status", "scheduled"),
    ]);
    await supabase.from("notifications").insert({
      organization_id: subscription.organization_id,
      role_target: "all",
      type: "subscription",
      title: "Novo plano aplicado",
      message: `O plano ${targetPlan.name} entrou em vigor.`,
      related_entity: "subscription",
      related_entity_id: subscription.id,
      priority: "normal",
    });
    applied += 1;
  }
  return applied;
}

async function createBackup(actor: string, force: boolean) {
  const supabase = adminClient();
  const backupOwnerOrganizationId = "00000000-0000-0000-0000-000000000001";
  const { data: latest } = await supabase
    .from("backup_runs")
    .select("*")
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!force && latest && Date.now() - new Date(latest.started_at).getTime() < 6.5 * 86400000) {
    return { skipped: true, last_backup: latest.started_at };
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const { error: runError } = await supabase.from("backup_runs").insert({
    id: runId,
    organization_id: backupOwnerOrganizationId,
    status: "running",
    backup_type: force ? "manual" : "weekly",
    started_at: startedAt,
    created_by: actor,
  });
  if (runError) throw runError;
  try {
    const snapshot = await createSnapshot(BACKUP_TABLES, actor, "database", startedAt);
    const counts = Object.fromEntries(
      Object.entries(snapshot.tables).map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0]),
    );
    const raw = new TextEncoder().encode(JSON.stringify(snapshot));
    const compressed = await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    const path = `${startedAt.slice(0, 10)}/3daft-${runId}.json.gz`;
    const { error: uploadError } = await supabase.storage
      .from("system-backups")
      .upload(path, compressed, { contentType: "application/gzip", upsert: false });
    if (uploadError) throw uploadError;
    const { error: successError } = await supabase.from("backup_runs").update({
      status: "success",
      storage_path: path,
      size_bytes: compressed.byteLength,
      table_counts: counts,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    if (successError) throw successError;
    await createSystemNotification("Backup concluido", `Backup semanal salvo com ${compressed.byteLength} bytes.`, "normal");
    return { id: runId, status: "success", storage_path: path, size_bytes: compressed.byteLength, table_counts: counts };
  } catch (error) {
    const { error: failureError } = await supabase.from("backup_runs").update({
      status: "error",
      error_message: error.message || String(error),
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    if (failureError) console.error("Falha ao registrar erro do backup", failureError);
    throw error;
  }
}

async function createSnapshot(
  tables: string[],
  actor: string,
  scope: string,
  createdAt = new Date().toISOString(),
) {
  const supabase = adminClient();
  const snapshot: Record<string, any> = {
    version: 2,
    created_at: createdAt,
    created_by: actor,
    project: "3D.AFT",
    scope,
    tables: {},
    unavailable_tables: [],
  };
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*");
    if (error && ["PGRST200", "PGRST205"].includes(String(error.code || ""))) {
      snapshot.unavailable_tables.push(table);
      continue;
    }
    if (error) throw new Error(`${table}: ${error.message}`);
    snapshot.tables[table] = data || [];
  }
  return snapshot;
}

async function createBackupDownload(backupId: string) {
  if (!backupId) throw new Error("Backup nao informado.");
  const supabase = adminClient();
  const { data: run, error } = await supabase
    .from("backup_runs")
    .select("id,status,storage_path,started_at")
    .eq("id", backupId)
    .maybeSingle();
  if (error || !run?.storage_path || run.status !== "success") {
    throw new Error("Arquivo de backup nao encontrado.");
  }
  const { data, error: signedError } = await supabase.storage
    .from("system-backups")
    .createSignedUrl(run.storage_path, 300);
  if (signedError || !data?.signedUrl) throw signedError || new Error("Falha ao gerar link privado.");
  return {
    url: data.signedUrl,
    file_name: `3daft-backup-${String(run.started_at).slice(0, 10)}.json.gz`,
  };
}

async function restoreSnapshot(snapshot: Record<string, any>, actor: string) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("Estrutura de backup invalida.");
  }
  const supabase = adminClient();
  let restoredRows = 0;
  let restoredTables = 0;
  const skippedTables: string[] = [];
  for (const [table, rawRows] of Object.entries(snapshot.tables)) {
    if (!BACKUP_TABLES.includes(table) || !RESTORABLE_TABLES.has(table)) {
      skippedTables.push(table);
      continue;
    }
    if (!Array.isArray(rawRows) || !rawRows.length) continue;
    const rows = rawRows as Record<string, unknown>[];
    for (let offset = 0; offset < rows.length; offset += 250) {
      const { error } = await supabase.from(table).upsert(rows.slice(offset, offset + 250));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    restoredRows += rows.length;
    restoredTables += 1;
  }
  await supabase.from("audit_events").insert({
    actor_email: actor,
    action: "backup_restore",
    entity_type: "system",
    entity_id: String(snapshot.created_at || new Date().toISOString()),
    source: "backup",
    metadata: {
      scope: snapshot.scope || "database",
      restored_rows: restoredRows,
      restored_tables: restoredTables,
      skipped_tables: skippedTables,
    },
  });
  await createSystemNotification(
    "Backup restaurado",
    `${restoredRows} registros restaurados em ${restoredTables} tabelas.`,
    "high",
  );
  return {
    restored_rows: restoredRows,
    restored_tables: restoredTables,
    skipped_tables: skippedTables,
  };
}

async function simulateRestore(snapshot: Record<string, any>) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("Estrutura de backup invalida.");
  }
  const supabase = adminClient();
  const tables = [];
  const totals = { create: 0, update: 0, identical: 0, skipped: 0, invalid: 0 };
  for (const [table, rawRows] of Object.entries(snapshot.tables)) {
    const rows = Array.isArray(rawRows) ? rawRows as Record<string, unknown>[] : [];
    const result = {
      table,
      rows: rows.length,
      create: 0,
      update: 0,
      identical: 0,
      skipped: 0,
      invalid: 0,
      reason: "",
    };
    if (!BACKUP_TABLES.includes(table)) {
      result.invalid = rows.length || 1;
      result.reason = "Tabela desconhecida para esta versao.";
      totals.invalid += result.invalid;
      tables.push(result);
      continue;
    }
    if (!RESTORABLE_TABLES.has(table)) {
      result.skipped = rows.length;
      result.reason = "Tabela protegida: mantida apenas no arquivo para consulta.";
      totals.skipped += result.skipped;
      tables.push(result);
      continue;
    }
    if (!Array.isArray(rawRows)) {
      result.invalid = 1;
      result.reason = "O conteudo da tabela nao e uma lista.";
      totals.invalid += 1;
      tables.push(result);
      continue;
    }
    const { data: currentRows, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    const currentByKey = new Map<string, Record<string, unknown>>();
    for (const row of currentRows || []) {
      const key = restoreRowKey(table, row);
      if (key) currentByKey.set(key, row);
    }
    for (const row of rows) {
      const key = restoreRowKey(table, row);
      if (!key) {
        result.invalid += 1;
        continue;
      }
      const current = currentByKey.get(key);
      if (!current) {
        result.create += 1;
      } else if (stableJson(current) === stableJson(row)) {
        result.identical += 1;
      } else {
        result.update += 1;
      }
    }
    if (result.invalid) result.reason = "Existem registros sem identificador primario.";
    totals.create += result.create;
    totals.update += result.update;
    totals.identical += result.identical;
    totals.invalid += result.invalid;
    tables.push(result);
  }
  return {
    can_restore: totals.invalid === 0,
    snapshot_version: snapshot.version || 1,
    snapshot_scope: snapshot.scope || "database",
    snapshot_created_at: snapshot.created_at || null,
    totals,
    tables,
  };
}

function restoreRowKey(table: string, row: Record<string, unknown>) {
  if (!row || typeof row !== "object") return "";
  if (table === "approved_users") {
    const email = String(row.email || "").trim().toLowerCase();
    return email ? `email:${email}` : "";
  }
  const id = String(row.id || "").trim();
  return id ? `id:${id}` : "";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Autenticacao obrigatoria.");
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) throw new Error("Sessao invalida.");
  const email = data.user.email.toLowerCase();
  const { data: approved } = await supabase.from("approved_users").select("role").eq("email", email).maybeSingle();
  if (!["admin", "administrador"].includes(String(approved?.role || "").toLowerCase())) {
    throw new Error("Apenas administrador pode executar backup manual.");
  }
  return email;
}

async function createSystemNotification(title: string, message: string, priority: string) {
  const supabase = adminClient();
  await supabase.from("notifications").insert({
    role_target: "admin",
    type: "backup",
    title,
    message,
    related_entity: "backup",
    related_entity_id: new Date().toISOString().slice(0, 10),
    priority,
  });
}
