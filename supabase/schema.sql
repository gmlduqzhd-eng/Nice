-- Applied on 2026-09-29 through the Supabase dashboard SQL Editor to the Nice project.
-- This file is the applied schema definition, not Supabase CLI migration history.
-- Do not replay against the existing table. Inspect the target schema before changes.
-- SQL owner/cross-user/anonymous/constraint tests passed and test data was rolled back.
-- Actual email login and browser cloud-backup verification remain pending.
begin;

create table public.teacher_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  constraint workspace_size_limit check (octet_length(data::text) <= 2097152)
);

comment on table public.teacher_workspaces is
  'One manually saved workspace snapshot per teacher account. No automatic upload.';

alter table public.teacher_workspaces enable row level security;

-- Explicit access is needed even when the project disables automatic API grants.
-- Anonymous visitors receive no table privileges.
revoke all on table public.teacher_workspaces from public, anon, authenticated;
grant select, insert, update, delete on table public.teacher_workspaces to authenticated;

create policy "teacher_reads_own_workspace"
on public.teacher_workspaces for select to authenticated
using ((select auth.uid()) = user_id);

create policy "teacher_creates_own_workspace"
on public.teacher_workspaces for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "teacher_updates_own_workspace"
on public.teacher_workspaces for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "teacher_deletes_own_workspace"
on public.teacher_workspaces for delete to authenticated
using ((select auth.uid()) = user_id);

commit;
