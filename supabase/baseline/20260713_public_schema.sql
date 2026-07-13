


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."assert_marketplace_sales_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  sales_limit integer;
  current_sales integer;
begin
  sales_limit := coalesce((public.organization_plan_limits(new.organization_id)->>'marketplace_sales_month')::integer, 0);
  if sales_limit < 0 then
    return new;
  end if;

  select count(*) into current_sales
  from public.marketplace_order_links link
  where link.organization_id = new.organization_id
    and link.created_at >= date_trunc('month', now())
    and link.created_at < date_trunc('month', now()) + interval '1 month';

  if current_sales >= sales_limit then
    raise exception 'Limite mensal de vendas importadas atingido (% de %). Altere o plano para continuar importando.',
      current_sales, sales_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assert_marketplace_sales_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_organization_user_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  user_limit integer;
  current_users integer;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.organization_id = new.organization_id
    and old.status = 'active' then
    return new;
  end if;

  user_limit := coalesce((public.organization_plan_limits(new.organization_id)->>'users')::integer, 0);
  if user_limit <= 0 then
    return new;
  end if;

  select count(*) into current_users
  from public.organization_members member
  where member.organization_id = new.organization_id
    and member.status = 'active';

  if current_users >= user_limit then
    raise exception 'Limite de usuários do plano atingido (% de %). Remova um usuário ou altere o plano.',
      current_users, user_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assert_organization_user_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
      and lower(role) in ('administrador', 'admin', 'edicao', 'editor', 'equipe', 'owner')
  );
$$;


ALTER FUNCTION "public"."can_edit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_org"("candidate_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where organization_id = candidate_organization_id
      and lower(user_email) = public.current_user_email()
      and status = 'active'
      and lower(role) in ('administrador', 'admin', 'edicao', 'edição', 'editor', 'equipe', 'owner')
  );
$$;


