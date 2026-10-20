-- Decan Konnect Internet Services: multi-tenant captive portal schema
-- All business-owned rows carry business_id. RLS is defense in depth; the API
-- (service role) additionally enforces membership checks on every request.

create extension if not exists pgcrypto;

create type member_role as enum ('owner','admin','staff');
create type business_status as enum ('pending','active','suspended');
create type portal_mode as enum ('draft','preview','voucher_only','live');
create type network_model as enum ('independent','central');
create type router_status as enum ('not_configured','awaiting_enrollment','configuration_pending','connected','offline','authentication_failure','configuration_error');
create type payment_setup_status as enum ('not_configured','awaiting_credentials','awaiting_authorization','testing','verified','failed','disabled');
create type payment_method as enum ('till','paybill');
create type payment_status as enum ('pending','awaiting_verification','confirmed','failed','cancelled','expired');
create type payment_channel as enum ('stk','manual');
create type entitlement_status as enum ('pending_authorization','active','expired','revoked');
create type session_status as enum ('pending','active','expired','revoked','failed');
create type duration_unit as enum ('minute','hour','day','month');
create type voucher_status as enum ('unused','active','redeemed','expired','revoked');
create type command_type as enum ('authorize','revoke');
create type command_status as enum ('pending','sent','acked','failed');

create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- platform
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (char_length(name) between 2 and 120),
  display_name text not null check (char_length(display_name) between 2 and 120),
  category text not null default 'cybercafe',
  slug text not null,
  description text check (char_length(description) <= 1000),
  logo_url text,
  cover_url text,
  phone text,
  whatsapp text,
  email text,
  county text,
  town text,
  address text,
  welcome_message text check (char_length(welcome_message) <= 500),
  terms text check (char_length(terms) <= 10000),
  privacy text check (char_length(privacy) <= 10000),
  portal_mode portal_mode not null default 'draft',
  status business_status not null default 'pending',
  setup_step int not null default 1 check (setup_step between 1 and 7),
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' and slug !~ '--'),
  constraint slug_not_reserved check (slug not in (
    'admin','api','login','logout','register','signup','dashboard','settings','support','app','static',
    'assets','_next','public','portal','health','status','help','docs','terms','privacy','about',
    'contact','callback','callbacks','router','routers','www','mail','billing','account','auth','decan-konnect'))
);
create unique index businesses_slug_uq on businesses (lower(slug));
create index businesses_owner_idx on businesses (owner_id);
create trigger businesses_touch before update on businesses for each row execute function set_updated_at();

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on business_members (user_id);

create table hotspot_sites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  location text,
  network_model network_model not null default 'independent',
  hotspot_name text,
  created_at timestamptz not null default now()
);
create index hotspot_sites_business_idx on hotspot_sites (business_id);

create table routers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  site_id uuid not null references hotspot_sites(id) on delete cascade,
  public_id text not null unique default encode(gen_random_bytes(9), 'hex'),
  name text not null check (char_length(name) between 2 and 120),
  vendor text not null default 'mikrotik',
  model text,
  auth_method text not null default 'mac_hotspot',
  agent_token_hash text,            -- sha256 of bearer token; plaintext shown once
  serial_number text,               -- recorded on first poll; later mismatches fail auth
  identity text,
  ros_version text,
  status router_status not null default 'awaiting_enrollment',
  last_seen_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index routers_business_idx on routers (business_id);

-- ---------------------------------------------------------------- catalogue
create table packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  price_amount integer not null check (price_amount between 1 and 150000),
  currency char(3) not null default 'KES' check (currency = 'KES'),
  duration_unit duration_unit not null,
  duration_value integer not null,
  data_limit_mb integer check (data_limit_mb is null or data_limit_mb > 0),
  down_kbps integer check (down_kbps is null or down_kbps >= 64),
  up_kbps integer check (up_kbps is null or up_kbps >= 64),
  max_devices integer not null default 1 check (max_devices between 1 and 10),
  is_published boolean not null default false,
  status text not null default 'active' check (status in ('active','disabled','archived')),
  sort_order integer not null default 0,
  promo_label text check (char_length(promo_label) <= 30),
  schedule jsonb,   -- {"days":[0..6],"from":"HH:MM","to":"HH:MM"} in Africa/Nairobi
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint duration_allowed check (
    (duration_unit = 'minute' and duration_value in (15,30,45,60)) or
    (duration_unit = 'hour'   and duration_value in (1,5,8,12)) or
    (duration_unit = 'day'    and duration_value in (1,7,14)) or
    (duration_unit = 'month'  and duration_value = 1))
);
create index packages_business_idx on packages (business_id, status);
create trigger packages_touch before update on packages for each row execute function set_updated_at();

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone text,
  device_mac text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index customers_identity_uq on customers (business_id, (coalesce(phone,'')), (coalesce(device_mac,'')));

