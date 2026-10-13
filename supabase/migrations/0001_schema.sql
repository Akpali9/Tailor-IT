-- =====================================================================
-- Tailor IT — core schema
-- Money is always stored as integer minor units (kobo, cents, ...).
-- =====================================================================

create type public.user_role      as enum ('client', 'designer');
create type public.order_status   as enum ('pending_payment','paid','cutting','assembly','fitting_review','finishing','shipped','delivered','cancelled','refunded');
create type public.payment_plan   as enum ('full', 'deposit');
create type public.payment_kind   as enum ('full', 'deposit', 'balance');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.ad_audience    as enum ('clients', 'designers', 'all');
create type public.ad_placement   as enum ('home_banner', 'feed_card', 'designer_home', 'interstitial');

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Admin = row in public.admins AND an MFA-verified (aal2) session.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- -------------------------------------------------------------- profiles
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       public.user_role not null default 'client',
  full_name  text not null default '',
  handle     text unique,
  avatar_url text,
  country    text,
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Private per-user data: never readable by other users.
create table public.profile_private (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  phone            text,
  address          jsonb,
  referral_code    text unique,
  referred_by      uuid references public.profiles(id) on delete set null,
  marketing_opt_in boolean not null default false,
  push_enabled     boolean not null default true,
  privacy_shield   boolean not null default true,
  ai_consent_at    timestamptz,
  updated_at       timestamptz not null default now()
);
create trigger profile_private_touch before update on public.profile_private for each row execute function public.touch_updated_at();

create table public.designer_profiles (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  brand_name       text not null default '',
  specialty        text,
  bio              text,
  cover_url        text,
  verified         boolean not null default false,
  accepting_orders boolean not null default false,
  followers_count  integer not null default 0,
  commission_bps_override integer check (commission_bps_override between 0 and 5000),
  updated_at       timestamptz not null default now()
);
create trigger designer_profiles_touch before update on public.designer_profiles for each row execute function public.touch_updated_at();