ALTER FUNCTION "public"."can_edit_org"("candidate_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_sensitive_logs"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  result jsonb := '{}'::jsonb;
  n integer;
begin
  delete from public.marketplace_oauth_states
  where expires_at < now() - interval '7 days'
     or consumed_at < now() - interval '7 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('marketplace_oauth_states', n);

  delete from public.security_rate_limits where updated_at < now() - interval '2 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('security_rate_limits', n);

  delete from public.saas_email_delivery_logs where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('saas_email_delivery_logs', n);

  delete from public.saas_email_outbox where status in ('sent','failed') and created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('saas_email_outbox', n);

  delete from public.public_signup_events where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('public_signup_events', n);

  delete from public.marketplace_sync_log where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('marketplace_sync_log', n);

  delete from public.storefront_events where created_at < now() - interval '365 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('storefront_events', n);

  delete from public.platform_admin_logs where created_at < now() - interval '365 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('platform_admin_logs', n);

  return result;
end;
$$;


ALTER FUNCTION "public"."cleanup_sensitive_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_organization_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select organization_id
  from public.organization_members
  where lower(user_email) = lower(auth.jwt() ->> 'email')
    and status = 'active'
  order by created_at
  limit 1;
$$;


ALTER FUNCTION "public"."current_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_email"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;


ALTER FUNCTION "public"."current_user_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_organization_member_plan_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  plan_limit integer;
  active_count integer;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.organization_id = new.organization_id
     and old.status = 'active' then
    return new;
  end if;

  select users_limit
    into plan_limit
  from public.organization_plan_limits(new.organization_id);

  if coalesce(plan_limit, 0) <= 0 then
    return new;
  end if;

  select count(*)
    into active_count
  from public.organization_members
  where organization_id = new.organization_id
    and status = 'active';

  if active_count >= plan_limit then
    raise exception 'Limite de usuarios do plano atingido (% de %).', active_count, plan_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_organization_member_plan_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."flowops_normalized_role"("role_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(
    replace(
      replace(
        replace(
          replace(coalesce(role_text, ''), 'ç', 'c'),
        'ã', 'a'),
      'á', 'a'),
    'é', 'e')
  );
$$;


ALTER FUNCTION "public"."flowops_normalized_role"("role_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
      and lower(role) in ('administrador', 'admin', 'owner')
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where lower(user_email) = lower(auth.jwt() ->> 'email')
      and status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_approved_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_email_approved"("candidate_email" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.approved_users
    where lower(email) = lower(candidate_email)
  );
$$;


ALTER FUNCTION "public"."is_email_approved"("candidate_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("candidate_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members
    where organization_id = candidate_organization_id
      and lower(user_email) = public.current_user_email()
      and status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_org_member"("candidate_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.platform_admins
    where lower(user_email) = public.current_user_email()
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_platform_backup_error"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'error' then
    insert into public.platform_notifications (
      type, title, message, related_entity, related_entity_id, organization_id, priority
    ) values (
      'backup',
      'Backup falhou',
      coalesce(new.error_message, 'Falha ao executar backup.'),
      'backup_run',
      new.id::text,
      new.organization_id,
      'high'
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_platform_backup_error"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_platform_connector_error"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'error' and (tg_op = 'INSERT' or old.status is distinct from 'error') then
    insert into public.platform_notifications (
      type, title, message, related_entity, related_entity_id, organization_id, priority
    ) values (
      'integration',
      'Integracao com erro',
      new.marketplace || ': ' || coalesce(new.last_error, 'Falha nao informada'),
      'organization_connector',
      new.organization_id::text || ':' || new.marketplace,
      new.organization_id,
      'high'
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_platform_connector_error"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_platform_support_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.platform_notifications (
    type, title, message, related_entity, related_entity_id, organization_id, priority
  ) values (
    'support',
    'Novo chamado de suporte',
    new.subject || ' - ' || coalesce(new.created_by, 'Cliente'),
    'support_ticket',
    new.id::text,
    new.organization_id,
    case when new.priority = 'Urgente' then 'high' else 'normal' end
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_platform_support_ticket"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."organization_plan_limits"("candidate_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(plan.limits, '{}'::jsonb)
  from public.organizations organization
  left join public.organization_subscriptions subscription
    on subscription.organization_id = organization.id
  left join public.subscription_plans plan
    on plan.code = coalesce(subscription.plan_code, organization.plan_code)
  where organization.id = candidate_organization_id
  limit 1;
$$;


ALTER FUNCTION "public"."organization_plan_limits"("candidate_organization_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."subscription_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "requested_by" "text" NOT NULL,
    "current_plan_code" "text" NOT NULL,
    "requested_plan_code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "validation_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "text",
    "effective_at" timestamp with time zone,
    "change_type" "text"
);

ALTER TABLE ONLY "public"."subscription_change_requests" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_change_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_subscription_plan_change"("target_plan_code" "text") RETURNS "public"."subscription_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  org_id uuid;
  requester text;
  current_plan text;
  target_plan public.subscription_plans%rowtype;
  active_users integer;
  sales_month integer;
  request_row public.subscription_change_requests%rowtype;
begin
  requester := lower(coalesce(auth.jwt() ->> 'email', ''));
  if requester = '' then
    raise exception 'Autenticacao obrigatoria.';
  end if;

  select organization_id
    into org_id
  from public.organization_members
  where lower(user_email) = requester
    and status = 'active'
  order by created_at
  limit 1;

  if org_id is null then
    raise exception 'Empresa nao encontrada para o usuario.';
  end if;

  select coalesce(s.plan_code, o.plan_code, 'free')
    into current_plan
  from public.organizations o
  left join public.organization_subscriptions s on s.organization_id = o.id
  where o.id = org_id;

  select *
    into target_plan
  from public.subscription_plans
  where code = target_plan_code
    and active = true;

  if target_plan.code is null then
    raise exception 'Plano solicitado nao esta disponivel.';
  end if;

  if target_plan.code = current_plan then
    raise exception 'Este ja e o plano atual.';
  end if;

  select count(*) into active_users
  from (
    select lower(user_email) as email
    from public.organization_members
    where organization_id = org_id and status = 'active'
    union
    select lower(email)
    from public.approved_users
    where organization_id = org_id
  ) active_emails;

  select count(*) into sales_month
  from public.marketplace_order_links
  where organization_id = org_id
    and created_at >= date_trunc('month', now());

  if coalesce((target_plan.limits ->> 'users')::integer, 0) > 0
     and active_users > (target_plan.limits ->> 'users')::integer then
    raise exception 'Usuarios acima do plano solicitado. Exclua % usuario(s) para prosseguir.',
      active_users - (target_plan.limits ->> 'users')::integer;
  end if;

  if coalesce((target_plan.limits ->> 'marketplace_sales_month')::integer, 0) >= 0
     and sales_month > (target_plan.limits ->> 'marketplace_sales_month')::integer then
    raise exception 'Uso mensal acima do limite do plano solicitado.';
  end if;

  insert into public.subscription_change_requests (
    organization_id,
    requested_by,
    current_plan_code,
    requested_plan_code,
    validation_snapshot
  ) values (
    org_id,
    requester,
    current_plan,
    target_plan.code,
    jsonb_build_object(
      'active_users', active_users,
      'marketplace_sales_month', sales_month,
      'target_limits', target_plan.limits
    )
  )
  returning * into request_row;

  insert into public.platform_notifications (
    type, title, message, related_entity, related_entity_id, organization_id, priority
  ) values (
    'subscription',
    'Solicitacao de alteracao de plano',
    requester || ' solicitou alteracao de ' || current_plan || ' para ' || target_plan.code || '.',
    'subscription_change_request',
    request_row.id::text,
    org_id,
    'normal'
  );

  return request_row;
end;
$$;


ALTER FUNCTION "public"."request_subscription_plan_change"("target_plan_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_login_brand"("input_hostname" "text" DEFAULT NULL::"text", "input_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "organization_slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select o.id, o.name, o.slug
  from public.organizations o
  where
    (input_organization_id is not null and o.id = input_organization_id)
    or (
      input_organization_id is null
      and nullif(lower(split_part(coalesce(input_hostname, ''), '.', 1)), '') = lower(o.slug)
    )
  order by case when o.id = input_organization_id then 0 else 1 end
  limit 1;
$$;


ALTER FUNCTION "public"."resolve_login_brand"("input_hostname" "text", "input_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_approved_user_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    update public.organization_members
    set status = 'inactive',
        updated_at = now()
    where organization_id = old.organization_id
      and lower(user_email) = lower(old.email);
    return old;
  end if;

  insert into public.organization_members (
    organization_id,
    user_email,
    role,
    status,
    created_at,
    updated_at
  )
  values (
    new.organization_id,
    lower(new.email),
    coalesce(new.role, 'Leitura'),
    'active',
    coalesce(new.approved_at, now()),
    now()
  )
  on conflict (organization_id, user_email) do update set
    role = excluded.role,
    status = 'active',
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_approved_user_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_admin_in_organization"("org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and lower(m.user_email) = lower(auth.jwt()->>'email')
      and coalesce(m.status, 'active') in ('active', 'trial', 'approved')
      and public.flowops_normalized_role(m.role) in ('administrador', 'admin', 'owner')
  );
$$;


ALTER FUNCTION "public"."user_admin_in_organization"("org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_edit_organization"("org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and lower(m.user_email) = lower(auth.jwt()->>'email')
      and coalesce(m.status, 'active') in ('active', 'trial', 'approved')
      and public.flowops_normalized_role(m.role) in (
        'administrador', 'admin', 'owner',
        'supervisor', 'gestor', 'gerente',
        'operador', 'operacao', 'edicao', 'editor', 'equipe',
        'responsavel', 'responsible'
      )
  );
$$;


ALTER FUNCTION "public"."user_can_edit_organization"("org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_in_organization"("org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and lower(m.user_email) = lower(auth.jwt()->>'email')
      and coalesce(m.status, 'active') in ('active', 'trial', 'approved')
  );
$$;


ALTER FUNCTION "public"."user_in_organization"("org" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."access_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "decided_at" timestamp with time zone,
    "decided_by" "text",
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"()
);

ALTER TABLE ONLY "public"."access_requests" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."access_requests" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."access_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approved_users" (
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'Equipe'::"text",
    "approved_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."approved_users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."approved_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_events" (
    "id" bigint NOT NULL,
    "actor_email" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "order_code" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."audit_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_events" OWNER TO "postgres";


ALTER TABLE "public"."audit_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."auto_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sync_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "external_item_id" "text",
    "total_items_synced" integer DEFAULT 0,
    "items_failed" integer DEFAULT 0,
    "error_message" "text",
    "raw_response" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."auto_sync_runs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."auto_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "backup_type" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "storage_path" "text",
    "size_bytes" bigint,
    "table_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_by" "text" DEFAULT 'Sistema'::"text" NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."backup_runs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "amount" numeric(12,2),
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "paid_amount" numeric(12,2),
    "payment_method" "text",
    "pix_code" "text",
    "barcode" "text",
    "receipt_path" "text",
    "recurrence_rule" "jsonb",
    "recurrence_parent_id" "uuid",
    "linked_order_id" "text",
    "linked_cash_entry_id" "text",
    "linked_marketplace" "text",
    "linked_marketplace_external_order_id" "text",
    "reminder_days_before" integer[] DEFAULT '{3,1}'::integer[] NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "raw_payload" "jsonb",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "calendar_events_kind_check" CHECK (("kind" = ANY (ARRAY['payable'::"text", 'receivable'::"text", 'das'::"text", 'marketplace_payout'::"text", 'reminder'::"text"]))),
    CONSTRAINT "calendar_events_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'recurring'::"text", 'marketplace_sync'::"text", 'order_sync'::"text"]))),
    CONSTRAINT "calendar_events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'received'::"text", 'overdue'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."calendar_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "mei_enabled" boolean DEFAULT false NOT NULL,
    "mei_cnpj" "text",
    "mei_default_amount" numeric(12,2),
    "mei_due_day" integer DEFAULT 20 NOT NULL,
    "default_reminder_days" integer[] DEFAULT '{3,1}'::integer[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."calendar_settings" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_entries" (
    "id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "person" "text",
    "method" "text",
    "income" numeric DEFAULT 0,
    "expense" numeric DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."cash_entries" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."cash_entries" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commercial_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "marketplace" "text",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "current_margin" numeric,
    "suggested_price" numeric,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."commercial_suggestions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."commercial_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "whatsapp" "text",
    "origin" "text" DEFAULT 'Manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'Novo'::"text" NOT NULL,
    "last_contact_at" timestamp with time zone,
    "notes" "text",
    "linked_order_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."crm_leads" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."crm_leads" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."custom_tags" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."das_payments" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "year" integer NOT NULL,
    "value" numeric(14,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Pendente'::"text" NOT NULL,
    "due_date" "date",
    "pix_code" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."das_payments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."das_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_settings" (
    "organization_id" "uuid" NOT NULL,
    "marketplace_fee_rules" "jsonb" DEFAULT '{"amazon": {"default": 15}, "direct": {"default": 0}, "shopee": {"default": 14}, "mercado_livre": {"classic": 12, "premium": 16}}'::"jsonb" NOT NULL,
    "default_tax_pct" numeric DEFAULT 6 NOT NULL,
    "default_shipping_cost" numeric DEFAULT 0 NOT NULL,
    "default_packaging_cost" numeric DEFAULT 0 NOT NULL,
    "profitability_thresholds" "jsonb" DEFAULT '{"healthy": 20, "critical": 0, "attention": 10, "excellent": 35}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_prefixes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ml_seller_shipping_share_by_level" "jsonb" DEFAULT "jsonb_build_object"('5_green', 50, '4_light_green', 60, '3_yellow', 70, '2_orange', 90, '1_red', 100, 'newbie', 100, 'default', 100) NOT NULL
);

ALTER TABLE ONLY "public"."financial_settings" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fiscal_documents" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "number" "text" NOT NULL,
    "description" "text",
    "value" numeric(14,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Pendente'::"text" NOT NULL,
    "due_date" "date",
    "category" "text",
    "payment_method" "text",
    "issuer" "text",
    "order_id" "text",
    "product_id" "text",
    "supplier" "text",
    "storage_path" "text",
    "file_name" "text",
    "mime_type" "text",
    "size_bytes" bigint,
    "checksum_sha256" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."fiscal_documents" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."fiscal_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'Insumo'::"text" NOT NULL,
    "unit" "text" DEFAULT 'un.'::"text" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "minimum_quantity" numeric DEFAULT 0 NOT NULL,
    "unit_cost" numeric DEFAULT 0 NOT NULL,
    "supplier" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_items_minimum_quantity_check" CHECK (("minimum_quantity" >= (0)::numeric)),
    CONSTRAINT "inventory_items_quantity_check" CHECK (("quantity" >= (0)::numeric)),
    CONSTRAINT "inventory_items_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric))
);

ALTER TABLE ONLY "public"."inventory_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text",
    "storage_path" "text" NOT NULL,
    "category" "text" DEFAULT 'Referencia'::"text" NOT NULL,
    "size_bytes" bigint,
    "uploaded_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."lead_files" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "listing_id" "uuid",
    "external_id" "text" NOT NULL,
    "marketplace" "text" DEFAULT 'Mercado Livre'::"text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "visits" integer DEFAULT 0,
    "sold_quantity" integer DEFAULT 0,
    "conversion_rate" numeric,
    "revenue" numeric,
    "avg_ticket" numeric,
    "price_position_avg" numeric,
    "price_position_median" numeric,
    "price_position_min" numeric,
    "price_position_max" numeric,
    "price_competitiveness" "text",
    "search_position" integer,
    "category_trend" "text",
    "health_score" numeric,
    "health_checklist" "jsonb",
    "raw_summary" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."listing_analytics" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_fee_sync" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "listing_id" "uuid",
    "external_id" "text" NOT NULL,
    "marketplace" "text" DEFAULT 'Mercado Livre'::"text" NOT NULL,
    "listing_type_id" "text",
    "category_id" "text",
    "price" numeric,
    "real_fee_pct" numeric,
    "real_fee_fixed" numeric,
    "shipping_cost" numeric,
    "shipping_subsidized" numeric,
    "free_shipping" boolean DEFAULT false,
    "raw_payload" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."listing_fee_sync" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_fee_sync" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logistics_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "order_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "message" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "actor_email" "text",
    "raw_event" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."logistics_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."logistics_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "marketplace" "text" NOT NULL,
    "seller_name" "text",
    "external_seller_id" "text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL,
    "connection_status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "connection_mode" "text" DEFAULT 'oauth'::"text" NOT NULL
);

ALTER TABLE ONLY "public"."marketplace_accounts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL,
    "marketplace" "text" NOT NULL,
    "external_order_id" "text" NOT NULL,
    "internal_order_id" "text",
    "document_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "external_document_id" "text",
    "mime_type" "text",
    "file_name" "text",
    "last_error" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."marketplace_documents" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "marketplace" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "sku" "text",
    "price" numeric DEFAULT 0,
    "status" "text",
    "permalink" "text",
    "thumbnail_url" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."marketplace_listings" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_oauth_states" (
    "state_hash" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "marketplace" "text" NOT NULL,
    "requested_by" "text",
    "return_url" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."marketplace_oauth_states" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_order_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "marketplace" "text" NOT NULL,
    "external_order_id" "text" NOT NULL,
    "internal_order_id" "text" NOT NULL,
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."marketplace_order_links" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_order_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "marketplace" "text" NOT NULL,
    "external_product_id" "text" NOT NULL,
    "external_review_id" "text" NOT NULL,
    "rating" numeric(2,1),
    "title" "text",
    "comment" "text",
    "author_name" "text",
    "review_date" timestamp with time zone,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL
);

ALTER TABLE ONLY "public"."marketplace_reviews" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_sync_log" (
    "id" bigint NOT NULL,
    "marketplace" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" NOT NULL,
    "message" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_item_id" "text",
    "external_order_id" "text",
    "internal_order_id" "text",
    "actor_email" "text",
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."marketplace_sync_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_sync_log" OWNER TO "postgres";


ALTER TABLE "public"."marketplace_sync_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."marketplace_sync_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "supplier" "text" NOT NULL,
    "type" "text" NOT NULL,
    "spec" "text",
    "quantity" numeric DEFAULT 0,
    "unit_cost" numeric DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."materials" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."materials" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "role_target" "text",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "related_entity" "text",
    "related_entity_id" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL,
    "dismissed_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."notifications" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_history_events" (
    "id" bigint NOT NULL,
    "order_id" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "text",
    "changes" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."order_history_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_history_events" OWNER TO "postgres";


ALTER TABLE "public"."order_history_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."order_history_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."order_logistics" (
    "order_id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "carrier" "text",
    "tracking_code" "text",
    "status" "text" DEFAULT 'Aguardando envio'::"text" NOT NULL,
    "estimated_delivery_date" "date",
    "shipped_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."order_logistics" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_logistics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "text" NOT NULL,
    "client" "text",
    "description" "text" NOT NULL,
    "material" "text",
    "color" "text",
    "order_date" "date",
    "delivery_date" "date",
    "status" "text" DEFAULT 'Em fila'::"text" NOT NULL,
    "charged" numeric DEFAULT 0,
    "received" numeric DEFAULT 0,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "quantity" integer DEFAULT 1 NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL,
    CONSTRAINT "orders_quantity_positive" CHECK (("quantity" >= 1))
);

ALTER TABLE ONLY "public"."orders" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."orders" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_connectors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "marketplace" "text" NOT NULL,
    "status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "mode" "text" DEFAULT 'oauth'::"text" NOT NULL,
    "external_account_id" "text",
    "external_account_name" "text",
    "last_sync_at" timestamp with time zone,
    "last_error" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."organization_connectors" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_connectors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_email" "text" NOT NULL,
    "role" "text" DEFAULT 'Administrador'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."organization_members" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "plan_code" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "provider" "text" DEFAULT 'manual'::"text" NOT NULL,
    "provider_subscription_id" "text",
    "provider_payer_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "trial_start" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "cancelled_at" timestamp with time zone,
    "last_payment_status" "text",
    "last_payment_at" timestamp with time zone,
    "next_payment_at" timestamp with time zone,
    "grace_ends_at" timestamp with time zone,
    "administrative_note" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pending_plan_code" "text",
    "pending_plan_effective_at" timestamp with time zone,
    "pending_deactivate_users" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_payment_attempt_at" timestamp with time zone,
    "last_payment_reason" "text",
    "last_payment_id" "text",
    "last_payment_status_detail" "text",
    "billing_reconciled_at" timestamp with time zone,
    CONSTRAINT "organization_subscriptions_provider_check" CHECK (("provider" = ANY (ARRAY['manual'::"text", 'mercado_pago'::"text"]))),
    CONSTRAINT "organization_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['free'::"text", 'trial'::"text", 'pending'::"text", 'active'::"text", 'past_due'::"text", 'paused'::"text", 'cancelled'::"text", 'suspended'::"text"])))
);

ALTER TABLE ONLY "public"."organization_subscriptions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "plan_code" "text" DEFAULT 'free'::"text" NOT NULL,
    "owner_email" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "trial_ends_at" timestamp with time zone,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

ALTER TABLE ONLY "public"."organizations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admin_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "organization_id" "uuid",
    "entity_type" "text",
    "entity_id" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."platform_admin_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admin_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "user_email" "text" NOT NULL,
    "role" "text" DEFAULT 'super_admin'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."platform_admins" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_email" "text",
    "type" "text" DEFAULT 'system'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "related_entity" "text",
    "related_entity_id" "text",
    "organization_id" "uuid",
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."platform_notifications" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "marketplace" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."product_listings" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "cost_price" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "weight_kg" numeric
);

ALTER TABLE ONLY "public"."products" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_signup_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "email" "text" NOT NULL,
    "plan_code" "text",
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "source" "text" DEFAULT 'landing_page'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."public_signup_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_signup_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_invoices" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "supplier" "text" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Pendente'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."purchase_invoices" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."responsibles" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" DEFAULT "public"."current_organization_id"() NOT NULL
);

ALTER TABLE ONLY "public"."responsibles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."responsibles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "category" "text" DEFAULT 'Atualização'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "organization_id" "uuid",
    "published" boolean DEFAULT true NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."saas_announcements" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_changelog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT 'Plataforma'::"text" NOT NULL,
    "published" boolean DEFAULT true NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."saas_changelog" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_changelog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_email_delivery_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outbox_id" "uuid",
    "organization_id" "uuid",
    "recipient_email" "text" NOT NULL,
    "template_code" "text",
    "provider" "text" DEFAULT 'brevo'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "attempt" integer DEFAULT 1 NOT NULL,
    "provider_message_id" "text",
    "error_message" "text",
    "response_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."saas_email_delivery_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_email_delivery_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "recipient_email" "text" NOT NULL,
    "template_code" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "scheduled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_message_id" "text",
    "provider_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."saas_email_outbox" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_email_outbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_email_templates" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "html_body" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."saas_email_templates" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_by" "text" NOT NULL,
    "category" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'Aberto'::"text" NOT NULL,
    "priority" "text" DEFAULT 'Normal'::"text" NOT NULL,
    "admin_response" "text",
    "assigned_to" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "saas_support_tickets_category_check" CHECK (("category" = ANY (ARRAY['Sugestão'::"text", 'Bug'::"text", 'Dúvida'::"text"]))),
    CONSTRAINT "saas_support_tickets_priority_check" CHECK (("priority" = ANY (ARRAY['Baixa'::"text", 'Normal'::"text", 'Alta'::"text", 'Urgente'::"text"]))),
    CONSTRAINT "saas_support_tickets_status_check" CHECK (("status" = ANY (ARRAY['Aberto'::"text", 'Em análise'::"text", 'Respondido'::"text", 'Fechado'::"text"])))
);

ALTER TABLE ONLY "public"."saas_support_tickets" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_invoices" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "client" "text" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Emitida'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."sales_invoices" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_rate_limits" (
    "key" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."security_rate_limits" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seller_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "marketplace" "text" NOT NULL,
    "seller_level" "text",
    "claims_rate" numeric,
    "delayed_rate" numeric,
    "cancellation_rate" numeric,
    "total_sales" integer,
    "raw_payload" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."seller_metrics" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storefront_events" (
    "id" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "product_id" "text",
    "marketplace" "text",
    "session_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    CONSTRAINT "storefront_events_allowed_type" CHECK (("event_type" = ANY (ARRAY['view'::"text", 'buy_click'::"text", 'quote_click'::"text", 'custom_quote'::"text", 'product_view'::"text", 'search'::"text", 'category_click'::"text"])))
);

ALTER TABLE ONLY "public"."storefront_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."storefront_events" OWNER TO "postgres";


ALTER TABLE "public"."storefront_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."storefront_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."subscription_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "provider" "text" DEFAULT 'manual'::"text" NOT NULL,
    "provider_payment_id" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_method" "text",
    "paid_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_invoice_id" "text",
    "provider_charge_id" "text",
    "status_detail" "text",
    "failure_reason" "text",
    "attempt_number" integer DEFAULT 0 NOT NULL,
    "attempted_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."subscription_payments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price_monthly" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "trial_days" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "mercado_pago_plan_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mercado_pago_init_point" "text",
    "mercado_pago_status" "text",
    "mercado_pago_synced_at" timestamp with time zone,
    "marketing_description" "text",
    "marketing_highlights" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "marketing_badge" "text",
    "marketing_cta" "text" DEFAULT 'Comecar agora'::"text" NOT NULL,
    "marketing_featured" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 100 NOT NULL
);

ALTER TABLE ONLY "public"."subscription_plans" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_key" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "resource_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."subscription_webhook_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_webhook_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approved_users"
    ADD CONSTRAINT "approved_users_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_sync_runs"
    ADD CONSTRAINT "auto_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_runs"
    ADD CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_settings"
    ADD CONSTRAINT "calendar_settings_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."calendar_settings"
    ADD CONSTRAINT "calendar_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commercial_suggestions"
    ADD CONSTRAINT "commercial_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_tags"
    ADD CONSTRAINT "custom_tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."custom_tags"
    ADD CONSTRAINT "custom_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."das_payments"
    ADD CONSTRAINT "das_payments_organization_id_month_year_key" UNIQUE ("organization_id", "month", "year");



ALTER TABLE ONLY "public"."das_payments"
    ADD CONSTRAINT "das_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_settings"
    ADD CONSTRAINT "financial_settings_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."fiscal_documents"
    ADD CONSTRAINT "fiscal_documents_organization_id_type_number_key" UNIQUE ("organization_id", "type", "number");



ALTER TABLE ONLY "public"."fiscal_documents"
    ADD CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_files"
    ADD CONSTRAINT "lead_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_analytics"
    ADD CONSTRAINT "listing_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_fee_sync"
    ADD CONSTRAINT "listing_fee_sync_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_events"
    ADD CONSTRAINT "logistics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_accounts"
    ADD CONSTRAINT "marketplace_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_documents"
    ADD CONSTRAINT "marketplace_documents_organization_id_marketplace_external__key" UNIQUE ("organization_id", "marketplace", "external_order_id", "document_type");



ALTER TABLE ONLY "public"."marketplace_documents"
    ADD CONSTRAINT "marketplace_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_oauth_states"
    ADD CONSTRAINT "marketplace_oauth_states_pkey" PRIMARY KEY ("state_hash");



ALTER TABLE ONLY "public"."marketplace_order_links"
    ADD CONSTRAINT "marketplace_order_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_reviews"
    ADD CONSTRAINT "marketplace_reviews_marketplace_external_review_id_key" UNIQUE ("marketplace", "external_review_id");



ALTER TABLE ONLY "public"."marketplace_reviews"
    ADD CONSTRAINT "marketplace_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_sync_log"
    ADD CONSTRAINT "marketplace_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_history_events"
    ADD CONSTRAINT "order_history_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_logistics"
    ADD CONSTRAINT "order_logistics_pkey" PRIMARY KEY ("order_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_connectors"
    ADD CONSTRAINT "organization_connectors_organization_id_marketplace_key" UNIQUE ("organization_id", "marketplace");



ALTER TABLE ONLY "public"."organization_connectors"
    ADD CONSTRAINT "organization_connectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_email");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_provider_subscription_id_key" UNIQUE ("provider_subscription_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."platform_admin_logs"
    ADD CONSTRAINT "platform_admin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_email");



ALTER TABLE ONLY "public"."platform_notifications"
    ADD CONSTRAINT "platform_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_listings"
    ADD CONSTRAINT "product_listings_organization_id_marketplace_external_id_key" UNIQUE ("organization_id", "marketplace", "external_id");



ALTER TABLE ONLY "public"."product_listings"
    ADD CONSTRAINT "product_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_sku_key" UNIQUE ("organization_id", "sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_signup_events"
    ADD CONSTRAINT "public_signup_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_organization_id_invoice_number_key" UNIQUE ("organization_id", "invoice_number");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."responsibles"
    ADD CONSTRAINT "responsibles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."responsibles"
    ADD CONSTRAINT "responsibles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_announcements"
    ADD CONSTRAINT "saas_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_changelog"
    ADD CONSTRAINT "saas_changelog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_email_delivery_logs"
    ADD CONSTRAINT "saas_email_delivery_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_email_outbox"
    ADD CONSTRAINT "saas_email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_email_templates"
    ADD CONSTRAINT "saas_email_templates_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."saas_support_tickets"
    ADD CONSTRAINT "saas_support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_organization_id_invoice_number_key" UNIQUE ("organization_id", "invoice_number");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_rate_limits"
    ADD CONSTRAINT "security_rate_limits_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."seller_metrics"
    ADD CONSTRAINT "seller_metrics_organization_id_marketplace_key" UNIQUE ("organization_id", "marketplace");



ALTER TABLE ONLY "public"."seller_metrics"
    ADD CONSTRAINT "seller_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storefront_events"
    ADD CONSTRAINT "storefront_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_change_requests"
    ADD CONSTRAINT "subscription_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."subscription_webhook_events"
    ADD CONSTRAINT "subscription_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_webhook_events"
    ADD CONSTRAINT "subscription_webhook_events_provider_event_key_key" UNIQUE ("provider", "event_key");



CREATE INDEX "audit_events_action_idx" ON "public"."audit_events" USING "btree" ("action");



CREATE INDEX "audit_events_created_at_idx" ON "public"."audit_events" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_events_entity_idx" ON "public"."audit_events" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "auto_sync_runs_org_idx" ON "public"."auto_sync_runs" USING "btree" ("organization_id");



CREATE INDEX "auto_sync_runs_type_idx" ON "public"."auto_sync_runs" USING "btree" ("organization_id", "sync_type", "started_at" DESC);



CREATE INDEX "backup_runs_started_idx" ON "public"."backup_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "calendar_events_org_due_idx" ON "public"."calendar_events" USING "btree" ("organization_id", "due_date");



CREATE INDEX "calendar_events_org_status_idx" ON "public"."calendar_events" USING "btree" ("organization_id", "status");



CREATE INDEX "calendar_events_recurrence_parent_idx" ON "public"."calendar_events" USING "btree" ("recurrence_parent_id");



CREATE INDEX "commercial_suggestions_org_idx" ON "public"."commercial_suggestions" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "crm_leads_email_unique" ON "public"."crm_leads" USING "btree" ("lower"("email")) WHERE (("email" IS NOT NULL) AND ("btrim"("email") <> ''::"text"));



CREATE INDEX "crm_leads_origin_idx" ON "public"."crm_leads" USING "btree" ("origin");



CREATE INDEX "crm_leads_status_idx" ON "public"."crm_leads" USING "btree" ("status");



CREATE INDEX "crm_leads_updated_at_idx" ON "public"."crm_leads" USING "btree" ("updated_at" DESC);



CREATE UNIQUE INDEX "crm_leads_whatsapp_unique" ON "public"."crm_leads" USING "btree" ("regexp_replace"("whatsapp", '\D'::"text", ''::"text", 'g'::"text")) WHERE (("whatsapp" IS NOT NULL) AND ("btrim"("whatsapp") <> ''::"text"));



CREATE INDEX "das_payments_org_due_idx" ON "public"."das_payments" USING "btree" ("organization_id", "due_date");



CREATE INDEX "fiscal_documents_org_date_idx" ON "public"."fiscal_documents" USING "btree" ("organization_id", "date" DESC);



CREATE INDEX "fiscal_documents_org_order_idx" ON "public"."fiscal_documents" USING "btree" ("organization_id", "order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "fiscal_documents_org_product_idx" ON "public"."fiscal_documents" USING "btree" ("organization_id", "product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "idx_audit_events_org_created" ON "public"."audit_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_marketplace_sync_log_org_created" ON "public"."marketplace_sync_log" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_notifications_org_read_created" ON "public"."notifications" USING "btree" ("organization_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_orders_org_status_updated" ON "public"."orders" USING "btree" ("organization_id", "status", "updated_at" DESC);



CREATE INDEX "idx_security_rate_limits_window" ON "public"."security_rate_limits" USING "btree" ("updated_at");



CREATE INDEX "idx_storefront_events_org_created" ON "public"."storefront_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "inventory_items_low_stock_idx" ON "public"."inventory_items" USING "btree" ("organization_id", "quantity", "minimum_quantity");



CREATE INDEX "inventory_items_org_name_idx" ON "public"."inventory_items" USING "btree" ("organization_id", "name");



CREATE INDEX "lead_files_lead_idx" ON "public"."lead_files" USING "btree" ("lead_id", "created_at" DESC);



CREATE INDEX "listing_analytics_listing_lookup_idx" ON "public"."listing_analytics" USING "btree" ("organization_id", "marketplace", "external_id", "synced_at" DESC);



CREATE INDEX "listing_analytics_org_idx" ON "public"."listing_analytics" USING "btree" ("organization_id");



CREATE INDEX "listing_fee_sync_lookup_idx" ON "public"."listing_fee_sync" USING "btree" ("organization_id", "marketplace", "external_id", "synced_at" DESC);



CREATE INDEX "listing_fee_sync_org_idx" ON "public"."listing_fee_sync" USING "btree" ("organization_id");



CREATE INDEX "logistics_events_order_idx" ON "public"."logistics_events" USING "btree" ("order_id");



CREATE INDEX "logistics_events_org_idx" ON "public"."logistics_events" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "marketplace_accounts_org_provider_seller_uidx" ON "public"."marketplace_accounts" USING "btree" ("organization_id", "marketplace", "external_seller_id");



CREATE UNIQUE INDEX "marketplace_accounts_unique_seller_global" ON "public"."marketplace_accounts" USING "btree" ("marketplace", "external_seller_id") WHERE (("external_seller_id" IS NOT NULL) AND ("external_seller_id" <> ''::"text"));



CREATE INDEX "marketplace_accounts_updated_at_idx" ON "public"."marketplace_accounts" USING "btree" ("updated_at" DESC);



CREATE INDEX "marketplace_documents_order_idx" ON "public"."marketplace_documents" USING "btree" ("organization_id", "marketplace", "external_order_id");



CREATE INDEX "marketplace_documents_status_idx" ON "public"."marketplace_documents" USING "btree" ("status", "updated_at" DESC);



CREATE UNIQUE INDEX "marketplace_listings_org_provider_item_uidx" ON "public"."marketplace_listings" USING "btree" ("organization_id", "marketplace", "external_id");



CREATE INDEX "marketplace_listings_updated_at_idx" ON "public"."marketplace_listings" USING "btree" ("updated_at" DESC);



CREATE INDEX "marketplace_oauth_states_expiry_idx" ON "public"."marketplace_oauth_states" USING "btree" ("expires_at");



CREATE INDEX "marketplace_order_links_created_at_idx" ON "public"."marketplace_order_links" USING "btree" ("created_at" DESC);



CREATE INDEX "marketplace_order_links_internal_order_idx" ON "public"."marketplace_order_links" USING "btree" ("internal_order_id");



CREATE UNIQUE INDEX "marketplace_order_links_org_provider_order_uidx" ON "public"."marketplace_order_links" USING "btree" ("organization_id", "marketplace", "external_order_id");



CREATE INDEX "marketplace_reviews_product_idx" ON "public"."marketplace_reviews" USING "btree" ("marketplace", "external_product_id", "review_date" DESC);



CREATE INDEX "marketplace_sync_log_created_at_idx" ON "public"."marketplace_sync_log" USING "btree" ("created_at" DESC);



CREATE INDEX "marketplace_sync_log_external_item_idx" ON "public"."marketplace_sync_log" USING "btree" ("marketplace", "external_item_id");



CREATE INDEX "marketplace_sync_log_external_order_idx" ON "public"."marketplace_sync_log" USING "btree" ("marketplace", "external_order_id");



CREATE INDEX "marketplace_sync_log_internal_order_idx" ON "public"."marketplace_sync_log" USING "btree" ("internal_order_id");



CREATE INDEX "marketplace_sync_log_kind_idx" ON "public"."marketplace_sync_log" USING "btree" ("kind");



CREATE INDEX "marketplace_sync_log_status_idx" ON "public"."marketplace_sync_log" USING "btree" ("status");



CREATE INDEX "notifications_created_at_idx" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "notifications_role_idx" ON "public"."notifications" USING "btree" ("role_target", "created_at" DESC);



CREATE INDEX "notifications_unread_idx" ON "public"."notifications" USING "btree" ("is_read", "created_at" DESC);



CREATE INDEX "notifications_visible_idx" ON "public"."notifications" USING "btree" ("organization_id", "dismissed_at", "created_at" DESC);



CREATE INDEX "order_history_events_order_id_changed_at_idx" ON "public"."order_history_events" USING "btree" ("order_id", "changed_at" DESC);



CREATE INDEX "order_logistics_org_idx" ON "public"."order_logistics" USING "btree" ("organization_id");



CREATE INDEX "organization_members_email_idx" ON "public"."organization_members" USING "btree" ("lower"("user_email"), "status");



CREATE INDEX "organization_subscriptions_pending_plan_idx" ON "public"."organization_subscriptions" USING "btree" ("pending_plan_effective_at") WHERE ("pending_plan_code" IS NOT NULL);



CREATE INDEX "organization_subscriptions_provider_idx" ON "public"."organization_subscriptions" USING "btree" ("provider", "provider_subscription_id");



CREATE INDEX "organization_subscriptions_reconciliation_idx" ON "public"."organization_subscriptions" USING "btree" ("provider", "next_payment_at", "billing_reconciled_at");



CREATE INDEX "organization_subscriptions_status_idx" ON "public"."organization_subscriptions" USING "btree" ("status", "current_period_end");



CREATE INDEX "platform_admin_logs_created_idx" ON "public"."platform_admin_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "platform_admin_logs_org_idx" ON "public"."platform_admin_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "platform_notifications_visible_idx" ON "public"."platform_notifications" USING "btree" ("dismissed_at", "is_read", "created_at" DESC);



CREATE INDEX "product_listings_organization_id_idx" ON "public"."product_listings" USING "btree" ("organization_id");



CREATE INDEX "product_listings_product_id_idx" ON "public"."product_listings" USING "btree" ("product_id");



CREATE INDEX "products_organization_id_idx" ON "public"."products" USING "btree" ("organization_id");



CREATE INDEX "public_signup_events_created_idx" ON "public"."public_signup_events" USING "btree" ("created_at" DESC);



CREATE INDEX "purchase_invoices_org_date_idx" ON "public"."purchase_invoices" USING "btree" ("organization_id", "date" DESC);



CREATE INDEX "saas_announcements_published_idx" ON "public"."saas_announcements" USING "btree" ("published", "published_at" DESC);



CREATE INDEX "saas_changelog_published_idx" ON "public"."saas_changelog" USING "btree" ("published", "published_at" DESC);



CREATE INDEX "saas_email_delivery_logs_created_idx" ON "public"."saas_email_delivery_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "saas_email_delivery_logs_status_idx" ON "public"."saas_email_delivery_logs" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "saas_email_outbox_status_idx" ON "public"."saas_email_outbox" USING "btree" ("status", "scheduled_at");



CREATE INDEX "saas_email_retry_idx" ON "public"."saas_email_outbox" USING "btree" ("status", "next_attempt_at", "attempts");



CREATE INDEX "saas_support_org_status_idx" ON "public"."saas_support_tickets" USING "btree" ("organization_id", "status", "created_at" DESC);



CREATE INDEX "sales_invoices_org_date_idx" ON "public"."sales_invoices" USING "btree" ("organization_id", "date" DESC);



CREATE INDEX "storefront_events_created_at_idx" ON "public"."storefront_events" USING "btree" ("created_at" DESC);



CREATE INDEX "storefront_events_product_idx" ON "public"."storefront_events" USING "btree" ("product_id", "event_type");



CREATE INDEX "subscription_change_requests_org_idx" ON "public"."subscription_change_requests" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "subscription_payments_invoice_idx" ON "public"."subscription_payments" USING "btree" ("provider", "provider_invoice_id", "attempted_at" DESC);



CREATE INDEX "subscription_payments_org_idx" ON "public"."subscription_payments" USING "btree" ("organization_id", "created_at" DESC);



CREATE UNIQUE INDEX "subscription_payments_provider_id_uidx" ON "public"."subscription_payments" USING "btree" ("provider", "provider_payment_id");



CREATE INDEX "subscription_webhook_events_created_idx" ON "public"."subscription_webhook_events" USING "btree" ("provider", "created_at" DESC);



CREATE OR REPLACE TRIGGER "approved_users_sync_membership" AFTER INSERT OR DELETE OR UPDATE ON "public"."approved_users" FOR EACH ROW EXECUTE FUNCTION "public"."sync_approved_user_membership"();



CREATE OR REPLACE TRIGGER "marketplace_sales_plan_limit" BEFORE INSERT ON "public"."marketplace_order_links" FOR EACH ROW EXECUTE FUNCTION "public"."assert_marketplace_sales_limit"();



CREATE OR REPLACE TRIGGER "organization_members_plan_limit" BEFORE INSERT OR UPDATE OF "organization_id", "status" ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."assert_organization_user_limit"();



CREATE OR REPLACE TRIGGER "platform_backup_error_notification" AFTER INSERT OR UPDATE ON "public"."backup_runs" FOR EACH ROW EXECUTE FUNCTION "public"."notify_platform_backup_error"();



CREATE OR REPLACE TRIGGER "platform_connector_error_notification" AFTER INSERT OR UPDATE ON "public"."organization_connectors" FOR EACH ROW EXECUTE FUNCTION "public"."notify_platform_connector_error"();



CREATE OR REPLACE TRIGGER "platform_support_ticket_notification" AFTER INSERT ON "public"."saas_support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."notify_platform_support_ticket"();



ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."approved_users"
    ADD CONSTRAINT "approved_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."auto_sync_runs"
    ADD CONSTRAINT "auto_sync_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."backup_runs"
    ADD CONSTRAINT "backup_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_linked_cash_entry_id_fkey" FOREIGN KEY ("linked_cash_entry_id") REFERENCES "public"."cash_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_linked_order_id_fkey" FOREIGN KEY ("linked_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_recurrence_parent_id_fkey" FOREIGN KEY ("recurrence_parent_id") REFERENCES "public"."calendar_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_settings"
    ADD CONSTRAINT "calendar_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."commercial_suggestions"
    ADD CONSTRAINT "commercial_suggestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."custom_tags"
    ADD CONSTRAINT "custom_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."das_payments"
    ADD CONSTRAINT "das_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_settings"
    ADD CONSTRAINT "financial_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fiscal_documents"
    ADD CONSTRAINT "fiscal_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_files"
    ADD CONSTRAINT "lead_files_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_files"
    ADD CONSTRAINT "lead_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."listing_analytics"
    ADD CONSTRAINT "listing_analytics_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_analytics"
    ADD CONSTRAINT "listing_analytics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."listing_fee_sync"
    ADD CONSTRAINT "listing_fee_sync_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_fee_sync"
    ADD CONSTRAINT "listing_fee_sync_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."logistics_events"
    ADD CONSTRAINT "logistics_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."logistics_events"
    ADD CONSTRAINT "logistics_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_accounts"
    ADD CONSTRAINT "marketplace_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."marketplace_documents"
    ADD CONSTRAINT "marketplace_documents_internal_order_id_fkey" FOREIGN KEY ("internal_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketplace_documents"
    ADD CONSTRAINT "marketplace_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."marketplace_oauth_states"
    ADD CONSTRAINT "marketplace_oauth_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_order_links"
    ADD CONSTRAINT "marketplace_order_links_internal_order_id_fkey" FOREIGN KEY ("internal_order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_order_links"
    ADD CONSTRAINT "marketplace_order_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."marketplace_reviews"
    ADD CONSTRAINT "marketplace_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."marketplace_sync_log"
    ADD CONSTRAINT "marketplace_sync_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."order_history_events"
    ADD CONSTRAINT "order_history_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."order_logistics"
    ADD CONSTRAINT "order_logistics_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_logistics"
    ADD CONSTRAINT "order_logistics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."organization_connectors"
    ADD CONSTRAINT "organization_connectors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_pending_plan_code_fkey" FOREIGN KEY ("pending_plan_code") REFERENCES "public"."subscription_plans"("code");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "public"."subscription_plans"("code");



ALTER TABLE ONLY "public"."platform_admin_logs"
    ADD CONSTRAINT "platform_admin_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_notifications"
    ADD CONSTRAINT "platform_notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_listings"
    ADD CONSTRAINT "product_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_listings"
    ADD CONSTRAINT "product_listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_signup_events"
    ADD CONSTRAINT "public_signup_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."responsibles"
    ADD CONSTRAINT "responsibles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."saas_announcements"
    ADD CONSTRAINT "saas_announcements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saas_email_delivery_logs"
    ADD CONSTRAINT "saas_email_delivery_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saas_email_delivery_logs"
    ADD CONSTRAINT "saas_email_delivery_logs_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "public"."saas_email_outbox"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saas_email_outbox"
    ADD CONSTRAINT "saas_email_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saas_email_outbox"
    ADD CONSTRAINT "saas_email_outbox_template_code_fkey" FOREIGN KEY ("template_code") REFERENCES "public"."saas_email_templates"("code");



ALTER TABLE ONLY "public"."saas_support_tickets"
    ADD CONSTRAINT "saas_support_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seller_metrics"
    ADD CONSTRAINT "seller_metrics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."storefront_events"
    ADD CONSTRAINT "storefront_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."subscription_change_requests"
    ADD CONSTRAINT "subscription_change_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_change_requests"
    ADD CONSTRAINT "subscription_change_requests_requested_plan_code_fkey" FOREIGN KEY ("requested_plan_code") REFERENCES "public"."subscription_plans"("code");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."organization_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE "public"."access_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins manage connectors" ON "public"."organization_connectors" TO "authenticated" USING ("public"."can_edit_org"("organization_id")) WITH CHECK ("public"."can_edit_org"("organization_id"));



CREATE POLICY "admins manage reviews" ON "public"."marketplace_reviews" TO "authenticated" USING ("public"."can_edit_org"("organization_id")) WITH CHECK ("public"."can_edit_org"("organization_id"));



ALTER TABLE "public"."approved_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_events_delete_own_org" ON "public"."audit_events" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "audit_events_insert_own_org" ON "public"."audit_events" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "audit_events_select_own_org" ON "public"."audit_events" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "audit_events_update_own_org" ON "public"."audit_events" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "authenticated read active plans" ON "public"."subscription_plans" FOR SELECT TO "authenticated" USING (("active" = true));



ALTER TABLE "public"."auto_sync_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auto_sync_runs_select_own_org" ON "public"."auto_sync_runs" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."backup_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "backup_runs_delete_own_org" ON "public"."backup_runs" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "backup_runs_insert_own_org" ON "public"."backup_runs" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "backup_runs_select_own_org" ON "public"."backup_runs" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "backup_runs_update_own_org" ON "public"."backup_runs" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_events_delete" ON "public"."calendar_events" FOR DELETE USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "calendar_events_insert" ON "public"."calendar_events" FOR INSERT WITH CHECK ("public"."user_in_organization"("organization_id"));



CREATE POLICY "calendar_events_select" ON "public"."calendar_events" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "calendar_events_update" ON "public"."calendar_events" FOR UPDATE USING ("public"."user_in_organization"("organization_id")) WITH CHECK ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."calendar_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_settings_insert" ON "public"."calendar_settings" FOR INSERT WITH CHECK ("public"."user_in_organization"("organization_id"));



CREATE POLICY "calendar_settings_select" ON "public"."calendar_settings" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "calendar_settings_update" ON "public"."calendar_settings" FOR UPDATE USING ("public"."user_in_organization"("organization_id")) WITH CHECK ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."cash_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_entries_delete_own_org" ON "public"."cash_entries" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "cash_entries_insert_own_org" ON "public"."cash_entries" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "cash_entries_select_own_org" ON "public"."cash_entries" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "cash_entries_update_own_org" ON "public"."cash_entries" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."commercial_suggestions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commercial_suggestions_delete_own_org" ON "public"."commercial_suggestions" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "commercial_suggestions_insert_own_org" ON "public"."commercial_suggestions" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "commercial_suggestions_select_own_org" ON "public"."commercial_suggestions" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "commercial_suggestions_update_own_org" ON "public"."commercial_suggestions" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."crm_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_leads_delete_own_org" ON "public"."crm_leads" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "crm_leads_insert_own_org" ON "public"."crm_leads" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "crm_leads_select_own_org" ON "public"."crm_leads" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "crm_leads_update_own_org" ON "public"."crm_leads" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."custom_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_tags_delete_own_org" ON "public"."custom_tags" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "custom_tags_insert_own_org" ON "public"."custom_tags" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "custom_tags_select_own_org" ON "public"."custom_tags" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "custom_tags_update_own_org" ON "public"."custom_tags" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."das_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "das_payments_delete_own_org" ON "public"."das_payments" FOR DELETE TO "authenticated" USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "das_payments_insert_own_org" ON "public"."das_payments" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "das_payments_select_own_org" ON "public"."das_payments" FOR SELECT TO "authenticated" USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "das_payments_update_own_org" ON "public"."das_payments" FOR UPDATE TO "authenticated" USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."financial_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financial_settings_delete_own_org" ON "public"."financial_settings" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "financial_settings_insert_own_org" ON "public"."financial_settings" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "financial_settings_select_own_org" ON "public"."financial_settings" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "financial_settings_update_own_org" ON "public"."financial_settings" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."fiscal_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fiscal_documents_delete_own_org" ON "public"."fiscal_documents" FOR DELETE TO "authenticated" USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "fiscal_documents_insert_own_org" ON "public"."fiscal_documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "fiscal_documents_select_own_org" ON "public"."fiscal_documents" FOR SELECT TO "authenticated" USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "fiscal_documents_update_own_org" ON "public"."fiscal_documents" FOR UPDATE TO "authenticated" USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_items_delete_own_org" ON "public"."inventory_items" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "inventory_items_insert_own_org" ON "public"."inventory_items" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "inventory_items_select_own_org" ON "public"."inventory_items" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "inventory_items_update_own_org" ON "public"."inventory_items" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."lead_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_files_delete_own_org" ON "public"."lead_files" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "lead_files_insert_own_org" ON "public"."lead_files" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "lead_files_select_own_org" ON "public"."lead_files" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "lead_files_update_own_org" ON "public"."lead_files" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."listing_analytics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listing_analytics_select_own_org" ON "public"."listing_analytics" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."listing_fee_sync" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listing_fee_sync_select_own_org" ON "public"."listing_fee_sync" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."logistics_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "logistics_events_delete_own_org" ON "public"."logistics_events" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "logistics_events_insert_own_org" ON "public"."logistics_events" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "logistics_events_select_own_org" ON "public"."logistics_events" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "logistics_events_update_own_org" ON "public"."logistics_events" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."marketplace_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketplace_accounts_select_own_org" ON "public"."marketplace_accounts" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."marketplace_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketplace_listings_select_own_org" ON "public"."marketplace_listings" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."marketplace_oauth_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_order_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketplace_order_links_select_own_org" ON "public"."marketplace_order_links" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."marketplace_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketplace_reviews_delete_own_org" ON "public"."marketplace_reviews" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "marketplace_reviews_insert_own_org" ON "public"."marketplace_reviews" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "marketplace_reviews_select_own_org" ON "public"."marketplace_reviews" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "marketplace_reviews_update_own_org" ON "public"."marketplace_reviews" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."marketplace_sync_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marketplace_sync_log_select_own_org" ON "public"."marketplace_sync_log" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "materials_delete_own_org" ON "public"."materials" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "materials_insert_own_org" ON "public"."materials" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "materials_select_own_org" ON "public"."materials" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "materials_update_own_org" ON "public"."materials" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "members manage own support tickets" ON "public"."saas_support_tickets" TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_org_member"("organization_id"))) WITH CHECK (("public"."is_platform_admin"() OR "public"."is_org_member"("organization_id")));



CREATE POLICY "members read announcements" ON "public"."saas_announcements" FOR SELECT TO "authenticated" USING ((("published" = true) AND (("expires_at" IS NULL) OR ("expires_at" > "now"())) AND (("organization_id" IS NULL) OR "public"."is_org_member"("organization_id") OR "public"."is_platform_admin"())));



CREATE POLICY "members read changelog" ON "public"."saas_changelog" FOR SELECT TO "authenticated" USING ((("published" = true) OR "public"."is_platform_admin"()));



CREATE POLICY "members read connectors" ON "public"."organization_connectors" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "members read organization memberships" ON "public"."organization_members" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_org_member"("organization_id")));



CREATE POLICY "members read own organization" ON "public"."organizations" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_org_member"("id")));



CREATE POLICY "members read own payments" ON "public"."subscription_payments" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_org_member"("organization_id")));



CREATE POLICY "members read own plan requests" ON "public"."subscription_change_requests" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."is_org_member"("organization_id")));



CREATE POLICY "members read own subscription" ON "public"."organization_subscriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "member"
  WHERE (("member"."organization_id" = "organization_subscriptions"."organization_id") AND ("lower"("member"."user_email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))));



CREATE POLICY "members read storefront events" ON "public"."storefront_events" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own_org" ON "public"."notifications" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "notifications_insert_own_org" ON "public"."notifications" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "notifications_select_own_org" ON "public"."notifications" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "notifications_update_own_org" ON "public"."notifications" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."order_history_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_history_events_delete_own_org" ON "public"."order_history_events" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "order_history_events_insert_own_org" ON "public"."order_history_events" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "order_history_events_select_own_org" ON "public"."order_history_events" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "order_history_events_update_own_org" ON "public"."order_history_events" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."order_logistics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_logistics_delete_own_org" ON "public"."order_logistics" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "order_logistics_insert_own_org" ON "public"."order_logistics" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "order_logistics_select_own_org" ON "public"."order_logistics" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "order_logistics_update_own_org" ON "public"."order_logistics" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_delete_own_org" ON "public"."orders" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "orders_insert_own_org" ON "public"."orders" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "orders_select_own_org" ON "public"."orders" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "orders_update_own_org" ON "public"."orders" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "organization admins manage approved users" ON "public"."approved_users" TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."can_edit_org"("organization_id"))) WITH CHECK (("public"."is_platform_admin"() OR "public"."can_edit_org"("organization_id")));



CREATE POLICY "organization admins manage members" ON "public"."organization_members" TO "authenticated" USING (("public"."is_platform_admin"() OR "public"."can_edit_org"("organization_id"))) WITH CHECK (("public"."is_platform_admin"() OR "public"."can_edit_org"("organization_id")));



CREATE POLICY "organization admins update access requests" ON "public"."access_requests" FOR UPDATE TO "authenticated" USING (("public"."is_platform_admin"() OR (("organization_id" IS NOT NULL) AND "public"."can_edit_org"("organization_id")))) WITH CHECK (("public"."is_platform_admin"() OR (("organization_id" IS NOT NULL) AND "public"."can_edit_org"("organization_id"))));



ALTER TABLE "public"."organization_connectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_members_admin_manage_own_org" ON "public"."organization_members" USING ("public"."user_admin_in_organization"("organization_id")) WITH CHECK ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "organization_members_select_self_or_own_org" ON "public"."organization_members" FOR SELECT USING ((("user_email" = ("auth"."jwt"() ->> 'email'::"text")) OR "public"."user_admin_in_organization"("organization_id")));



ALTER TABLE "public"."organization_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_subscriptions_delete_own_org" ON "public"."organization_subscriptions" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "organization_subscriptions_insert_own_org" ON "public"."organization_subscriptions" FOR INSERT WITH CHECK ("public"."user_in_organization"("organization_id"));



CREATE POLICY "organization_subscriptions_select_own_org" ON "public"."organization_subscriptions" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "organization_subscriptions_update_own_org" ON "public"."organization_subscriptions" FOR UPDATE USING ("public"."user_in_organization"("organization_id")) WITH CHECK ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform admins manage notifications" ON "public"."platform_notifications" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "platform admins manage organizations" ON "public"."organizations" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "platform admins read administrative logs" ON "public"."platform_admin_logs" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "platform admins read email delivery logs" ON "public"."saas_email_delivery_logs" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "platform admins read platform admins" ON "public"."platform_admins" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."platform_admin_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_admin_logs_read_admin" ON "public"."platform_admin_logs" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_admins_read_admin" ON "public"."platform_admins" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."platform_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_notifications_read_admin" ON "public"."platform_notifications" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."product_listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_listings_delete_own_org" ON "public"."product_listings" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "product_listings_insert_own_org" ON "public"."product_listings" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "product_listings_select_own_org" ON "public"."product_listings" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "product_listings_update_own_org" ON "public"."product_listings" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete_own_org" ON "public"."products" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "products_insert_own_org" ON "public"."products" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "products_select_own_org" ON "public"."products" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "products_update_own_org" ON "public"."products" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "public creates storefront events" ON "public"."storefront_events" FOR INSERT TO "authenticated", "anon" WITH CHECK (("event_type" = ANY (ARRAY['product_view'::"text", 'buy_click'::"text", 'quote_click'::"text", 'custom_quote'::"text"])));



CREATE POLICY "public reads published reviews" ON "public"."marketplace_reviews" FOR SELECT TO "authenticated", "anon" USING (("status" = 'published'::"text"));



ALTER TABLE "public"."public_signup_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_signup_events_read_admin" ON "public"."public_signup_events" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."purchase_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_invoices_delete_own_org" ON "public"."purchase_invoices" FOR DELETE TO "authenticated" USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "purchase_invoices_insert_own_org" ON "public"."purchase_invoices" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "purchase_invoices_select_own_org" ON "public"."purchase_invoices" FOR SELECT TO "authenticated" USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "purchase_invoices_update_own_org" ON "public"."purchase_invoices" FOR UPDATE TO "authenticated" USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."responsibles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "responsibles_delete_own_org" ON "public"."responsibles" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "responsibles_insert_own_org" ON "public"."responsibles" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "responsibles_select_own_org" ON "public"."responsibles" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "responsibles_update_own_org" ON "public"."responsibles" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."saas_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_changelog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_email_delivery_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saas_email_delivery_logs_read_admin" ON "public"."saas_email_delivery_logs" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."saas_email_outbox" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saas_email_outbox_read_admin" ON "public"."saas_email_outbox" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."saas_email_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saas_email_templates_read_admin" ON "public"."saas_email_templates" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "saas_email_templates_write_admin" ON "public"."saas_email_templates" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



ALTER TABLE "public"."saas_support_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saas_support_tickets_delete_own_org" ON "public"."saas_support_tickets" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "saas_support_tickets_insert_own_org" ON "public"."saas_support_tickets" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "saas_support_tickets_select_own_org" ON "public"."saas_support_tickets" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "saas_support_tickets_update_own_org" ON "public"."saas_support_tickets" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."sales_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_invoices_delete_own_org" ON "public"."sales_invoices" FOR DELETE TO "authenticated" USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "sales_invoices_insert_own_org" ON "public"."sales_invoices" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "sales_invoices_select_own_org" ON "public"."sales_invoices" FOR SELECT TO "authenticated" USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "sales_invoices_update_own_org" ON "public"."sales_invoices" FOR UPDATE TO "authenticated" USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."security_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seller_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seller_metrics_select_own_org" ON "public"."seller_metrics" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



ALTER TABLE "public"."storefront_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "storefront_events_delete_own_org" ON "public"."storefront_events" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "storefront_events_insert_own_org" ON "public"."storefront_events" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "storefront_events_select_own_org" ON "public"."storefront_events" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "storefront_events_update_own_org" ON "public"."storefront_events" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."subscription_change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_payments_delete_own_org" ON "public"."subscription_payments" FOR DELETE USING ("public"."user_admin_in_organization"("organization_id"));



CREATE POLICY "subscription_payments_insert_own_org" ON "public"."subscription_payments" FOR INSERT WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



CREATE POLICY "subscription_payments_select_own_org" ON "public"."subscription_payments" FOR SELECT USING ("public"."user_in_organization"("organization_id"));



CREATE POLICY "subscription_payments_update_own_org" ON "public"."subscription_payments" FOR UPDATE USING ("public"."user_can_edit_organization"("organization_id")) WITH CHECK ("public"."user_can_edit_organization"("organization_id"));



ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_webhook_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_webhook_events_read_admin" ON "public"."subscription_webhook_events" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "users read own access request" ON "public"."access_requests" FOR SELECT TO "authenticated" USING ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR "public"."is_platform_admin"() OR (("organization_id" IS NOT NULL) AND "public"."can_edit_org"("organization_id"))));



CREATE POLICY "users read own approval" ON "public"."approved_users" FOR SELECT TO "authenticated" USING ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR "public"."is_platform_admin"() OR "public"."can_edit_org"("organization_id")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."assert_marketplace_sales_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."assert_marketplace_sales_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_marketplace_sales_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assert_organization_user_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."assert_organization_user_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_organization_user_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_edit_org"("candidate_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_edit_org"("candidate_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_org"("candidate_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_org"("candidate_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_sensitive_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_sensitive_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_sensitive_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_sensitive_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_organization_member_plan_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_organization_member_plan_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_organization_member_plan_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."flowops_normalized_role"("role_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."flowops_normalized_role"("role_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."flowops_normalized_role"("role_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approved_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_approved_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_email_approved"("candidate_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_email_approved"("candidate_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_email_approved"("candidate_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("candidate_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("candidate_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("candidate_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("candidate_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_platform_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_platform_backup_error"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_platform_backup_error"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_platform_backup_error"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_platform_connector_error"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_platform_connector_error"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_platform_connector_error"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_platform_support_ticket"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_platform_support_ticket"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_platform_support_ticket"() TO "service_role";



GRANT ALL ON FUNCTION "public"."organization_plan_limits"("candidate_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."organization_plan_limits"("candidate_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."organization_plan_limits"("candidate_organization_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."subscription_change_requests" TO "anon";
GRANT ALL ON TABLE "public"."subscription_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_change_requests" TO "service_role";



GRANT ALL ON FUNCTION "public"."request_subscription_plan_change"("target_plan_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_subscription_plan_change"("target_plan_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_subscription_plan_change"("target_plan_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_login_brand"("input_hostname" "text", "input_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_login_brand"("input_hostname" "text", "input_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_login_brand"("input_hostname" "text", "input_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_login_brand"("input_hostname" "text", "input_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_approved_user_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_approved_user_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_approved_user_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_admin_in_organization"("org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_admin_in_organization"("org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_admin_in_organization"("org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_edit_organization"("org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_edit_organization"("org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_edit_organization"("org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_in_organization"("org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_in_organization"("org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_in_organization"("org" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."access_requests" TO "anon";
GRANT ALL ON TABLE "public"."access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."access_requests" TO "service_role";



GRANT ALL ON TABLE "public"."approved_users" TO "anon";
GRANT ALL ON TABLE "public"."approved_users" TO "authenticated";
GRANT ALL ON TABLE "public"."approved_users" TO "service_role";



GRANT ALL ON TABLE "public"."audit_events" TO "anon";
GRANT ALL ON TABLE "public"."audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."auto_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."auto_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."backup_runs" TO "anon";
GRANT ALL ON TABLE "public"."backup_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_runs" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_settings" TO "anon";
GRANT ALL ON TABLE "public"."calendar_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_settings" TO "service_role";



GRANT ALL ON TABLE "public"."cash_entries" TO "anon";
GRANT ALL ON TABLE "public"."cash_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_entries" TO "service_role";



GRANT ALL ON TABLE "public"."commercial_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."commercial_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."commercial_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."crm_leads" TO "anon";
GRANT ALL ON TABLE "public"."crm_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_leads" TO "service_role";



GRANT ALL ON TABLE "public"."custom_tags" TO "anon";
GRANT ALL ON TABLE "public"."custom_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_tags" TO "service_role";



GRANT ALL ON TABLE "public"."das_payments" TO "anon";
GRANT ALL ON TABLE "public"."das_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."das_payments" TO "service_role";



GRANT ALL ON TABLE "public"."financial_settings" TO "anon";
GRANT ALL ON TABLE "public"."financial_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_settings" TO "service_role";



GRANT ALL ON TABLE "public"."fiscal_documents" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_documents" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."lead_files" TO "anon";
GRANT ALL ON TABLE "public"."lead_files" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_files" TO "service_role";



GRANT ALL ON TABLE "public"."listing_analytics" TO "anon";
GRANT ALL ON TABLE "public"."listing_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."listing_fee_sync" TO "anon";
GRANT ALL ON TABLE "public"."listing_fee_sync" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_fee_sync" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_events" TO "anon";
GRANT ALL ON TABLE "public"."logistics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_events" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_accounts" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_documents" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_documents" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_listings" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_oauth_states" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_oauth_states" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_oauth_states" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_order_links" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_order_links" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_order_links" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_reviews" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_sync_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."marketplace_sync_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."marketplace_sync_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."marketplace_sync_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."materials" TO "anon";
GRANT ALL ON TABLE "public"."materials" TO "authenticated";
GRANT ALL ON TABLE "public"."materials" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."order_history_events" TO "anon";
GRANT ALL ON TABLE "public"."order_history_events" TO "authenticated";
GRANT ALL ON TABLE "public"."order_history_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_history_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_history_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_history_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_logistics" TO "anon";
GRANT ALL ON TABLE "public"."order_logistics" TO "authenticated";
GRANT ALL ON TABLE "public"."order_logistics" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."organization_connectors" TO "anon";
GRANT ALL ON TABLE "public"."organization_connectors" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_connectors" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organization_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."organization_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admin_logs" TO "anon";
GRANT ALL ON TABLE "public"."platform_admin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admin_logs" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."platform_notifications" TO "anon";
GRANT ALL ON TABLE "public"."platform_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."product_listings" TO "anon";
GRANT ALL ON TABLE "public"."product_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."product_listings" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."public_signup_events" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_invoices" TO "anon";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."responsibles" TO "anon";
GRANT ALL ON TABLE "public"."responsibles" TO "authenticated";
GRANT ALL ON TABLE "public"."responsibles" TO "service_role";



GRANT ALL ON TABLE "public"."saas_announcements" TO "anon";
GRANT ALL ON TABLE "public"."saas_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."saas_changelog" TO "anon";
GRANT ALL ON TABLE "public"."saas_changelog" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_changelog" TO "service_role";



GRANT ALL ON TABLE "public"."saas_email_delivery_logs" TO "anon";
GRANT ALL ON TABLE "public"."saas_email_delivery_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_email_delivery_logs" TO "service_role";



GRANT ALL ON TABLE "public"."saas_email_outbox" TO "anon";
GRANT ALL ON TABLE "public"."saas_email_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_email_outbox" TO "service_role";



GRANT ALL ON TABLE "public"."saas_email_templates" TO "anon";
GRANT ALL ON TABLE "public"."saas_email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."saas_support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."saas_support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."sales_invoices" TO "anon";
GRANT ALL ON TABLE "public"."sales_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."security_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."security_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."security_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."seller_metrics" TO "anon";
GRANT ALL ON TABLE "public"."seller_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."seller_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."storefront_events" TO "anon";
GRANT ALL ON TABLE "public"."storefront_events" TO "authenticated";
GRANT ALL ON TABLE "public"."storefront_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."storefront_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."storefront_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."storefront_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_payments" TO "anon";
GRANT ALL ON TABLE "public"."subscription_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_payments" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_webhook_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







