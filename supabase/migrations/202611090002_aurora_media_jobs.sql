-- Durable, private, per-user AURORA transcription jobs and audio checkpoints.
-- Apply in Supabase SQL Editor. Storage is private and scoped to auth.uid().
create table if not exists public.aurora_media_jobs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  source_path text not null,
  file_size bigint not null check (file_size > 0),
  duration_seconds double precision,
  status text not null default 'queued' check (status in ('queued','processing','paused','completed','failed')),
  progress_seconds double precision not null default 0 check (progress_seconds >= 0),
  transcript text not null default '',
  error_message text,
  fingerprint text,
  last_modified bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.aurora_media_jobs add column if not exists fingerprint text;
alter table public.aurora_media_jobs add column if not exists last_modified bigint not null default 0;
alter table public.aurora_media_jobs enable row level security;
drop policy if exists "Users manage their own AURORA media jobs" on public.aurora_media_jobs;
create policy "Users manage their own AURORA media jobs" on public.aurora_media_jobs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.aurora_media_jobs from anon;
grant select, insert, update, delete on public.aurora_media_jobs to authenticated;
create index if not exists aurora_media_jobs_user_updated_idx on public.aurora_media_jobs(user_id, updated_at desc);
create index if not exists aurora_media_jobs_user_fingerprint_idx on public.aurora_media_jobs(user_id, fingerprint, updated_at desc);

create table if not exists public.aurora_media_job_sections (
  job_id text not null references public.aurora_media_jobs(id) on delete cascade,
  section_index integer not null check (section_index >= 1),
  start_seconds double precision not null check (start_seconds >= 0),
  end_seconds double precision not null check (end_seconds >= start_seconds),
  storage_path text not null,
  transcript text not null default '',
  segments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (job_id, section_index)
);
alter table public.aurora_media_job_sections enable row level security;
drop policy if exists "Users manage sections of their own AURORA media jobs" on public.aurora_media_job_sections;
create policy "Users manage sections of their own AURORA media jobs" on public.aurora_media_job_sections
  for all to authenticated using (
    exists (select 1 from public.aurora_media_jobs j where j.id = job_id and j.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.aurora_media_jobs j where j.id = job_id and j.user_id = auth.uid())
  );
revoke all on public.aurora_media_job_sections from anon;
grant select, insert, update, delete on public.aurora_media_job_sections to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aurora-media-jobs', 'aurora-media-jobs', false, 52428800,
  array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/aac'])
on conflict (id) do update set public = false, file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Users manage their own AURORA media objects" on storage.objects;
create policy "Users manage their own AURORA media objects" on storage.objects
  for all to authenticated
  using (bucket_id = 'aurora-media-jobs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'aurora-media-jobs' and (storage.foldername(name))[1] = auth.uid()::text);