-- Payout details are private to the designer (service role writes).
create table public.designer_payout (
  user_id    uuid primary key references public.designer_profiles(user_id) on delete cascade,
  provider   text not null check (provider in ('paystack','stripe')),
  account_ref text not null,
  ready      boolean not null default false,
  country    text,
  currency   text,
  details    jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'client';
  v_name text;
  v_base text;
begin
  if (new.raw_user_meta_data ->> 'role') = 'designer' then v_role := 'designer'; end if;
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email,'user'), '@', 1));
  v_base := coalesce(nullif(lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g')), ''), 'user');
  insert into public.profiles (id, role, full_name, handle)
  values (new.id, v_role, v_name, left(v_base, 20) || substr(md5(new.id::text), 1, 4));
  insert into public.profile_private (user_id, referral_code, referred_by)
  values (new.id,
          upper(substr(md5(new.id::text || clock_timestamp()::text), 1, 8)),
          (select pp.user_id from public.profile_private pp
            where pp.referral_code = upper(nullif(new.raw_user_meta_data ->> 'referral_code', '')) limit 1));
  if v_role = 'designer' then
    insert into public.designer_profiles (user_id, brand_name) values (new.id, v_name);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------- platform config
create table public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('fee_bps',                       '1000'),
  ('deposit_percent',               '50'),
  ('default_currency',              '"NGN"'),
  ('require_designer_verification', 'false'),
  ('ai_daily_limits',               '{"stylist":30,"tryon":5,"measure":5,"copy":20}'),
  ('support_email',                 '"support@tailorit.app"'),
  ('terms_url',                     '"https://tailorit.app/terms"'),
  ('privacy_url',                   '"https://tailorit.app/privacy"'),
  ('min_app_version',               '"1.0.0"');

-- Private key/value store (no policies, no grants: only SECURITY DEFINER code reads it).
create table public.app_config (key text primary key, value text not null);

-- -------------------------------------------------------------- catalogue
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  designer_id   uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 80),
  fabric        text,
  color         text,
  category      text not null default 'Women' check (category in ('Women','Men','Unisex')),
  description   text,
  price_minor   bigint not null check (price_minor > 0),
  currency      text not null default 'NGN' check (char_length(currency) = 3),
  customizable  boolean not null default false,
  options       jsonb not null default '{"colors":["Original"],"fits":["Signature"]}',
  lead_time_days integer not null default 21 check (lead_time_days between 1 and 180),
  image_urls    text[] not null default '{}',
  status        text not null default 'draft' check (status in ('draft','live','archived')),
  tryon_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_live_idx on public.products (status, created_at desc);
create index products_designer_idx on public.products (designer_id);
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

create or replace function public.products_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_require boolean; v_verified boolean;
begin
  if new.status = 'live' then
    if cardinality(new.image_urls) = 0 then raise exception 'product_needs_image'; end if;
    select coalesce((value #>> '{}')::boolean, false) into v_require from public.platform_settings where key = 'require_designer_verification';
    select verified into v_verified from public.designer_profiles where user_id = new.designer_id;
    if coalesce(v_require, false) and not coalesce(v_verified, false) then raise exception 'designer_not_verified'; end if;
  end if;
  return new;
end $$;
create trigger products_guard_trg before insert or update on public.products for each row execute function public.products_guard();

create table public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.follows (
  client_id   uuid not null references public.profiles(id) on delete cascade,
  designer_id uuid not null references public.designer_profiles(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (client_id, designer_id)
);
create or replace function public.follows_count() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.designer_profiles set followers_count = followers_count + 1 where user_id = new.designer_id;
  else update public.designer_profiles set followers_count = greatest(followers_count - 1, 0) where user_id = old.designer_id; end if;
  return null;
end $$;
create trigger follows_count_trg after insert or delete on public.follows for each row execute function public.follows_count();

-- ------------------------------------------------------------ fit profile
create table public.measurements (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  sizes      jsonb not null default '{}',
  source     text not null default 'manual' check (source in ('manual','ai_estimate','mixed')),
  confidence smallint check (confidence between 0 and 100),
  updated_at timestamptz not null default now()
);
create trigger measurements_touch before update on public.measurements for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------- AI
create table public.tryons (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  input_path      text not null,
  result_path     text,
  provider        text not null default 'fashn',
  provider_job_id text,
  status          text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  error           text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index tryons_user_idx on public.tryons (user_id, created_at desc);

create table public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind    text not null,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, kind, day)
);

create table public.stylist_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  product_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index stylist_messages_user_idx on public.stylist_messages (user_id, id desc);

-- Atomic daily quota. Service-role only (called by edge functions).
create or replace function public.consume_ai_quota(p_user uuid, p_kind text, p_default_limit integer default 10)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_limit integer; v_count integer;
begin
  select coalesce((value ->> p_kind)::int, p_default_limit) into v_limit from public.platform_settings where key = 'ai_daily_limits';
  v_limit := coalesce(v_limit, p_default_limit);
  insert into public.ai_usage (user_id, kind, day, count) values (p_user, p_kind, current_date, 1)
  on conflict (user_id, kind, day) do update set count = public.ai_usage.count + 1
  returning count into v_count;
  if v_count > v_limit then
    update public.ai_usage set count = count - 1 where user_id = p_user and kind = p_kind and day = current_date;
    return false;
  end if;
  return true;
end $$;

-- ----------------------------------------------------------- orders & pay
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  number              integer generated always as identity (start with 2048),
  client_id           uuid references public.profiles(id) on delete set null,
  designer_id         uuid references public.profiles(id) on delete set null,
  product_id          uuid references public.products(id) on delete set null,
  product_snapshot    jsonb not null,
  options             jsonb not null default '{}',
  note                text,
  measurements_snapshot jsonb not null,
  delivery_address    jsonb not null,
  currency            text not null,
  amount_minor        bigint not null check (amount_minor > 0),
  fee_minor           bigint not null check (fee_minor >= 0),
  amount_paid_minor   bigint not null default 0,
  payment_plan        public.payment_plan not null default 'full',
  status              public.order_status not null default 'pending_payment',
  estimated_delivery  date,
  tracking            jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index orders_client_idx   on public.orders (client_id, created_at desc);
create index orders_designer_idx on public.orders (designer_id, created_at desc);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table public.order_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     public.order_status not null,
  note       text,
  actor_id   uuid,
  created_at timestamptz not null default now()
);
create index order_events_idx on public.order_events (order_id, id);

create or replace function public.log_order_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, status, actor_id) values (new.id, new.status, auth.uid());
  end if;
  return null;
end $$;
create trigger orders_log_status after insert or update of status on public.orders for each row execute function public.log_order_status();

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  provider     text not null check (provider in ('paystack','stripe')),
  reference    text not null unique,
  provider_ref text,
  kind         public.payment_kind not null,
  amount_minor bigint not null check (amount_minor > 0),
  fee_minor    bigint not null default 0,
  currency     text not null,
  status       public.payment_status not null default 'pending',
  refunded_minor bigint not null default 0,
  failure      text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index payments_order_idx on public.payments (order_id);

-- --------------------------------------------------- messaging & adverts
create table public.notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null default 'system',
  title        text not null,
  body         text not null default '',
  data         jsonb not null default '{}',
  push         boolean not null default true,
  broadcast_id uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.device_tokens (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  token        text not null unique,
  platform     text not null check (platform in ('ios','android','web')),
  last_seen_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id);

create table public.broadcasts (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references auth.users(id) on delete set null,
  audience        text not null check (audience in ('clients','designers','all','user')),
  target_user     uuid references public.profiles(id) on delete set null,
  category        text not null default 'announcement' check (category in ('announcement','promo')),
  title           text not null check (char_length(title) between 1 and 120),
  body            text not null check (char_length(body) between 1 and 1000),
  deep_link       text,
  send_push       boolean not null default true,
  status          text not null default 'draft' check (status in ('draft','sent','failed')),
  recipient_count integer not null default 0,
  push_sent_count integer not null default 0,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table public.ads (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 80),
  body        text,
  image_url   text,
  cta_label   text,
  cta_url     text,
  audience    public.ad_audience not null default 'all',
  placement   public.ad_placement not null default 'home_banner',
  status      text not null default 'draft' check (status in ('draft','active','paused','ended')),
  priority    integer not null default 0,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  impressions bigint not null default 0,
  clicks      bigint not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (cta_url is null or cta_url ~ '^(https://|tailorit://)')
);
create index ads_active_idx on public.ads (status, placement);
create trigger ads_touch before update on public.ads for each row execute function public.touch_updated_at();

create table public.ad_events (
  id      bigint generated always as identity primary key,
  ad_id   uuid not null references public.ads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind    text not null check (kind in ('impression','click')),
  day     date not null default current_date,
  unique (ad_id, user_id, kind, day)
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Push fan-out: every inserted notification (push = true) is POSTed to the
-- push-dispatch edge function through pg_net. Configure with set_push_webhook().
create or replace function public.notify_push() returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if not new.push then return null; end if;
  select value into v_url    from public.app_config where key = 'push_webhook_url';
  select value into v_secret from public.app_config where key = 'push_webhook_secret';
  if v_url is null or v_secret is null then return null; end if;
  begin
    perform net.http_post(url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', v_secret),
      body := jsonb_build_object('notification_id', new.id));
  exception when others then
    -- never block the business transaction because push failed
    raise warning 'push webhook failed: %', sqlerrm;
  end;
  return null;
end $$;
create trigger notifications_push after insert on public.notifications for each row execute function public.notify_push();

create or replace function public.set_push_webhook(p_url text, p_secret text) returns void
language sql security definer set search_path = public as $$
  insert into public.app_config (key, value) values ('push_webhook_url', p_url), ('push_webhook_secret', p_secret)
  on conflict (key) do update set value = excluded.value;
$$;
