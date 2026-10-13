-- =====================================================================
-- Tailor IT — business logic (RPCs). All money rules live here, never in the client.
-- =====================================================================

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}', p_push boolean default true)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, data, push) values (p_user, p_kind, p_title, p_body, p_data, p_push);
$$;

-- ------------------------------------------------------------ create_order
create or replace function public.create_order(
  p_product uuid, p_options jsonb default '{}', p_note text default null, p_plan public.payment_plan default 'full'
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_me    public.profiles;
  v_prod  public.products;
  v_dp    public.designer_profiles;
  v_priv  public.profile_private;
  v_meas  public.measurements;
  v_fee_bps integer;
  v_fee   bigint;
  v_opts  jsonb := '{}';
  v_color text; v_fit text;
  v_order public.orders;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_me from public.profiles where id = v_uid;
  if not found or v_me.role <> 'client' or v_me.status <> 'active' then raise exception 'not_allowed'; end if;

  select * into v_prod from public.products where id = p_product and status = 'live';
  if not found then raise exception 'product_unavailable'; end if;
  select * into v_dp from public.designer_profiles where user_id = v_prod.designer_id;
  if not exists (select 1 from public.profiles where id = v_prod.designer_id and status = 'active') then raise exception 'designer_unavailable'; end if;
  if not v_dp.accepting_orders then raise exception 'designer_not_accepting_orders'; end if;

  select * into v_priv from public.profile_private where user_id = v_uid;
  if v_priv.address is null or coalesce(v_priv.address ->> 'line1','') = '' or coalesce(v_priv.address ->> 'city','') = '' or coalesce(v_priv.address ->> 'country','') = '' then
    raise exception 'address_required';
  end if;
  select * into v_meas from public.measurements where user_id = v_uid;
  if not found or (select count(*) from jsonb_object_keys(v_meas.sizes)) < 3 then raise exception 'measurements_required'; end if;

  if v_prod.customizable then
    v_color := coalesce(nullif(p_options ->> 'color',''), 'Original');
    v_fit   := coalesce(nullif(p_options ->> 'fit',''), 'Signature');
    if not (v_prod.options -> 'colors') ? v_color or not (v_prod.options -> 'fits') ? v_fit then raise exception 'invalid_option'; end if;
    v_opts := jsonb_build_object('color', v_color, 'fit', v_fit);
  end if;

  select coalesce(v_dp.commission_bps_override, (select (value #>> '{}')::int from public.platform_settings where key = 'fee_bps'), 1000) into v_fee_bps;
  v_fee := (v_prod.price_minor * v_fee_bps) / 10000;

  insert into public.orders (client_id, designer_id, product_id, product_snapshot, options, note, measurements_snapshot, delivery_address,
                             currency, amount_minor, fee_minor, payment_plan)
  values (v_uid, v_prod.designer_id, v_prod.id,
          jsonb_build_object('name', v_prod.name, 'fabric', v_prod.fabric, 'color', v_prod.color, 'image', v_prod.image_urls[1],
                             'lead_time_days', v_prod.lead_time_days, 'brand', v_dp.brand_name),
          v_opts, left(p_note, 500), v_meas.sizes, v_priv.address,
          upper(v_prod.currency), v_prod.price_minor, v_fee, p_plan)
  returning * into v_order;
  return v_order;
end $$;

create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order and client_id = auth.uid() for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_o.status <> 'pending_payment' then raise exception 'order_not_cancellable'; end if;
  update public.orders set status = 'cancelled' where id = p_order;
end $$;

-- Designer moves an order one step forward through production.
create or replace function public.advance_order(p_order uuid, p_status public.order_status, p_note text default null, p_tracking jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_o public.orders;
  v_flow public.order_status[] := array['paid','cutting','assembly','fitting_review','finishing','shipped','delivered']::public.order_status[];
  v_from int; v_to int; v_label text;
begin
  select * into v_o from public.orders where id = p_order and designer_id = auth.uid() for update;
  if not found then raise exception 'order_not_found'; end if;
  v_from := array_position(v_flow, v_o.status);
  v_to   := array_position(v_flow, p_status);
  if v_from is null or v_to is null or v_to <> v_from + 1 then raise exception 'invalid_transition'; end if;
  if p_status = 'shipped' and v_o.amount_paid_minor < v_o.amount_minor then raise exception 'balance_outstanding'; end if;

  update public.orders set status = p_status, tracking = coalesce(p_tracking, tracking) where id = p_order;
  if p_note is not null then
    update public.order_events set note = left(p_note, 300)
     where id = (select max(id) from public.order_events where order_id = p_order and status = p_status);
  end if;
  v_label := case p_status
    when 'cutting' then 'Your piece is being cut' when 'assembly' then 'Assembly has begun'
    when 'fitting_review' then 'Fitting review — your tailor is checking the fit' when 'finishing' then 'Final finishing touches'
    when 'shipped' then 'Your order is on its way' when 'delivered' then 'Delivered — enjoy your piece' else 'Order updated' end;
  perform public.notify(v_o.client_id, 'order', v_label, (v_o.product_snapshot ->> 'name') || ' · Order TI-' || v_o.number,
                        jsonb_build_object('order_id', v_o.id));
end $$;

create or replace function public.request_balance(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order and designer_id = auth.uid();
  if not found then raise exception 'order_not_found'; end if;
  if v_o.amount_paid_minor >= v_o.amount_minor or v_o.status in ('pending_payment','cancelled','refunded') then raise exception 'nothing_due'; end if;
  perform public.notify(v_o.client_id, 'payment', 'Balance due for your order',
                        'Pay the remaining balance so we can ship ' || (v_o.product_snapshot ->> 'name') || '.',
                        jsonb_build_object('order_id', v_o.id));
end $$;

-- ------------------------------------------------------------ payments
create or replace function public.apply_payment(p_reference text, p_provider_ref text, p_amount bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pay public.payments; v_ord public.orders; v_paid bigint;
begin
  select * into v_pay from public.payments where reference = p_reference for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_reference'); end if;
  if v_pay.status = 'succeeded' then return jsonb_build_object('ok', true, 'already', true, 'order_id', v_pay.order_id); end if;
  if v_pay.amount_minor <> p_amount or upper(v_pay.currency) <> upper(p_currency) then
    update public.payments set status = 'failed', failure = 'amount_mismatch' where id = v_pay.id;
    insert into public.audit_log (action, entity, entity_id, details) values ('payment_amount_mismatch', 'payment', v_pay.id::text,
      jsonb_build_object('expected', v_pay.amount_minor, 'got', p_amount, 'currency', p_currency));
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;

  update public.payments set status = 'succeeded', provider_ref = p_provider_ref, paid_at = now() where id = v_pay.id;
  select * into v_ord from public.orders where id = v_pay.order_id for update;
  v_paid := v_ord.amount_paid_minor + v_pay.amount_minor;

  if v_ord.status in ('cancelled','refunded') then
    update public.orders set amount_paid_minor = v_paid where id = v_ord.id;
    insert into public.audit_log (action, entity, entity_id, details) values ('payment_on_closed_order', 'order', v_ord.id::text,
      jsonb_build_object('payment', v_pay.id, 'amount', v_pay.amount_minor));
    return jsonb_build_object('ok', true, 'order_id', v_ord.id, 'closed', true);
  end if;

  update public.orders set
    amount_paid_minor = v_paid,
    status = case when status = 'pending_payment' then 'paid'::public.order_status else status end,
    estimated_delivery = case when status = 'pending_payment'
                              then current_date + coalesce((product_snapshot ->> 'lead_time_days')::int, 21) else estimated_delivery end
  where id = v_ord.id;

  perform public.notify(v_ord.client_id, 'payment', 'Payment received',
    (v_ord.product_snapshot ->> 'name') || ' · ' || v_pay.currency || ' ' || to_char(v_pay.amount_minor / 100.0, 'FM999,999,990.00'),
    jsonb_build_object('order_id', v_ord.id));
  if v_ord.status = 'pending_payment' then
    perform public.notify(v_ord.designer_id, 'order', 'New order received',
      (v_ord.product_snapshot ->> 'name') || ' · Order TI-' || v_ord.number, jsonb_build_object('order_id', v_ord.id));
  elsif v_paid >= v_ord.amount_minor then
    perform public.notify(v_ord.designer_id, 'payment', 'Balance paid in full', 'Order TI-' || v_ord.number || ' is fully paid.',
      jsonb_build_object('order_id', v_ord.id));
  end if;
  return jsonb_build_object('ok', true, 'order_id', v_ord.id);
end $$;

create or replace function public.fail_payment(p_reference text, p_reason text default null) returns void
language sql security definer set search_path = public as $$
  update public.payments set status = 'failed', failure = left(p_reason, 200) where reference = p_reference and status = 'pending';
$$;

create or replace function public.apply_refund(p_reference text, p_amount bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay public.payments; v_ord public.orders;
begin
  select * into v_pay from public.payments where reference = p_reference for update;
  if not found or v_pay.status not in ('succeeded','refunded') then raise exception 'payment_not_refundable'; end if;
  if v_pay.refunded_minor + p_amount > v_pay.amount_minor then raise exception 'refund_exceeds_payment'; end if;
  update public.payments set refunded_minor = refunded_minor + p_amount,
         status = case when refunded_minor + p_amount >= amount_minor then 'refunded'::public.payment_status else status end
   where id = v_pay.id;
  update public.orders set amount_paid_minor = greatest(amount_paid_minor - p_amount, 0) where id = v_pay.order_id returning * into v_ord;
  if v_ord.amount_paid_minor = 0 and v_ord.status not in ('shipped','delivered') then
    update public.orders set status = 'refunded' where id = v_ord.id;
  end if;
  perform public.notify(v_ord.client_id, 'payment', 'Refund issued', v_pay.currency || ' ' || to_char(p_amount / 100.0, 'FM999,999,990.00') || ' is on its way back to you.',
    jsonb_build_object('order_id', v_ord.id));
end $$;

-- -------------------------------------------------------- designer stats
create or replace function public.designer_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active_orders',   (select count(*) from public.orders where designer_id = auth.uid() and status in ('paid','cutting','assembly','fitting_review','finishing')),
    'awaiting_review', (select count(*) from public.orders where designer_id = auth.uid() and status = 'fitting_review'),
    'delivered',       (select count(*) from public.orders where designer_id = auth.uid() and status = 'delivered'),
    'live_products',   (select count(*) from public.products where designer_id = auth.uid() and status = 'live'),
    'tryons',          (select coalesce(sum(tryon_count),0) from public.products where designer_id = auth.uid()),
    'earnings', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'net_minor', net))
                 from (select o.currency,
                              sum(p.amount_minor - p.fee_minor - p.refunded_minor) filter (where p.status in ('succeeded','refunded')) as net
                         from public.payments p join public.orders o on o.id = p.order_id
                        where o.designer_id = auth.uid() group by o.currency) t), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------ adverts
create or replace function public.get_ads(p_placement public.ad_placement)
returns table (id uuid, title text, body text, image_url text, cta_label text, cta_url text, placement public.ad_placement)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.body, a.image_url, a.cta_label, a.cta_url, a.placement
    from public.ads a join public.profiles p on p.id = auth.uid()
   where a.status = 'active' and a.placement = p_placement
     and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
     and (a.audience = 'all' or (a.audience = 'clients' and p.role = 'client') or (a.audience = 'designers' and p.role = 'designer'))
   order by a.priority desc, random() limit 5;
$$;

create or replace function public.track_ad(p_ad uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null or p_kind not in ('impression','click') then return; end if;
  insert into public.ad_events (ad_id, user_id, kind) values (p_ad, auth.uid(), p_kind) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    update public.ads set impressions = impressions + (p_kind = 'impression')::int, clicks = clicks + (p_kind = 'click')::int where id = p_ad;
  end if;
exception when foreign_key_violation then null;
end $$;

-- ------------------------------------------------------------ broadcasts
-- Admin creates the broadcast row, then calls this to fan it out as in-app notifications.
-- Push delivery happens in the admin-broadcast edge function (service role).
create or replace function public.send_broadcast(p_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_b public.broadcasts; v_n integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_b from public.broadcasts where id = p_id for update;
  if not found then raise exception 'broadcast_not_found'; end if;
  if v_b.status = 'sent' then raise exception 'already_sent'; end if;

  insert into public.notifications (user_id, kind, title, body, data, push, broadcast_id)
  select p.id, 'broadcast:' || v_b.category, v_b.title, v_b.body,
         case when v_b.deep_link is null then '{}'::jsonb else jsonb_build_object('link', v_b.deep_link) end,
         false, v_b.id
    from public.profiles p
    left join public.profile_private pp on pp.user_id = p.id
   where p.status = 'active'
     and not exists (select 1 from public.admins a where a.user_id = p.id)
     and (   (v_b.audience = 'all')
          or (v_b.audience = 'clients'   and p.role = 'client')
          or (v_b.audience = 'designers' and p.role = 'designer')
          or (v_b.audience = 'user'      and p.id = v_b.target_user))
     and (v_b.category = 'announcement' or v_b.audience = 'user' or coalesce(pp.marketing_opt_in, false));
  get diagnostics v_n = row_count;

  update public.broadcasts set status = 'sent', recipient_count = v_n, sent_at = now() where id = p_id;
  insert into public.audit_log (admin_id, action, entity, entity_id, details)
  values (auth.uid(), 'broadcast_sent', 'broadcast', p_id::text, jsonb_build_object('recipients', v_n, 'audience', v_b.audience));
  return v_n;
end $$;

-- ------------------------------------------------------------ admin
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'clients',   (select count(*) from public.profiles pr where pr.role = 'client' and not exists (select 1 from public.admins a where a.user_id = pr.id)),
    'designers', (select count(*) from public.profiles pr where pr.role = 'designer'),
    'verified_designers', (select count(*) from public.designer_profiles where verified),
    'live_products', (select count(*) from public.products where status = 'live'),
    'orders_total',  (select count(*) from public.orders),
    'orders_active', (select count(*) from public.orders where status in ('paid','cutting','assembly','fitting_review','finishing','shipped')),
    'tryons_30d',    (select count(*) from public.tryons where created_at > now() - interval '30 days'),
    'revenue', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'gmv_minor', gmv, 'fees_minor', fees, 'refunded_minor', refunded))
                 from (select currency, sum(amount_minor) as gmv, sum(fee_minor) as fees, sum(refunded_minor) as refunded
                         from public.payments where status in ('succeeded','refunded') group by currency) t), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d::date,
                 'signups', (select count(*) from public.profiles where created_at::date = d::date),
                 'orders',  (select count(*) from public.orders   where created_at::date = d::date)) order by d)
               from generate_series(current_date - 29, current_date, interval '1 day') d), '[]'::jsonb)
  ) into r;
  return r;
