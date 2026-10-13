-- =====================================================================
-- Tailor IT — Row Level Security, grants, storage, realtime
-- Principle: tables are closed by default. Writes that touch money, roles
-- or other users go through SECURITY DEFINER RPCs or the service role.
-- =====================================================================

alter table public.admins            enable row level security;
alter table public.profiles          enable row level security;
alter table public.profile_private   enable row level security;
alter table public.designer_profiles enable row level security;
alter table public.designer_payout   enable row level security;
alter table public.platform_settings enable row level security;
alter table public.app_config        enable row level security;
alter table public.products          enable row level security;
alter table public.favorites         enable row level security;
alter table public.follows           enable row level security;
alter table public.measurements      enable row level security;
alter table public.tryons            enable row level security;
alter table public.ai_usage          enable row level security;
alter table public.stylist_messages  enable row level security;
alter table public.orders            enable row level security;
alter table public.order_events      enable row level security;
alter table public.payments          enable row level security;
alter table public.notifications     enable row level security;
alter table public.device_tokens     enable row level security;
alter table public.broadcasts        enable row level security;
alter table public.ads               enable row level security;
alter table public.ad_events         enable row level security;
alter table public.audit_log         enable row level security;

-- Start from zero privileges, then grant exactly what the apps need.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---- profiles (public identity only)
grant select on public.profiles to authenticated;
grant update (full_name, handle, avatar_url, country) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or role = 'designer' or public.is_admin()
  or exists (select 1 from public.orders o where o.designer_id = auth.uid() and o.client_id = profiles.id));
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---- profile_private
grant select on public.profile_private to authenticated;
grant update (phone, address, marketing_opt_in, push_enabled, privacy_shield, ai_consent_at) on public.profile_private to authenticated;
create policy pp_select on public.profile_private for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy pp_update on public.profile_private for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- designer_profiles / payout
grant select on public.designer_profiles to authenticated;
grant update (brand_name, specialty, bio, cover_url) on public.designer_profiles to authenticated;
create policy dp_select on public.designer_profiles for select to authenticated using (true);
create policy dp_update on public.designer_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.designer_payout to authenticated;
create policy payout_select on public.designer_payout for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---- platform_settings (non-secret)
grant select on public.platform_settings to anon, authenticated;
create policy settings_public on public.platform_settings for select to anon using (key in ('terms_url','privacy_url','support_email','min_app_version'));
create policy settings_auth   on public.platform_settings for select to authenticated using (true);

-- ---- products
grant select, insert, update, delete on public.products to authenticated;
create policy products_select on public.products for select to authenticated using (
  designer_id = auth.uid() or public.is_admin()
  or (status = 'live' and exists (select 1 from public.profiles p where p.id = products.designer_id and p.status = 'active')));
create policy products_insert on public.products for insert to authenticated with check (
  designer_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'designer' and p.status = 'active'));
create policy products_update on public.products for update to authenticated using (designer_id = auth.uid()) with check (designer_id = auth.uid());
create policy products_delete on public.products for delete to authenticated using (designer_id = auth.uid());
create policy products_admin  on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- favourites / follows / measurements
grant select, insert, delete on public.favorites to authenticated;
create policy fav_all on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.follows to authenticated;
create policy follows_all on public.follows for all to authenticated using (client_id = auth.uid()) with check (client_id = auth.uid());
grant select, insert, update, delete on public.measurements to authenticated;
create policy meas_all on public.measurements for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- AI
grant select, delete on public.tryons to authenticated;
create policy tryons_select on public.tryons for select to authenticated using (user_id = auth.uid());
create policy tryons_delete on public.tryons for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.stylist_messages to authenticated;
create policy stylist_select on public.stylist_messages for select to authenticated using (user_id = auth.uid());
create policy stylist_delete on public.stylist_messages for delete to authenticated using (user_id = auth.uid());

