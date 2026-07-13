create table if not exists public.fiscal_documents (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date date not null,
  type text not null,
  number text not null,
  description text,
  value numeric(14,2) not null default 0,
  status text not null default 'Pendente',
  due_date date,
  category text,
  payment_method text,
  issuer text,
  order_id text,
  product_id text,
  supplier text,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, type, number)
);

create table if not exists public.purchase_invoices (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date date not null,
  supplier text not null,
  invoice_number text not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'Pendente',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);

create table if not exists public.sales_invoices (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date date not null,
  client text not null,
  invoice_number text not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'Emitida',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);

create table if not exists public.das_payments (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month text not null,
  year integer not null,
  value numeric(14,2) not null default 0,
  status text not null default 'Pendente',
  due_date date,
  pix_code text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, month, year)
);

create index if not exists fiscal_documents_org_date_idx on public.fiscal_documents (organization_id, date desc);
create index if not exists fiscal_documents_org_order_idx on public.fiscal_documents (organization_id, order_id) where order_id is not null;
create index if not exists fiscal_documents_org_product_idx on public.fiscal_documents (organization_id, product_id) where product_id is not null;
create index if not exists purchase_invoices_org_date_idx on public.purchase_invoices (organization_id, date desc);
create index if not exists sales_invoices_org_date_idx on public.sales_invoices (organization_id, date desc);
create index if not exists das_payments_org_due_idx on public.das_payments (organization_id, due_date);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['fiscal_documents', 'purchase_invoices', 'sales_invoices', 'das_payments']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own_org', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own_org', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own_org', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own_org', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.user_in_organization(organization_id))', table_name || '_select_own_org', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.user_can_edit_organization(organization_id))', table_name || '_insert_own_org', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.user_can_edit_organization(organization_id)) with check (public.user_can_edit_organization(organization_id))', table_name || '_update_own_org', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.user_admin_in_organization(organization_id))', table_name || '_delete_own_org', table_name);
  end loop;
end $$;