-- ---------------------------------------------------------------- payments
create table payment_provider_configs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  method payment_method,
  till_or_paybill text,        -- PartyB: Till number or Paybill number (the business's own)
  shortcode text,              -- BusinessShortCode used by Daraja (Paybill, or Till's store/head-office number)
  account_reference_rule text, -- e.g. 'DECAN' or '{phone}'; Paybill only
  instructions text check (char_length(instructions) <= 1000),
  daraja_env text not null default 'sandbox' check (daraja_env in ('sandbox','production')),
  encrypted_secrets text,      -- AES-256-GCM JSON {consumer_key, consumer_secret, passkey}
  callback_secret text not null unique default encode(gen_random_bytes(24), 'hex'),
  status payment_setup_status not null default 'not_configured',
  last_test_at timestamptz,
  last_test_result text,
  updated_at timestamptz not null default now()
);
create trigger ppc_touch before update on payment_provider_configs for each row execute function set_updated_at();

create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  package_id uuid references packages(id),
  router_id uuid references routers(id),
  customer_id uuid references customers(id),
  channel payment_channel not null,
  status payment_status not null default 'pending',
  is_test boolean not null default false,
  phone text,
  device_mac text,
  amount integer not null check (amount > 0),
  currency char(3) not null default 'KES',
  checkout_request_id text,
  merchant_request_id text,
  mpesa_receipt text,
  claimed_receipt text,            -- customer-claimed code; NOT proof of payment
  purchase_token_hash text not null,
  idempotency_key text not null,
  failure_reason text,
  result_code text,
  entitlement_id uuid,
  last_provider_query_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  confirmation_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_has_package check (is_test or package_id is not null)
);
create unique index payments_idem_uq on payments (business_id, idempotency_key);
create unique index payments_receipt_uq on payments (business_id, mpesa_receipt) where mpesa_receipt is not null;
create unique index payments_checkout_uq on payments (business_id, checkout_request_id) where checkout_request_id is not null;
create index payments_business_status_idx on payments (business_id, status, created_at desc);
create index payments_claimed_idx on payments (business_id, claimed_receipt) where claimed_receipt is not null;
create trigger payments_touch before update on payments for each row execute function set_updated_at();

create function guard_payment_transition() returns trigger language plpgsql as $$
begin
  if old.status = 'confirmed' and (new.amount <> old.amount or new.business_id <> old.business_id or new.package_id is distinct from old.package_id) then
    raise exception 'confirmed payment is immutable' using errcode = 'check_violation';
  end if;
  if old.status = new.status then return new; end if;
  if old.status = 'confirmed' then
    raise exception 'confirmed payment cannot change status (% -> %)', old.status, new.status using errcode = 'check_violation';
  end if;
  if old.status in ('pending','awaiting_verification') then return new; end if;
  if old.status in ('failed','cancelled','expired') and new.status = 'confirmed' then return new; end if; -- late verified callback
  raise exception 'illegal payment transition % -> %', old.status, new.status using errcode = 'check_violation';
end $$;
create trigger payments_guard before update on payments for each row execute function guard_payment_transition();

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  source text not null,            -- 'daraja_callback','stk_query','manual','reconciliation','system'
  event_type text not null,
  event_key text,                  -- dedupe key for provider callbacks
  raw jsonb,
  processing_result text,
  created_at timestamptz not null default now()
);
create unique index payment_events_key_uq on payment_events (event_key) where event_key is not null;
create index payment_events_payment_idx on payment_events (payment_id);

create table reconciliation_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  receipt text not null,
  amount integer not null check (amount > 0),
  phone text,
  paid_at timestamptz,
  matched_payment_id uuid references payments(id),
  imported_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id, receipt)
);