-- ---- orders / payments (read-only to clients; mutations via RPC)
grant select on public.orders to authenticated;
-- Designers only see an order (and therefore the client's measurements/address) once money has actually been paid.
create policy orders_select on public.orders for select to authenticated using (
  client_id = auth.uid()
  or (designer_id = auth.uid() and (amount_paid_minor > 0 or status = 'refunded'))
  or public.is_admin());
grant select on public.order_events to authenticated;
create policy events_select on public.order_events for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_events.order_id and (o.client_id = auth.uid() or o.designer_id = auth.uid() or public.is_admin())));
grant select on public.payments to authenticated;
create policy payments_select on public.payments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = payments.order_id and (o.client_id = auth.uid() or o.designer_id = auth.uid() or public.is_admin())));

-- ---- notifications & devices
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.device_tokens to authenticated;
create policy dev_all on public.device_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- admin-only tables (is_admin() requires an MFA-verified session)
grant select, insert, update, delete on public.broadcasts to authenticated;
create policy broadcasts_admin on public.broadcasts for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.ads to authenticated;
create policy ads_admin on public.ads for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.ad_events to authenticated;
create policy adev_admin on public.ad_events for select to authenticated using (public.is_admin());
grant select on public.audit_log to authenticated;
create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());
grant select, insert, update on public.platform_settings to authenticated;
create policy settings_admin_w on public.platform_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Used by the cleanup-photos job to enforce the photo retention promise.
create or replace function public.storage_expired_objects(p_bucket text, p_days integer)
returns table (name text) language sql stable security definer set search_path = public, storage as $$
  select o.name from storage.objects o where o.bucket_id = p_bucket and o.created_at < now() - make_interval(days => p_days) limit 1000;
$$;

-- ---- function privileges: nothing is callable by PUBLIC by default
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

grant execute on function public.is_admin()                                   to authenticated;
grant execute on function public.create_order(uuid, jsonb, text, public.payment_plan) to authenticated;
grant execute on function public.cancel_order(uuid)                           to authenticated;
grant execute on function public.advance_order(uuid, public.order_status, text, jsonb) to authenticated;
grant execute on function public.request_balance(uuid)                        to authenticated;
grant execute on function public.designer_stats()                             to authenticated;
grant execute on function public.get_ads(public.ad_placement)                 to authenticated;
grant execute on function public.track_ad(uuid, text)                         to authenticated;
grant execute on function public.send_broadcast(uuid)                         to authenticated;
grant execute on function public.admin_stats()                                to authenticated;
grant execute on function public.admin_list_users(text, text, int, int)       to authenticated;
grant execute on function public.admin_set_user_status(uuid, text)            to authenticated;
grant execute on function public.admin_set_designer_verified(uuid, boolean)   to authenticated;
grant execute on function public.admin_update_setting(text, jsonb)            to authenticated;
-- service role only: notify, apply_payment, fail_payment, apply_refund, consume_ai_quota, account_deletion_blockers, set_push_webhook
grant execute on all functions in schema public to service_role;

-- ------------------------------------------------------------ realtime
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.orders;
  end if;
end $$;

-- ------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true,  8388608,  array['image/jpeg','image/png','image/webp']),
  ('avatars',        'avatars',        true,  3145728,  array['image/jpeg','image/png','image/webp']),
  ('ad-creatives',   'ad-creatives',   true,  5242880,  array['image/jpeg','image/png','image/webp']),
  ('tryon-inputs',   'tryon-inputs',   false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('tryon-results',  'tryon-results',  false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Convention: first path segment is the owner's user id.
create policy product_images_write on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'designer'));
create policy product_images_modify on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_modify on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy ad_creatives_admin on storage.objects for all to authenticated
  using (bucket_id = 'ad-creatives' and public.is_admin()) with check (bucket_id = 'ad-creatives' and public.is_admin());

create policy tryon_inputs_write on storage.objects for insert to authenticated
  with check (bucket_id = 'tryon-inputs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy tryon_inputs_read on storage.objects for select to authenticated
  using (bucket_id = 'tryon-inputs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy tryon_inputs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tryon-inputs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy tryon_results_read on storage.objects for select to authenticated
  using (bucket_id = 'tryon-results' and (storage.foldername(name))[1] = auth.uid()::text);
create policy tryon_results_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tryon-results' and (storage.foldername(name))[1] = auth.uid()::text);