end $$;

create or replace function public.admin_list_users(p_search text default null, p_role text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, full_name text, handle text, role public.user_role, status text, verified boolean, created_at timestamptz, last_sign_in_at timestamptz, orders bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.handle, p.role, p.status, coalesce(d.verified, false), p.created_at, u.last_sign_in_at,
           (select count(*) from public.orders o where o.client_id = p.id or o.designer_id = p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.designer_profiles d on d.user_id = p.id
     where (p_role is null or p.role::text = p_role)
       and (p_search is null or p.full_name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%' or p.handle ilike '%' || p_search || '%')
     order by p.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid_status'; end if;
  if exists (select 1 from public.admins where user_id = p_user) then raise exception 'cannot_modify_admin'; end if;
  update public.profiles set status = p_status where id = p_user;
  if p_status = 'suspended' then
    update public.products set status = 'draft' where designer_id = p_user and status = 'live';
  end if;
  insert into public.audit_log (admin_id, action, entity, entity_id, details) values (auth.uid(), 'user_status', 'profile', p_user::text, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_set_designer_verified(p_user uuid, p_verified boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.designer_profiles set verified = p_verified where user_id = p_user;
  insert into public.audit_log (admin_id, action, entity, entity_id, details) values (auth.uid(), 'designer_verified', 'profile', p_user::text, jsonb_build_object('verified', p_verified));
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_key = 'fee_bps' and ((p_value #>> '{}')::int not between 0 and 5000) then raise exception 'invalid_fee'; end if;
  if p_key = 'deposit_percent' and ((p_value #>> '{}')::int not between 10 and 90) then raise exception 'invalid_deposit'; end if;
  insert into public.platform_settings (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.audit_log (admin_id, action, entity, entity_id, details) values (auth.uid(), 'setting', 'platform_settings', p_key, jsonb_build_object('value', p_value));
end $$;

-- Account deletion helper used by the delete-account edge function (service role).
create or replace function public.account_deletion_blockers(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.orders
   where (client_id = p_user or designer_id = p_user)
     and status in ('pending_payment','paid','cutting','assembly','fitting_review','finishing','shipped');
$$;

create or replace function public.release_ai_quota(p_user uuid, p_kind text) returns void
language sql security definer set search_path = public as $$
  update public.ai_usage set count = greatest(count - 1, 0) where user_id = p_user and kind = p_kind and day = current_date;
$$;
