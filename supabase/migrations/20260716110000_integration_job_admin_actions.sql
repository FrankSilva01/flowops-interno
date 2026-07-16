begin;

create or replace function public.manage_integration_job(candidate_job_id uuid, candidate_action text)
returns public.integration_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.integration_jobs;
begin
  select * into target from public.integration_jobs where id = candidate_job_id for update;
  if target.id is null then raise exception 'Job nao encontrado.'; end if;
  if not public.user_admin_in_organization(target.organization_id) then raise exception 'Permissao de administrador obrigatoria.'; end if;
  if target.status <> 'dead_letter' then raise exception 'Somente falhas definitivas podem ser alteradas manualmente.'; end if;
  if candidate_action = 'retry' then
    update public.integration_jobs set status='retry', attempts=0, next_attempt_at=now(), locked_at=null, completed_at=null, last_error=null, updated_at=now()
    where id=target.id returning * into target;
  elsif candidate_action = 'cancel' then
    update public.integration_jobs set status='cancelled', locked_at=null, updated_at=now()
    where id=target.id returning * into target;
  else
    raise exception 'Acao invalida.';
  end if;
  return target;
end;
$$;

revoke all on function public.manage_integration_job(uuid,text) from public, anon;
grant execute on function public.manage_integration_job(uuid,text) to authenticated;

commit;