-- ---------------------------------------------------------------- vouchers
create table voucher_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  package_id uuid not null references packages(id),
  name text not null,
  quantity integer not null check (quantity between 1 and 1000),
  sale_class text not null default 'free' check (sale_class in ('free','sold','promo')),
  price_amount integer check (price_amount is null or price_amount >= 0),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  expires_at timestamptz,
  site_id uuid references hotspot_sites(id),
  router_id uuid references routers(id),
  device_restricted boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table vouchers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  batch_id uuid not null references voucher_batches(id) on delete cascade,
  package_id uuid not null references packages(id),
  code_hash text not null,          -- HMAC(pepper, business_id:code); plaintext never stored
  code_last4 text not null,
  status voucher_status not null default 'unused',
  max_uses integer not null default 1,
  use_count integer not null default 0,
  expires_at timestamptz,
  site_id uuid references hotspot_sites(id),
  router_id uuid references routers(id),
  device_restricted boolean not null default false,
  device_mac_lock text,
  sale_class text not null default 'free',
  price_amount integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint voucher_use_bounds check (use_count between 0 and max_uses),
  unique (business_id, code_hash)
);
create index vouchers_business_status_idx on vouchers (business_id, status, created_at desc);
create index vouchers_batch_idx on vouchers (batch_id);

-- ---------------------------------------------------------------- access
create table access_entitlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  package_id uuid references packages(id),
  customer_id uuid references customers(id),
  router_id uuid not null references routers(id),
  site_id uuid references hotspot_sites(id),
  source text not null check (source in ('payment','voucher','admin')),
  payment_id uuid unique references payments(id),
  voucher_id uuid references vouchers(id),
  access_token_hash text not null,
  device_mac text not null,
  status entitlement_status not null default 'pending_authorization',
  duration_unit duration_unit not null,      -- snapshots: later package edits never alter purchases
  duration_value integer not null,
  data_limit_mb integer,
  down_kbps integer,
  up_kbps integer,
  max_devices integer not null default 1,
  package_name text not null,
  valid_until timestamptz not null default (now() + interval '30 days'), -- claim window before activation
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create index entitlements_business_idx on access_entitlements (business_id, status);
create index entitlements_expiry_idx on access_entitlements (status, expires_at) where status = 'active';
alter table payments add constraint payments_entitlement_fk foreign key (entitlement_id) references access_entitlements(id);

create function guard_entitlement_transition() returns trigger language plpgsql as $$
begin
  if old.status = new.status then return new; end if;
  if old.status = 'pending_authorization' and new.status in ('active','revoked') then return new; end if;
  if old.status = 'active' and new.status in ('expired','revoked') then return new; end if;
  raise exception 'illegal entitlement transition % -> %', old.status, new.status using errcode = 'check_violation';
end $$;
create trigger entitlements_guard before update on access_entitlements for each row execute function guard_entitlement_transition();

create table voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  entitlement_id uuid references access_entitlements(id),
  router_id uuid references routers(id),
  device_mac text,
  idempotency_key text not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (voucher_id, idempotency_key)
);
create index voucher_redemptions_business_idx on voucher_redemptions (business_id, created_at desc);

create table access_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  entitlement_id uuid not null references access_entitlements(id) on delete cascade,
  router_id uuid not null references routers(id),
  device_mac text not null,
  status session_status not null default 'pending',
  authorized_at timestamptz,
  ended_at timestamptz,
  bytes_in bigint not null default 0,
  bytes_out bigint not null default 0,
  uptime_seconds bigint not null default 0,
  last_accounting_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_business_idx on access_sessions (business_id, status);
create index sessions_router_mac_idx on access_sessions (router_id, device_mac);

create table router_commands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  entitlement_id uuid references access_entitlements(id) on delete cascade,
  type command_type not null,
  payload jsonb not null default '{}',
  status command_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  acked_at timestamptz,
  created_at timestamptz not null default now()
);
create index router_commands_poll_idx on router_commands (router_id, status, available_at);

create table router_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  router_id uuid references routers(id) on delete cascade,
  type text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index router_events_router_idx on router_events (router_id, created_at desc);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  actor_id uuid,
  actor_type text not null default 'user',
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index audit_business_idx on audit_logs (business_id, created_at desc);
create function audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_no_update before update or delete on audit_logs for each row execute function audit_immutable();

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references auth.users(id),
  subject text not null check (char_length(subject) between 3 and 150),
  body text not null check (char_length(body) between 3 and 4000),
  status text not null default 'open' check (status in ('open','answered','closed')),
  staff_reply text,
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

