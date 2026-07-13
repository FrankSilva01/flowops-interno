update public.subscription_plans
set active = true,
    updated_at = now()
where code = 'enterprise';
