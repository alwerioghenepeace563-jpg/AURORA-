-- Durable, private, per-user AURORA transcription jobs and source recordings.
-- Apply in Supabase SQL Editor. The bucket is private; all access is scoped by auth.uid().
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.aurora_media_jobs enable row level security;
drop policy if exists "Users manage their own AURORA media jobs" on public.aurora_media_jobs;
create policy "Users manage their own AURORA media jobs" on public.aurora_media_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.aurora_media_jobs from anon;
grant select, insert, update, delete on public.aurora_media_jobs to authenticated;
create index if not exists aurora_media_jobs_user_updated_idx on public.aurora_media_jobs(user_id, updated_at desc);

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