-- ---------------------------------------------------------------- helpers
create function is_member(bid uuid, roles member_role[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members m
    where m.business_id = bid and m.user_id = auth.uid() and (roles is null or m.role = any(roles)));
$$;
create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create function write_audit(p_business uuid, p_actor uuid, p_type text, p_action text, p_entity_type text, p_entity_id text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs(business_id, actor_id, actor_type, action, entity_type, entity_id, detail)
  values (p_business, p_actor, p_type, p_action, p_entity_type, p_entity_id, p_detail);
$$;

create function compute_expiry(ts timestamptz, u duration_unit, v int) returns timestamptz
language sql immutable as $$
  select case u
    when 'minute' then ts + make_interval(mins => v)
    when 'hour'   then ts + make_interval(hours => v)
    when 'day'    then ts + make_interval(days => v)
    when 'month'  then ((ts at time zone 'Africa/Nairobi') + make_interval(months => v)) at time zone 'Africa/Nairobi'
  end;
$$;

create function rate_limit_hit(p_key text, p_window int, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare h int;
begin
  insert into rate_limits(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rate_limits.window_start < now() - make_interval(secs => p_window) then 1 else rate_limits.hits + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window) then now() else rate_limits.window_start end
  returning hits into h;
  return h <= p_max;
end $$;

-- ---------------------------------------------------------------- entitlement + command helpers
create function enqueue_command(p_business uuid, p_router uuid, p_ent uuid, p_type command_type)
returns uuid language sql security definer set search_path = public as $$
  insert into router_commands(business_id, router_id, entitlement_id, type) values (p_business, p_router, p_ent, p_type) returning id;
$$;

-- Confirm a payment exactly once. Safe to call repeatedly (callbacks, polling, manual).
create function confirm_payment(p_payment uuid, p_receipt text, p_amount numeric, p_source text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pay payments%rowtype; pkg packages%rowtype; cust uuid; ent uuid; rtr routers%rowtype;
begin
  select * into pay from payments where id = p_payment for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if pay.status = 'confirmed' then
    if pay.mpesa_receipt is null and p_receipt is not null then
      begin update payments set mpesa_receipt = p_receipt where id = pay.id;
      exception when unique_violation then null; end;
    end if;
    return jsonb_build_object('ok', true, 'already', true, 'entitlement_id', pay.entitlement_id);
  end if;

  if p_amount is not null and p_amount <> pay.amount then
    insert into payment_events(business_id, payment_id, source, event_type, raw, processing_result)
    values (pay.business_id, pay.id, p_source, 'amount_mismatch', jsonb_build_object('expected', pay.amount, 'got', p_amount), 'rejected');
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;

  begin
    update payments set status = 'confirmed', mpesa_receipt = coalesce(p_receipt, mpesa_receipt), confirmed_at = now(),
      confirmed_by = p_actor, confirmation_source = p_source, failure_reason = null where id = pay.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_receipt');
  end;

  insert into payment_events(business_id, payment_id, source, event_type, processing_result)
  values (pay.business_id, pay.id, p_source, 'confirmed', 'ok');

  if pay.is_test then
    update payment_provider_configs set status = 'verified', last_test_at = now(),
      last_test_result = 'Test STK payment of KES ' || pay.amount || ' was confirmed.' where business_id = pay.business_id;
    perform write_audit(pay.business_id, p_actor, case when p_actor is null then 'system' else 'user' end, 'payment.test_verified', 'payment', pay.id::text, null);
    return jsonb_build_object('ok', true, 'test', true);
  end if;

  select * into pkg from packages where id = pay.package_id;
  select * into rtr from routers where id = pay.router_id;
  insert into customers(business_id, phone, device_mac) values (pay.business_id, pay.phone, pay.device_mac)
  on conflict (business_id, (coalesce(phone,'')), (coalesce(device_mac,''))) do update set last_seen_at = now()
  returning id into cust;

  insert into access_entitlements(business_id, package_id, customer_id, router_id, site_id, source, payment_id, access_token_hash,
    device_mac, duration_unit, duration_value, data_limit_mb, down_kbps, up_kbps, max_devices, package_name)
  values (pay.business_id, pkg.id, cust, pay.router_id, rtr.site_id, 'payment', pay.id, pay.purchase_token_hash,
    pay.device_mac, pkg.duration_unit, pkg.duration_value, pkg.data_limit_mb, pkg.down_kbps, pkg.up_kbps, pkg.max_devices, pkg.name)
  returning id into ent;

  update payments set entitlement_id = ent, customer_id = cust where id = pay.id;
  perform enqueue_command(pay.business_id, pay.router_id, ent, 'authorize');
  perform write_audit(pay.business_id, p_actor, case when p_actor is null then 'system' else 'user' end, 'payment.confirmed', 'payment', pay.id::text,
    jsonb_build_object('source', p_source, 'amount', pay.amount));
  return jsonb_build_object('ok', true, 'entitlement_id', ent);
end $$;

-- Mark failed/cancelled/expired. Never touches a confirmed payment.
create function fail_payment(p_payment uuid, p_status payment_status, p_reason text, p_code text, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pay payments%rowtype;
begin
  select * into pay from payments where id = p_payment for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if pay.status = 'confirmed' then return jsonb_build_object('ok', true, 'ignored', 'already_confirmed'); end if;
  if pay.status in ('failed','cancelled','expired') then return jsonb_build_object('ok', true, 'ignored', 'already_final'); end if;
  update payments set status = p_status, failure_reason = p_reason, result_code = p_code where id = pay.id;
  insert into payment_events(business_id, payment_id, source, event_type, processing_result, raw)
  values (pay.business_id, pay.id, p_source, p_status::text, 'ok', jsonb_build_object('reason', p_reason, 'code', p_code));
  if pay.is_test then
    update payment_provider_configs set status = 'failed', last_test_at = now(), last_test_result = coalesce(p_reason, 'Test payment failed') where business_id = pay.business_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Atomic voucher redemption. Row lock serialises concurrent attempts on the same code.
create function redeem_voucher(p_business uuid, p_code_hash text, p_mac text, p_router uuid, p_idem text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v vouchers%rowtype; red voucher_redemptions%rowtype; pkg packages%rowtype; rtr routers%rowtype; cust uuid; ent uuid; new_count int;
begin
  select * into v from vouchers where business_id = p_business and code_hash = p_code_hash for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into red from voucher_redemptions where voucher_id = v.id and idempotency_key = p_idem;
  if found then return jsonb_build_object('ok', true, 'already', true, 'entitlement_id', red.entitlement_id); end if;

  if v.status = 'revoked' then return jsonb_build_object('ok', false, 'error', 'revoked'); end if;
  if v.status = 'expired' or (v.expires_at is not null and v.expires_at <= now()) then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if v.use_count >= v.max_uses then return jsonb_build_object('ok', false, 'error', 'used'); end if;

  select * into rtr from routers where id = p_router and business_id = p_business;
  if not found then return jsonb_build_object('ok', false, 'error', 'router_invalid'); end if;
  if v.router_id is not null and v.router_id <> rtr.id then return jsonb_build_object('ok', false, 'error', 'wrong_scope'); end if;
  if v.site_id is not null and v.site_id <> rtr.site_id then return jsonb_build_object('ok', false, 'error', 'wrong_scope'); end if;
  if v.device_restricted and v.device_mac_lock is not null and v.device_mac_lock <> p_mac then
    return jsonb_build_object('ok', false, 'error', 'device_mismatch');
  end if;

  select * into pkg from packages where id = v.package_id;
  if pkg.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'package_unavailable'); end if;

  insert into customers(business_id, phone, device_mac) values (p_business, null, p_mac)
  on conflict (business_id, (coalesce(phone,'')), (coalesce(device_mac,''))) do update set last_seen_at = now()
  returning id into cust;

  insert into access_entitlements(business_id, package_id, customer_id, router_id, site_id, source, voucher_id, access_token_hash,
    device_mac, duration_unit, duration_value, data_limit_mb, down_kbps, up_kbps, max_devices, package_name)
  values (p_business, pkg.id, cust, rtr.id, rtr.site_id, 'voucher', v.id, p_token_hash,
    p_mac, pkg.duration_unit, pkg.duration_value, pkg.data_limit_mb, pkg.down_kbps, pkg.up_kbps, pkg.max_devices, pkg.name)
  returning id into ent;

  insert into voucher_redemptions(voucher_id, business_id, entitlement_id, router_id, device_mac, idempotency_key)
  values (v.id, p_business, ent, rtr.id, p_mac, p_idem);

  new_count := v.use_count + 1;
  update vouchers set use_count = new_count,
    status = case when new_count >= max_uses then 'redeemed'::voucher_status else 'active'::voucher_status end,
    device_mac_lock = case when device_restricted and device_mac_lock is null then p_mac else device_mac_lock end
  where id = v.id;

  perform enqueue_command(p_business, rtr.id, ent, 'authorize');
  perform write_audit(p_business, null, 'customer', 'voucher.redeemed', 'voucher', v.id::text, jsonb_build_object('last4', v.code_last4, 'entitlement', ent));
  return jsonb_build_object('ok', true, 'entitlement_id', ent);
end $$;

-- Revoke an entitlement (admin action or voucher release).
create function revoke_entitlement(p_ent uuid, p_actor uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e access_entitlements%rowtype; was_active boolean;
begin
  select * into e from access_entitlements where id = p_ent for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if e.status in ('expired','revoked') then return jsonb_build_object('ok', true, 'ignored', e.status); end if;
  was_active := e.status = 'active';
  update access_entitlements set status = 'revoked', revoked_at = now(), revoke_reason = p_reason where id = e.id;
  update router_commands set status = 'failed', last_error = 'entitlement revoked' where entitlement_id = e.id and type = 'authorize' and status in ('pending','sent');
  perform enqueue_command(e.business_id, e.router_id, e.id, 'revoke');
  if e.source = 'voucher' and not was_active and e.voucher_id is not null then
    update voucher_redemptions set released_at = now() where entitlement_id = e.id;
    update vouchers set use_count = greatest(use_count - 1, 0),
      status = case when use_count - 1 <= 0 then 'unused'::voucher_status else 'active'::voucher_status end
    where id = e.voucher_id and status in ('active','redeemed');
  end if;
  perform write_audit(e.business_id, p_actor, 'user', 'entitlement.revoked', 'entitlement', e.id::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- Re-queue an authorization for a confirmed payment whose router command failed.
create function retry_authorization(p_ent uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e access_entitlements%rowtype;
begin
  select * into e from access_entitlements where id = p_ent for update;
  if not found or e.status <> 'pending_authorization' then return jsonb_build_object('ok', false, 'error', 'not_pending'); end if;
  if exists (select 1 from router_commands where entitlement_id = e.id and type = 'authorize' and status in ('pending','sent')) then
    return jsonb_build_object('ok', true, 'ignored', 'already_queued');
  end if;
  perform enqueue_command(e.business_id, e.router_id, e.id, 'authorize');
  perform write_audit(e.business_id, p_actor, 'user', 'entitlement.retry_authorization', 'entitlement', e.id::text, null);
  return jsonb_build_object('ok', true);
end $$;

-- Router polling: hand out pending commands (with lease), compute expiry at dispatch time.
create function claim_router_commands(p_router uuid, p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c router_commands%rowtype; e access_entitlements%rowtype; items jsonb := '[]'::jsonb; exp timestamptz; secs int; new_payload jsonb;
begin
  update router_commands set status = 'pending' where router_id = p_router and status = 'sent' and sent_at < now() - interval '2 minutes' and attempts < 8;
  update router_commands set status = 'failed', last_error = coalesce(last_error, 'max attempts reached') where router_id = p_router and status in ('pending','sent') and attempts >= 8;
  for c in select * from router_commands where router_id = p_router and status = 'pending' and available_at <= now()
           order by created_at limit p_limit for update skip locked loop
    select * into e from access_entitlements where id = c.entitlement_id;
    if c.type = 'authorize' then
      if e.status <> 'pending_authorization' then
        update router_commands set status = 'failed', last_error = 'entitlement not pending' where id = c.id; continue;
      end if;
      if e.valid_until < now() then
        update access_entitlements set status = 'revoked', revoked_at = now(), revoke_reason = 'claim window elapsed' where id = e.id;
        update router_commands set status = 'failed', last_error = 'claim window elapsed' where id = c.id; continue;
      end if;
      exp := compute_expiry(now(), e.duration_unit, e.duration_value);
      secs := greatest(extract(epoch from (exp - now()))::int, 60);
      new_payload := jsonb_build_object('expires_at', exp, 'seconds', secs);
      update router_commands set status = 'sent', sent_at = now(), attempts = attempts + 1, payload = new_payload where id = c.id;
      items := items || jsonb_build_object('id', c.id, 'type', 'authorize', 'mac', e.device_mac, 'entitlement_id', e.id,
        'seconds', secs, 'data_limit_mb', e.data_limit_mb, 'down_kbps', e.down_kbps, 'up_kbps', e.up_kbps, 'max_devices', e.max_devices);
    else
      update router_commands set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = c.id;
      items := items || jsonb_build_object('id', c.id, 'type', 'revoke', 'mac', e.device_mac, 'entitlement_id', e.id);
    end if;
  end loop;
  return items;
end $$;

create function ack_router_command(p_cmd uuid, p_router uuid, p_ok boolean, p_error text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c router_commands%rowtype; e access_entitlements%rowtype; exp timestamptz;
begin
  select * into c from router_commands where id = p_cmd and router_id = p_router for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if c.status = 'acked' then return jsonb_build_object('ok', true, 'already', true); end if;
  select * into e from access_entitlements where id = c.entitlement_id for update;

  if not p_ok then
    update router_commands set last_error = left(coalesce(p_error,'router reported failure'), 300),
      status = case when attempts >= 8 then 'failed'::command_status else 'pending'::command_status end,
      available_at = now() + make_interval(secs => 30 * attempts) where id = c.id;
    insert into router_events(business_id, router_id, type, detail) values (c.business_id, c.router_id, 'command_failed', jsonb_build_object('command', c.id, 'error', p_error));
    return jsonb_build_object('ok', true, 'retry', true);
  end if;

  update router_commands set status = 'acked', acked_at = now(), last_error = null where id = c.id;
  if c.type = 'authorize' then
    if e.status = 'pending_authorization' then
      exp := (c.payload->>'expires_at')::timestamptz;
      update access_entitlements set status = 'active', activated_at = now(), expires_at = exp where id = e.id;
      insert into access_sessions(business_id, entitlement_id, router_id, device_mac, status, authorized_at)
      values (e.business_id, e.id, e.router_id, e.device_mac, 'active', now());
      perform write_audit(e.business_id, null, 'router', 'access.authorized', 'entitlement', e.id::text, jsonb_build_object('expires_at', exp));
    else
      -- entitlement was revoked while the router was applying it: tear it down again
      perform enqueue_command(e.business_id, e.router_id, e.id, 'revoke');
    end if;
  else
    update access_sessions set status = case when e.status = 'revoked' then 'revoked'::session_status else 'expired'::session_status end,
      ended_at = now() where entitlement_id = e.id and status in ('active','pending');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Wall-clock expiry sweep: flips entitlements and queues router teardown.
create function sweep_expirations(p_router uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare e access_entitlements%rowtype; n int := 0;
begin
  for e in select * from access_entitlements where status = 'active' and expires_at <= now()
           and (p_router is null or router_id = p_router) for update skip locked loop
    update access_entitlements set status = 'expired' where id = e.id;
    perform enqueue_command(e.business_id, e.router_id, e.id, 'revoke');
    n := n + 1;
  end loop;
  update vouchers set status = 'expired' where status in ('unused','active') and expires_at is not null and expires_at <= now();
  return n;
end $$;

-- Usage accounting reported by the router. Enforces data caps centrally as well.
create function apply_accounting(p_router uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; s access_sessions%rowtype; e access_entitlements%rowtype; n int := 0; total bigint;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    select * into s from access_sessions where router_id = p_router and device_mac = upper(r->>'mac') and status = 'active' order by created_at desc limit 1 for update;
    if not found then continue; end if;
    update access_sessions set bytes_in = greatest(bytes_in, coalesce((r->>'bytes_in')::bigint, 0)),
      bytes_out = greatest(bytes_out, coalesce((r->>'bytes_out')::bigint, 0)),
      uptime_seconds = greatest(uptime_seconds, coalesce((r->>'uptime')::bigint, 0)), last_accounting_at = now() where id = s.id
    returning bytes_in + bytes_out into total;
    select * into e from access_entitlements where id = s.entitlement_id for update;
    if e.status = 'active' and e.data_limit_mb is not null and total >= e.data_limit_mb::bigint * 1048576 then
      update access_entitlements set status = 'expired' where id = e.id;
      perform enqueue_command(e.business_id, e.router_id, e.id, 'revoke');
      perform write_audit(e.business_id, null, 'router', 'access.data_exhausted', 'entitlement', e.id::text, null);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create function business_overview(p_business uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_sales', coalesce((select sum(amount) from payments where business_id = p_business and status = 'confirmed' and not is_test), 0),
    'today_sales', coalesce((select sum(amount) from payments where business_id = p_business and status = 'confirmed' and not is_test
        and (confirmed_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date), 0),
    'pending_payments', (select count(*) from payments where business_id = p_business and status in ('pending','awaiting_verification') and not is_test),
    'failed_payments', (select count(*) from payments where business_id = p_business and status in ('failed','expired','cancelled') and not is_test),
    'active_sessions', (select count(*) from access_sessions where business_id = p_business and status = 'active'),
    'expiring_sessions', (select count(*) from access_entitlements where business_id = p_business and status = 'active' and expires_at <= now() + interval '60 minutes'),
    'routers_online', (select count(*) from routers where business_id = p_business and last_seen_at > now() - interval '3 minutes' and status = 'connected'),
    'routers_total', (select count(*) from routers where business_id = p_business),
    'published_packages', (select count(*) from packages where business_id = p_business and is_published and status = 'active'),
    'unused_vouchers', (select count(*) from vouchers where business_id = p_business and status in ('unused','active')),
    'redeemed_vouchers', (select count(*) from vouchers where business_id = p_business and status = 'redeemed'),
    'customers', (select count(*) from customers where business_id = p_business),
    'unauthorized_confirmed', (select count(*) from access_entitlements where business_id = p_business and status = 'pending_authorization'),
    'unreconciled_claims', (select count(*) from payments where business_id = p_business and status = 'awaiting_verification')
  );
$$;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['platform_admins','businesses','business_members','hotspot_sites','routers','packages','customers',
    'payment_provider_configs','payments','payment_events','reconciliation_entries','voucher_batches','vouchers','voucher_redemptions',
    'access_entitlements','access_sessions','router_commands','router_events','audit_logs','support_messages','rate_limits'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- Tables with NO client policies (service role only): payment_provider_configs (holds secrets), routers (token hash),
-- router_commands, rate_limits, platform_admins, reconciliation_entries, payment_events.
revoke all on payment_provider_configs, routers, router_commands, rate_limits, platform_admins, reconciliation_entries, payment_events from authenticated;

create policy businesses_select on businesses for select to authenticated using (is_member(id) or is_platform_admin());
create policy businesses_update on businesses for update to authenticated using (is_member(id, array['owner','admin']::member_role[]))
  with check (is_member(id, array['owner','admin']::member_role[]));
create policy members_select on business_members for select to authenticated using (is_member(business_id) or user_id = auth.uid());
create policy sites_select on hotspot_sites for select to authenticated using (is_member(business_id));
create policy packages_select on packages for select to authenticated using (is_member(business_id));
create policy customers_select on customers for select to authenticated using (is_member(business_id));
create policy payments_select on payments for select to authenticated using (is_member(business_id));
create policy batches_select on voucher_batches for select to authenticated using (is_member(business_id));
create policy vouchers_select on vouchers for select to authenticated using (is_member(business_id));
create policy redemptions_select on voucher_redemptions for select to authenticated using (is_member(business_id));
create policy entitlements_select on access_entitlements for select to authenticated using (is_member(business_id));
create policy sessions_select on access_sessions for select to authenticated using (is_member(business_id));
create policy events_select on router_events for select to authenticated using (is_member(business_id, array['owner','admin']::member_role[]));
create policy audit_select on audit_logs for select to authenticated using (is_member(business_id, array['owner','admin']::member_role[]) or is_platform_admin());
create policy support_select on support_messages for select to authenticated using (is_member(business_id));
create policy support_insert on support_messages for insert to authenticated with check (is_member(business_id) and user_id = auth.uid());

-- Writes go through the API (service role). Clients may not write sensitive tables directly.
revoke insert, update, delete on businesses, business_members, hotspot_sites, packages, customers, payments, voucher_batches, vouchers,
  voucher_redemptions, access_entitlements, access_sessions, router_events, audit_logs from authenticated;
grant update (display_name, description, logo_url, cover_url, phone, whatsapp, email, county, town, address, welcome_message, terms, privacy) on businesses to authenticated;

-- Internal functions: callable only by the service role.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function is_member(uuid, member_role[]), is_platform_admin() to authenticated;
grant execute on all functions in schema public to service_role;
