-- AURORA durable research queue and user-owned research library.
-- Apply this migration in the linked Supabase project's SQL Editor before enabling cloud tasks.

create table if not exists public.aurora_research_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(query) between 2 and 240),
  request jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','completed','partial','failed','cancelled')),
  result jsonb,
  error text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aurora_research_tasks_user_created_idx
  on public.aurora_research_tasks (user_id, created_at desc);
create index if not exists aurora_research_tasks_worker_idx
  on public.aurora_research_tasks (status, next_attempt_at, created_at)
  where status in ('queued','running');

alter table public.aurora_research_tasks enable row level security;
drop policy if exists "Users can read their own AURORA research tasks" on public.aurora_research_tasks;
create policy "Users can read their own AURORA research tasks"
  on public.aurora_research_tasks for select using (auth.uid() = user_id);
drop policy if exists "Users can create their own AURORA research tasks" on public.aurora_research_tasks;
create policy "Users can create their own AURORA research tasks"
  on public.aurora_research_tasks for insert with check (auth.uid() = user_id);
drop policy if exists "Users can cancel their own AURORA research tasks" on public.aurora_research_tasks;
create policy "Users can cancel their own AURORA research tasks"
  on public.aurora_research_tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
revoke all on public.aurora_research_tasks from anon;
grant select, insert, update on public.aurora_research_tasks to authenticated;

-- Atomic claim: multiple worker invocations cannot claim the same task.
create or replace function public.claim_aurora_research_task()
returns setof public.aurora_research_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.aurora_research_tasks
  set status = 'failed',
      error = 'Research worker lease expired after the final retry.',
      completed_at = now(),
      lease_expires_at = null,
      updated_at = now()
  where status = 'running'
    and lease_expires_at is not null
    and lease_expires_at < now()
    and attempts >= max_attempts;

  return query
  with candidate as (
    select id
    from public.aurora_research_tasks
    where attempts < max_attempts
      and (
        (status = 'queued' and next_attempt_at <= now())
        or (status = 'running' and lease_expires_at is not null and lease_expires_at < now())
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.aurora_research_tasks as task
  set status = 'running',
      attempts = task.attempts + 1,
      started_at = coalesce(task.started_at, now()),
      lease_expires_at = now() + interval '2 minutes',
      updated_at = now(),
      error = null
  from candidate
  where task.id = candidate.id
  returning task.*;
end;
$$;

revoke all on function public.claim_aurora_research_task() from public, anon, authenticated;
grant execute on function public.claim_aurora_research_task() to service_role;

create table if not exists public.aurora_research_saved (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  query text not null check (char_length(query) between 2 and 240),
  result jsonb not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists aurora_research_saved_user_created_idx
  on public.aurora_research_saved (user_id, created_at desc);

alter table public.aurora_research_saved enable row level security;
drop policy if exists "Users can read their own saved AURORA research" on public.aurora_research_saved;
create policy "Users can read their own saved AURORA research"
  on public.aurora_research_saved for select using (auth.uid() = user_id);
drop policy if exists "Users can save their own AURORA research" on public.aurora_research_saved;
create policy "Users can save their own AURORA research"
  on public.aurora_research_saved for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their own saved AURORA research" on public.aurora_research_saved;
create policy "Users can update their own saved AURORA research"
  on public.aurora_research_saved for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own saved AURORA research" on public.aurora_research_saved;
create policy "Users can delete their own saved AURORA research"
  on public.aurora_research_saved for delete using (auth.uid() = user_id);

revoke all on public.aurora_research_saved from anon;
grant select, insert, update, delete on public.aurora_research_saved to authenticated;
