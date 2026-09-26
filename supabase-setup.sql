-- =============================================================
--  Live Fruit Juice — Supabase Setup
--  Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--  (It only creates missing objects; existing data is not touched)
-- =============================================================

-- ---------- 1. TABLES (only if they don't exist yet) ----------
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  role          text not null default 'staff',
  created_at    timestamptz not null default now()
);

create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price_s    numeric(10,2) not null default 0,
  price_m    numeric(10,2) not null default 0,
  price_l    numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  invoice_no text primary key,
  date_disp  text not null,
  time_disp  text not null,
  customer   text,
  seller     text,
  total      numeric(12,2) not null default 0,
  paid       numeric(12,2) not null default 0,
  change     numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id         uuid primary key default gen_random_uuid(),
  invoice_no text not null references public.invoices(invoice_no) on delete cascade,
  item       text not null,
  size       text,
  qty        numeric(10,2) not null default 1,
  price      numeric(10,2) not null default 0
);

-- helpful index for "today's bills" lookups
create index if not exists idx_invoices_date_seller
  on public.invoices (date_disp, seller);

-- ---------- 2. REALTIME (so product edits appear instantly) ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
exception when others then
  raise notice 'Realtime publication skipped: %', sqlerrm;
end $$;

-- ---------- 3. SECURE LOGIN (server-side password compare) ----------
-- The app hashes the password in the browser, then calls this function.
-- The stored hashes are never sent to the browser.
create or replace function public.login_employee(p_username text, p_hash text)
returns table (username text, role text)
language sql
security definer
set search_path = public
as $$
  select e.username, e.role
  from public.employees e
  where lower(e.username) = lower(trim(p_username))
    and lower(e.password_hash) = lower(trim(p_hash))
  limit 1;
$$;

revoke all on function public.login_employee(text, text) from public;
grant execute on function public.login_employee(text, text) to anon, authenticated;

-- ---------- 4. ROW LEVEL SECURITY ----------
alter table public.employees     enable row level security;
alter table public.products      enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

-- products: everyone logged in (anon key) can read; desktop app writes via service role
drop policy if exists "products_read_anon" on public.products;
create policy "products_read_anon" on public.products
  for select to anon, authenticated using (true);

-- employees: NO direct select (login goes through login_employee RPC).
-- If you skip the RPC and want the simple path, uncomment the two lines below:
--   drop policy if exists "employees_read_anon" on public.employees;
--   create policy "employees_read_anon" on public.employees
--     for select to anon, authenticated using (true);

-- invoices: anon key can read/write (owner/staff filtering is enforced in the app)
drop policy if exists "invoices_all_anon" on public.invoices;
create policy "invoices_all_anon" on public.invoices
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "invoice_items_all_anon" on public.invoice_items;
create policy "invoice_items_all_anon" on public.invoice_items
  for all to anon, authenticated using (true) with check (true);

-- ---------- 5. FIRST EMPLOYEE (owner) ----------
-- Default login: owner / owner123
-- password_hash = SHA256('livefruitjuice_salt_' || 'owner123')
insert into public.employees (username, password_hash, role)
select
  'owner',
  encode(
    digest('livefruitjuice_salt_owner123', 'sha256'),
    'hex'
  ),
  'owner'
where not exists (select 1 from public.employees where username = 'owner');

-- ---------- 6. SAMPLE PRODUCTS (optional, delete if unwanted) ----------
insert into public.products (name, price_s, price_m, price_l)
select * from (values
  ('আপেল জুস',        50, 80, 120),
  ('কলা জুস',          60, 90, 130),
  ('আরবুজ মিশ্র জুস',  70, 100, 150),
  ('পেয়ারা জুস',      65, 95, 140),
  ('অ্যানারস জুস',     80, 120, 170),
  ('পান্তা লেবু জুস',  40, 60, 90)
) as v(name, price_s, price_m, price_l)
where not exists (select 1 from public.products);
