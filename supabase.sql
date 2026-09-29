-- Выполни этот SQL в Supabase -> SQL Editor

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null,
  deadline date not null,
  comment text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "Users can view own tasks"
on public.tasks for select
using (auth.uid() = user_id);

create policy "Users can create own tasks"
on public.tasks for insert
with check (auth.uid() = user_id);

create policy "Users can update own tasks"
on public.tasks for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own tasks"
on public.tasks for delete
using (auth.uid() = user_id);


-- Вложения к домашним заданиям.
-- Этот блок НЕ меняет существующие записи в public.tasks.
create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  size bigint not null,
  mime_type text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.task_attachments enable row level security;

drop policy if exists "Users can view own task attachments" on public.task_attachments;
create policy "Users can view own task attachments"
on public.task_attachments for select
using (auth.uid() = user_id);

drop policy if exists "Users can create own task attachments" on public.task_attachments;
create policy "Users can create own task attachments"
on public.task_attachments for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = task_attachments.task_id
      and tasks.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own task attachments" on public.task_attachments;
create policy "Users can delete own task attachments"
on public.task_attachments for delete
using (auth.uid() = user_id);

-- Приватное хранилище. Файлы не публикуются в интернет напрямую.
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = 10485760;

drop policy if exists "Users can upload own task attachments" on storage.objects;
create policy "Users can upload own task attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'task-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own task attachments" on storage.objects;
create policy "Users can read own task attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'task-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own task attachments" on storage.objects;
create policy "Users can delete own task attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'task-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
