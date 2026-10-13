\set ON_ERROR_STOP on
begin;
create function pg_temp.act(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.svc() returns void language plpgsql as $$ begin reset role; end $$;
create function pg_temp.expect_fail(sql text, needle text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(needle in sqlerrm) = 0 and position(needle in sqlstate) = 0 then raise exception 'FAILED WITH WRONG ERROR [%] for %: expected %', sqlerrm, sql, needle; end if;
    return;
  end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', sql;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'client@t.io',   '{"full_name":"Amara Client"}'),
 ('00000000-0000-0000-0000-00000000000b', 'designer@t.io', '{"full_name":"Atelier Nuru","role":"designer"}'),
 ('00000000-0000-0000-0000-00000000000c', 'other@t.io',    '{"full_name":"Other Client"}'),
 ('00000000-0000-0000-0000-00000000000d', 'admin@t.io',    '{"full_name":"Admin","role":"admin"}');
insert into public.admins values ('00000000-0000-0000-0000-00000000000d');

-- sign-up cannot self-assign admin
select 'admin signup role' as t, role from public.profiles where id = '00000000-0000-0000-0000-00000000000d';

update public.designer_profiles set accepting_orders = true where user_id = '00000000-0000-0000-0000-00000000000b';
insert into public.designer_payout (user_id, provider, account_ref, ready) values ('00000000-0000-0000-0000-00000000000b','paystack','ACCT_x',true);
insert into public.products (id, designer_id, name, price_minor, currency, customizable, options, image_urls, status)
 values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','Atlas Suit', 69000000, 'NGN', true,
         '{"colors":["Original","Onyx"],"fits":["Signature","Relaxed"]}', array['https://x/y.jpg'], 'live');

-- ===== CLIENT
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail($$select public.create_order('11111111-1111-1111-1111-111111111111')$$, 'address_required');
update public.profile_private set address = '{"line1":"1 Marina","city":"Lagos","country":"NG"}' where user_id = auth.uid();
select pg_temp.expect_fail($$select public.create_order('11111111-1111-1111-1111-111111111111')$$, 'measurements_required');
insert into public.measurements (user_id, sizes, source) values (auth.uid(), '{"Chest":"98","Waist":"80","Hips":"99","Height":"178"}', 'manual');
select pg_temp.expect_fail($$select public.create_order('11111111-1111-1111-1111-111111111111','{"color":"Neon"}')$$, 'invalid_option');
select 'order' as t, number, amount_minor, fee_minor, status from public.create_order('11111111-1111-1111-1111-111111111111','{"color":"Onyx","fit":"Relaxed"}','tight sleeves','deposit');

-- client cannot tamper with orders / call service RPCs / read others' private data
select pg_temp.expect_fail($$update public.orders set amount_minor = 1$$, 'permission denied');
select pg_temp.expect_fail($$select public.apply_payment('x','y',1,'NGN')$$, 'permission denied');
select pg_temp.expect_fail($$update public.profiles set role = 'designer' where id = auth.uid()$$, 'permission denied');
select pg_temp.expect_fail($$update public.profiles set status = 'active' where id = auth.uid()$$, 'permission denied');

create function pg_temp.assert_eq(label text, actual anyelement, expected anyelement) returns void language plpgsql as $$
begin if actual is distinct from expected then raise exception 'ASSERT % : got % expected %', label, actual, expected; end if; raise notice 'ok  %', label; end $$;

select pg_temp.assert_eq('client sees no payout rows', (select count(*) from public.designer_payout), 0::bigint);
select pg_temp.assert_eq('client cannot read designer private', (select count(*) from public.profile_private where user_id = '00000000-0000-0000-0000-00000000000b'), 0::bigint);
select pg_temp.assert_eq('server-side fee 10%', (select fee_minor from public.orders limit 1), 6900000::bigint);

-- ===== other client sees nothing
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_eq('other client sees 0 orders', (select count(*) from public.orders), 0::bigint);
select pg_temp.assert_eq('other client cannot see client profile', (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 0::bigint);

-- ===== privacy: designer must NOT see an unpaid order (measurements/address are inside it)
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert_eq('designer cannot see unpaid order', (select count(*) from public.orders), 0::bigint);
select pg_temp.assert_eq('designer cannot see unpaid client profile', (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 0::bigint);

-- ===== payments (service role)
select pg_temp.svc();
insert into public.payments (order_id, provider, reference, kind, amount_minor, fee_minor, currency)
  select id, 'paystack', 'TIT_1', 'deposit', 34500000, 3450000, 'NGN' from public.orders;
select pg_temp.assert_eq('amount mismatch rejected', (public.apply_payment('TIT_1','p1', 1, 'NGN') ->> 'error'), 'amount_mismatch');
update public.payments set status = 'pending', failure = null where reference = 'TIT_1';
select pg_temp.assert_eq('payment ok', (public.apply_payment('TIT_1','p1', 34500000, 'NGN') ->> 'ok'), 'true');
select pg_temp.assert_eq('payment idempotent', (public.apply_payment('TIT_1','p1', 34500000, 'NGN') ->> 'already'), 'true');
select pg_temp.assert_eq('order paid', (select status::text from public.orders), 'paid');
select pg_temp.assert_eq('amount_paid exactly once', (select amount_paid_minor from public.orders), 34500000::bigint);
select pg_temp.assert_eq('2 notifications (client+designer)', (select count(*) from public.notifications), 2::bigint);

-- ===== designer flow
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert_eq('designer sees order', (select count(*) from public.orders), 1::bigint);
select pg_temp.assert_eq('designer sees client name', (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 1::bigint);
select pg_temp.expect_fail($$select public.advance_order((select id from public.orders), 'assembly')$$, 'invalid_transition');
select public.advance_order((select id from public.orders), 'cutting', 'Pattern drafted');
select public.advance_order((select id from public.orders), 'assembly');
select public.advance_order((select id from public.orders), 'fitting_review');
select public.advance_order((select id from public.orders), 'finishing');
select pg_temp.expect_fail($$select public.advance_order((select id from public.orders), 'shipped')$$, 'balance_outstanding');
select public.request_balance((select id from public.orders));
select pg_temp.assert_eq('designer stats active', (public.designer_stats() ->> 'active_orders')::int, 1);
select pg_temp.expect_fail($$select * from public.admin_stats()$$, 'forbidden');

select pg_temp.svc();
insert into public.payments (order_id, provider, reference, kind, amount_minor, fee_minor, currency)
  select id, 'paystack', 'TIT_2', 'balance', 34500000, 3450000, 'NGN' from public.orders;
select public.apply_payment('TIT_2','p2', 34500000, 'NGN');
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select public.advance_order((select id from public.orders), 'shipped', 'DHL 123', '{"carrier":"DHL","number":"123"}');
select pg_temp.assert_eq('events logged', (select count(*) from public.order_events), 7::bigint);
select pg_temp.assert_eq('designer net earnings', (public.designer_stats() -> 'earnings' -> 0 ->> 'net_minor')::bigint, 62100000::bigint);

-- ===== refunds
select pg_temp.svc();
select public.apply_refund('TIT_2', 34500000);
select pg_temp.assert_eq('paid reduced after refund', (select amount_paid_minor from public.orders), 34500000::bigint);
select pg_temp.expect_fail($$select public.apply_refund('TIT_2', 1)$$, 'refund_exceeds_payment');

-- ===== admin gating: aal1 admin blocked, aal2 allowed
select pg_temp.act('00000000-0000-0000-0000-00000000000d', 'aal1');
select pg_temp.expect_fail($$select * from public.admin_stats()$$, 'forbidden');
select pg_temp.assert_eq('aal1 admin sees no broadcasts', (select count(*) from public.ads), 0::bigint);
select pg_temp.act('00000000-0000-0000-0000-00000000000d', 'aal2');
select pg_temp.assert_eq('admin stats clients', (public.admin_stats() ->> 'clients')::int, 2);
select pg_temp.assert_eq('admin stats daily series', jsonb_array_length(public.admin_stats() -> 'daily'), 30);
select pg_temp.assert_eq('admin list users', (select count(*) from public.admin_list_users(null, null, 50, 0)), 4::bigint);
select pg_temp.expect_fail($$select public.admin_set_user_status('00000000-0000-0000-0000-00000000000d','suspended')$$, 'cannot_modify_admin');

-- ads
insert into public.ads (id, title, audience, placement, status) values ('22222222-2222-2222-2222-222222222222','Eid Sale','clients','home_banner','active');
insert into public.ads (title, audience, placement, status) values ('Pro tools','designers','home_banner','active');
select pg_temp.expect_fail($$insert into public.ads (title, cta_url) values ('bad','javascript:alert(1)')$$, 'check');
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_eq('client gets only client ad', (select count(*) from public.get_ads('home_banner')), 1::bigint);
select public.track_ad('22222222-2222-2222-2222-222222222222','impression');
select public.track_ad('22222222-2222-2222-2222-222222222222','impression');
select public.track_ad('22222222-2222-2222-2222-222222222222','click');
select pg_temp.expect_fail($$insert into public.ads (title) values ('hack')$$, 'row-level security');
select pg_temp.act('00000000-0000-0000-0000-00000000000d', 'aal2');
select pg_temp.assert_eq('impressions deduped', (select impressions from public.ads where id = '22222222-2222-2222-2222-222222222222'), 1::bigint);
select pg_temp.assert_eq('click counted', (select clicks from public.ads where id = '22222222-2222-2222-2222-222222222222'), 1::bigint);

-- broadcast respects promo opt-in
insert into public.broadcasts (id, audience, category, title, body) values ('33333333-3333-3333-3333-333333333333','all','promo','Sale','50% off');
select pg_temp.assert_eq('promo reaches only opted-in (0)', public.send_broadcast('33333333-3333-3333-3333-333333333333'), 0);
insert into public.broadcasts (id, audience, category, title, body) values ('44444444-4444-4444-4444-444444444444','clients','announcement','Maintenance','Tonight');
select pg_temp.assert_eq('announcement reaches both clients', public.send_broadcast('44444444-4444-4444-4444-444444444444'), 2);
select pg_temp.expect_fail($$select public.send_broadcast('44444444-4444-4444-4444-444444444444')$$, 'already_sent');
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_eq('client got broadcast', (select count(*) from public.notifications where broadcast_id is not null), 1::bigint);
select pg_temp.expect_fail($$update public.notifications set title = 'x'$$, 'permission denied');
update public.notifications set read_at = now();

-- ===== AI quota
select pg_temp.svc();
select pg_temp.assert_eq('quota 1', public.consume_ai_quota('00000000-0000-0000-0000-00000000000a','tryon'), true);
select public.consume_ai_quota('00000000-0000-0000-0000-00000000000a','tryon') from generate_series(1,4);
select pg_temp.assert_eq('quota exhausted', public.consume_ai_quota('00000000-0000-0000-0000-00000000000a','tryon'), false);

-- ===== role/uid based self-promotion attempts
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail($$insert into public.admins values (auth.uid())$$, 'permission denied');
select pg_temp.expect_fail($$select public.set_push_webhook('a','b')$$, 'permission denied');
select pg_temp.expect_fail($$select * from public.app_config$$, 'permission denied');
rollback;
