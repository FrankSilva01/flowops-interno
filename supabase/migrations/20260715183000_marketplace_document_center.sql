alter table public.marketplace_documents
  add column if not exists storage_path text,
  add column if not exists size_bytes bigint,
  add column if not exists source text not null default 'marketplace',
  add column if not exists downloaded_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-documents',
  'marketplace-documents',
  false,
  20971520,
  array['application/pdf', 'application/xml', 'text/xml', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marketplace_documents_storage_select on storage.objects;
create policy marketplace_documents_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'marketplace-documents'
  and public.user_in_organization(((storage.foldername(name))[1])::uuid)
);

drop policy if exists marketplace_documents_storage_insert on storage.objects;
create policy marketplace_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'marketplace-documents'
  and public.user_can_edit_organization(((storage.foldername(name))[1])::uuid)
);

drop policy if exists marketplace_documents_storage_update on storage.objects;
create policy marketplace_documents_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'marketplace-documents'
  and public.user_can_edit_organization(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'marketplace-documents'
  and public.user_can_edit_organization(((storage.foldername(name))[1])::uuid)
);

drop policy if exists marketplace_documents_storage_delete on storage.objects;
create policy marketplace_documents_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'marketplace-documents'
  and public.user_admin_in_organization(((storage.foldername(name))[1])::uuid)
);

create index if not exists marketplace_documents_storage_path_idx
  on public.marketplace_documents (organization_id, storage_path)
  where storage_path is not null;
