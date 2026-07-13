alter table if exists public.fiscal_documents
  add column if not exists due_date date,
  add column if not exists category text,
  add column if not exists payment_method text,
  add column if not exists issuer text,
  add column if not exists order_id text,
  add column if not exists product_id text,
  add column if not exists supplier text,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists checksum_sha256 text,
  add column if not exists updated_at timestamptz default now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiscal-documents',
  'fiscal-documents',
  false,
  20971520,
  array['application/pdf', 'application/xml', 'text/xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fiscal_documents_storage_select on storage.objects;
create policy fiscal_documents_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'fiscal-documents'
  and public.user_in_organization(((storage.foldername(name))[1])::uuid)
);

drop policy if exists fiscal_documents_storage_insert on storage.objects;
create policy fiscal_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'fiscal-documents'
  and public.user_can_edit_organization(((storage.foldername(name))[1])::uuid)
);

drop policy if exists fiscal_documents_storage_update on storage.objects;
create policy fiscal_documents_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'fiscal-documents'
  and public.user_can_edit_organization(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'fiscal-documents'
  and public.user_can_edit_organization(((storage.foldername(name))[1])::uuid)
);

drop policy if exists fiscal_documents_storage_delete on storage.objects;
create policy fiscal_documents_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'fiscal-documents'
  and public.user_admin_in_organization(((storage.foldername(name))[1])::uuid)
);
