-- AURORA per-user memory sync. Apply this migration in the Supabase SQL editor.
-- Row Level Security ensures users can only access their own records.
create table if not exists public.aurora_memories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.aurora_memories enable row level security;

drop policy if exists "Users can read their own AURORA memories" on public.aurora_memories;
create policy "Users can read their own AURORA memories"
  on public.aurora_memories for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own AURORA memories" on public.aurora_memories;
create policy "Users can insert their own AURORA memories"
  on public.aurora_memories for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own AURORA memories" on public.aurora_memories;
create policy "Users can update their own AURORA memories"
  on public.aurora_memories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own AURORA memories" on public.aurora_memories;
create policy "Users can delete their own AURORA memories"
  on public.aurora_memories for delete
  using (auth.uid() = user_id);

create index if not exists aurora_memories_user_updated_idx
  on public.aurora_memories (user_id, updated_at desc);

-- The anon role cannot access this table; authenticated access is still constrained by RLS.
revoke all on public.aurora_memories from anon;
grant select, insert, update, delete on public.aurora_memories to authenticated;
