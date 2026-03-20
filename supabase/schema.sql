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
  logged_time text not null default '',
  name text not null,
  quantity numeric not null default 0,
  portion_name text not null default '',
  meal_section text not null default '',
  meal_order integer not null default 0,
  cal numeric not null default 0,
  pro numeric not null default 0,
  carb numeric not null default 0,
  fat numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.meal_logs
  add column if not exists logged_time text not null default '';

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

create table if not exists public.ai_food_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_query text not null unique,
  display_query text not null,
  food_name text not null,
  estimated_grams numeric not null,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carb_g numeric not null default 0,
  fat_g numeric not null default 0,
  base_quantity numeric not null default 0,
  quantity_unit text not null default '',
  portion_name text not null default '',
  source_note text not null default '',
  confidence text not null default 'medium',
  note text not null default '',
  hit_count integer not null default 0,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_custom_exercises (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  muscle_group text not null,
  input_type text not null,
  equipment text not null default 'Bodyweight',
  is_custom boolean not null default true,
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_routines (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  weekdays jsonb not null default '[]'::jsonb,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id text,
  routine_name text not null default 'Freeform Workout',
  logged_on date not null,
  duration_seconds integer not null default 0,
  total_volume numeric not null default 0,
  exercise_logs jsonb not null default '[]'::jsonb,
  personal_bests jsonb not null default '[]'::jsonb,
  is_freeform boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.health_blood_tests (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  lab_name text not null default '',
  notes text not null default '',
  photo_url text not null default '',
  markers jsonb not null default '[]'::jsonb,
  ai_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_body_metrics (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric,
  body_fat_percent numeric,
  bmi numeric,
  muscle_mass_kg numeric,
  waist_cm numeric,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_medications (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null default 'supplement',
  dose text not null default '',
  frequency text not null default 'daily',
  custom_frequency text not null default '',
  start_date date not null,
  end_date date,
  reminder_enabled boolean not null default false,
  reminder_times jsonb not null default '[]'::jsonb,
  refill_date date,
  refill_qty numeric,
  instructions text not null default '',
  side_effects text not null default '',
  prescribed_by text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_medication_logs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  medication_id text not null,
  taken_at timestamptz not null,
  dose_taken text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.health_doctor_visits (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  doctor_name text not null default '',
  specialty text not null default '',
  clinic text not null default '',
  reason text not null default '',
  diagnosis text not null default '',
  notes text not null default '',
  follow_up_date date,
  attachments jsonb not null default '[]'::jsonb,
  linked_report_ids jsonb not null default '[]'::jsonb,
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
create index if not exists ai_food_cache_normalized_query_idx on public.ai_food_cache (normalized_query);
create index if not exists workout_custom_exercises_user_id_idx on public.workout_custom_exercises (user_id);
create index if not exists workout_routines_user_id_idx on public.workout_routines (user_id);
create index if not exists workout_sessions_user_id_idx on public.workout_sessions (user_id);
create index if not exists workout_sessions_logged_on_idx on public.workout_sessions (logged_on);
create index if not exists health_blood_tests_user_id_idx on public.health_blood_tests (user_id);
create index if not exists health_blood_tests_date_idx on public.health_blood_tests (date);
create index if not exists health_body_metrics_user_id_idx on public.health_body_metrics (user_id);
create index if not exists health_body_metrics_date_idx on public.health_body_metrics (date);
create index if not exists health_medications_user_id_idx on public.health_medications (user_id);
create index if not exists health_medication_logs_user_id_idx on public.health_medication_logs (user_id);
create index if not exists health_medication_logs_taken_at_idx on public.health_medication_logs (taken_at);
create index if not exists health_doctor_visits_user_id_idx on public.health_doctor_visits (user_id);
create index if not exists health_doctor_visits_date_idx on public.health_doctor_visits (date);

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.foods to authenticated;
grant select, insert, update, delete on public.meal_logs to authenticated;
grant select, insert, update, delete on public.water_logs to authenticated;
grant select, insert, update, delete on public.step_logs to authenticated;
grant select, insert, update, delete on public.water_units to authenticated;
grant select, insert, update, delete on public.workout_custom_exercises to authenticated;
grant select, insert, update, delete on public.workout_routines to authenticated;
grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.health_blood_tests to authenticated;
grant select, insert, update, delete on public.health_body_metrics to authenticated;
grant select, insert, update, delete on public.health_medications to authenticated;
grant select, insert, update, delete on public.health_medication_logs to authenticated;
grant select, insert, update, delete on public.health_doctor_visits to authenticated;
grant select, insert, update on public.ai_food_cache to authenticated, anon;

alter table public.goals enable row level security;
alter table public.foods enable row level security;
alter table public.meal_logs enable row level security;
alter table public.water_logs enable row level security;
alter table public.step_logs enable row level security;
alter table public.water_units enable row level security;
alter table public.ai_food_cache enable row level security;
alter table public.workout_custom_exercises enable row level security;
alter table public.workout_routines enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.health_blood_tests enable row level security;
alter table public.health_body_metrics enable row level security;
alter table public.health_medications enable row level security;
alter table public.health_medication_logs enable row level security;
alter table public.health_doctor_visits enable row level security;

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

drop policy if exists "users_manage_own_workout_custom_exercises" on public.workout_custom_exercises;
create policy "users_manage_own_workout_custom_exercises" on public.workout_custom_exercises
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_workout_routines" on public.workout_routines;
create policy "users_manage_own_workout_routines" on public.workout_routines
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_workout_sessions" on public.workout_sessions;
create policy "users_manage_own_workout_sessions" on public.workout_sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_health_blood_tests" on public.health_blood_tests;
create policy "users_manage_own_health_blood_tests" on public.health_blood_tests
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_health_body_metrics" on public.health_body_metrics;
create policy "users_manage_own_health_body_metrics" on public.health_body_metrics
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_health_medications" on public.health_medications;
create policy "users_manage_own_health_medications" on public.health_medications
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_health_medication_logs" on public.health_medication_logs;
create policy "users_manage_own_health_medication_logs" on public.health_medication_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_manage_own_health_doctor_visits" on public.health_doctor_visits;
create policy "users_manage_own_health_doctor_visits" on public.health_doctor_visits
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "public_read_ai_food_cache" on public.ai_food_cache;
create policy "public_read_ai_food_cache" on public.ai_food_cache
for select
using (true);

drop policy if exists "public_insert_ai_food_cache" on public.ai_food_cache;
create policy "public_insert_ai_food_cache" on public.ai_food_cache
for insert
with check (true);

drop policy if exists "public_update_ai_food_cache" on public.ai_food_cache;
create policy "public_update_ai_food_cache" on public.ai_food_cache
for update
using (true)
with check (true);
