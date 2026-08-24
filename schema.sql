create table if not exists public.audio_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 operation text not null check (operation in ('master','mix','mashup','generate')),
 status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
 input_path text, output_path text, provider_job_id text, prompt text, error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.audio_jobs enable row level security;
create policy "users manage own jobs" on public.audio_jobs for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
