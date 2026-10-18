create table public.runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  gym text check (gym is null or char_length(gym) <= 120),
  view_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  writer_device text check (writer_device is null or char_length(writer_device) <= 64),
  writer_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index runs_owner_id_idx on public.runs (owner_id);

create table public.run_members (
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'runner' check (role in ('runner')),
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);
create index run_members_user_id_idx on public.run_members (user_id);

create table public.nights (
  id text primary key check (char_length(id) between 1 and 64),
  run_id uuid not null references public.runs (id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  live_state jsonb,
  state_version bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index nights_run_id_updated_idx on public.nights (run_id, updated_at desc);

create table public.games (
  id text primary key check (char_length(id) between 1 and 64),
  night_id text not null references public.nights (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  n integer not null check (n >= 1),
  started_at timestamptz,
  ended_at timestamptz not null,
  winner text not null check (winner in ('champions', 'challengers')),
  winners jsonb not null default '[]',
  losers jsonb not null default '[]',
  shootout jsonb,
  final jsonb,
  ended_by text check (ended_by is null or ended_by in ('points', 'cap', 'time', 'sudden', 'manual'))
);
create index games_night_id_idx on public.games (night_id);
create index games_run_id_ended_idx on public.games (run_id, ended_at desc);

create table public.attendance (
  night_id text not null references public.nights (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  player_key text not null check (char_length(player_key) between 1 and 80),
  name text not null check (char_length(name) between 1 and 80),
  primary key (night_id, player_key)
);
create index attendance_run_id_idx on public.attendance (run_id);

alter table public.runs enable row level security;
alter table public.run_members enable row level security;
alter table public.nights enable row level security;
alter table public.games enable row level security;
alter table public.attendance enable row level security;
