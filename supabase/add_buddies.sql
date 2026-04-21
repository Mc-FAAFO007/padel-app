-- ── BUDDIES TABLE ────────────────────────────────────────────────
-- Tracks buddy relationships between players
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
