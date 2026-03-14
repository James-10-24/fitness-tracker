create extension if not exists pgcrypto;

create table if not exists public.goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cal integer not null default 2000,
  pro numeric not null default 150,
  carb numeric not null default 220,
  fat numeric not null default 65,
  water numeric not null default 2.5,
  steps integer not null default 8000,
  updated_at timestamptz not null default now()
);

create table if not exists public.foods (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  grams numeric not null,
  base_quantity numeric not null default 0,
  quantity_unit text not null default '',
  cal numeric not null default 0,
  pro numeric not null default 0,
  carb numeric not null default 0,
  fat numeric not null default 0,
  serving text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_logs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  name text not null,
  cal numeric not null default 0,
  pro numeric not null default 0,
  carb numeric not null default 0,
  fat numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.water_logs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.step_logs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  amount integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.water_units (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  ml numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists foods_user_id_idx on public.foods (user_id);
create index if not exists meal_logs_user_id_idx on public.meal_logs (user_id);
create index if not exists meal_logs_logged_on_idx on public.meal_logs (logged_on);
create index if not exists water_logs_user_id_idx on public.water_logs (user_id);
create index if not exists water_logs_logged_on_idx on public.water_logs (logged_on);
create index if not exists step_logs_user_id_idx on public.step_logs (user_id);
create index if not exists step_logs_logged_on_idx on public.step_logs (logged_on);
create index if not exists water_units_user_id_idx on public.water_units (user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.foods to authenticated;
grant select, insert, update, delete on public.meal_logs to authenticated;
grant select, insert, update, delete on public.water_logs to authenticated;
grant select, insert, update, delete on public.step_logs to authenticated;
grant select, insert, update, delete on public.water_units to authenticated;

alter table public.goals enable row level security;
alter table public.foods enable row level security;
alter table public.meal_logs enable row level security;
alter table public.water_logs enable row level security;
alter table public.step_logs enable row level security;
alter table public.water_units enable row level security;

drop policy if exists "users_manage_own_goals" on public.goals;
create policy "users_manage_own_goals" on public.goals
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_foods" on public.foods;
create policy "users_manage_own_foods" on public.foods
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_meal_logs" on public.meal_logs;
create policy "users_manage_own_meal_logs" on public.meal_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_water_logs" on public.water_logs;
create policy "users_manage_own_water_logs" on public.water_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_step_logs" on public.step_logs;
create policy "users_manage_own_step_logs" on public.step_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_water_units" on public.water_units;
create policy "users_manage_own_water_units" on public.water_units
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
