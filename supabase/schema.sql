-- ═══════════════════════════════════════════════════════════
--  PadelMatch — Supabase Database Schema
--  Run this entire file in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── 1. PROFILES ──────────────────────────────────────────────
-- One row per member, linked to Supabase Auth (auth.users)
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  avatar      text not null,          -- 2-letter initials e.g. "AR"
  level       text not null,          -- matchmaking level "1"–"4"
  availability text[] not null default '{}',  -- e.g. ["Sat AM","Sun PM"]
  created_at  timestamptz default now()
);

-- Allow users to read all profiles, but only edit their own
alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone"
  on profiles for select using (true);
create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- ── 2. GAME POSTS (Board) ─────────────────────────────────────
create table if not exists posts (
  id            bigserial primary key,
  player_id     uuid references profiles(id) on delete cascade,
  player_name   text not null,
  player_avatar text not null,
  level         text not null,
  slot          text not null,         -- e.g. "Sat AM"
  spots_needed  int not null check (spots_needed between 0 and 3),
  note          text default '',
  created_at    timestamptz default now()
);

alter table posts enable row level security;
create policy "Posts viewable by everyone"
  on posts for select using (true);
create policy "Authenticated users can post"
  on posts for insert with check (auth.uid() = player_id);
create policy "Owner can delete their post"
  on posts for delete using (auth.uid() = player_id);

-- ── 3. POST INTERESTS ────────────────────────────────────────
-- Tracks which players expressed interest in a post
create table if not exists post_interests (
  id         bigserial primary key,
  post_id    bigint references posts(id) on delete cascade,
  player_id  uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(post_id, player_id)
);

alter table post_interests enable row level security;
create policy "Interests viewable by everyone"
  on post_interests for select using (true);
create policy "Authenticated users can express interest"
  on post_interests for insert with check (auth.uid() = player_id);
create policy "Users can remove their own interest"
  on post_interests for delete using (auth.uid() = player_id);

-- ── 4. RATING PROFILES ───────────────────────────────────────
create table if not exists ratings (
  id           bigserial primary key,
  player_id    uuid references profiles(id) on delete cascade unique,
  player_name  text not null,
  avatar       text not null,
  rating       numeric(4,1) not null default 3.5,
  match_count  int not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table ratings enable row level security;
create policy "Ratings viewable by everyone"
  on ratings for select using (true);
create policy "Users can insert their own rating"
  on ratings for insert with check (auth.uid() = player_id);
create policy "Users can update their own rating"
  on ratings for update using (auth.uid() = player_id);

-- ── 5. MATCH HISTORY ─────────────────────────────────────────
create table if not exists matches (
  id              bigserial primary key,
  -- Team A (winners)
  team_a1_id      uuid references profiles(id),
  team_a1_name    text not null,
  team_a2_id      uuid references profiles(id),
  team_a2_name    text not null,
  -- Team B (losers)
  team_b1_id      uuid references profiles(id),
  team_b1_name    text not null,
  team_b2_id      uuid references profiles(id),
  team_b2_name    text not null,
  -- Scores stored as arrays e.g. [6,3,6] for set 1,2,3 team A games
  sets_a          int[] not null,
  sets_b          int[] not null,
  -- Rating snapshots at time of match
  rating_a1_before numeric(4,1), rating_a1_after numeric(4,1),
  rating_a2_before numeric(4,1), rating_a2_after numeric(4,1),
  rating_b1_before numeric(4,1), rating_b1_after numeric(4,1),
  rating_b2_before numeric(4,1), rating_b2_after numeric(4,1),
  logged_by       uuid references profiles(id),
  created_at      timestamptz default now()
);

alter table matches enable row level security;
create policy "Matches viewable by everyone"
  on matches for select using (true);
create policy "Authenticated users can log matches"
  on matches for insert with check (auth.uid() = logged_by);

-- ── 6. BUDDIES ───────────────────────────────────────────────
-- Tracks buddy relationships between players (bidirectional)
create table if not exists buddies (
  id           bigserial primary key,
  user_id      uuid references profiles(id) on delete cascade,
  buddy_id     uuid references profiles(id) on delete cascade,
  created_at   timestamptz default now(),
  unique(user_id, buddy_id)
);

create index if not exists idx_buddies_user_id on buddies(user_id);

alter table buddies enable row level security;
create policy "Users can view their own buddies"
  on buddies for select using (auth.uid() = user_id);
create policy "Users can add buddies"
  on buddies for insert with check (auth.uid() = user_id);
create policy "Users can remove their own buddies"
  on buddies for delete using (auth.uid() = user_id);

-- ── 7. REALTIME ──────────────────────────────────────────────
-- Enable realtime for the board so posts update live
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table post_interests;
