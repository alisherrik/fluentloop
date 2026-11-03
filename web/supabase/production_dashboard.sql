-- FluentLoop production dashboard foundation; review before execution.
-- Run once on a verified empty target. All DDL/ACL changes commit atomically.
-- This is not migration 003: no token hook, MCP save RPC, or consent activation.
begin;

do $$
begin
  if to_regclass('public.corrections') is not null
    or to_regclass('public.corrections_id_seq') is not null
    or to_regclass('public.mcp_clients') is not null
    or to_regclass('public.mcp_grants') is not null then
    raise exception 'FluentLoop object already exists; stop and review before migration';
  end if;
end $$;

create table public.corrections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  original text not null check (char_length(trim(original)) between 1 and 2000),
  corrected text not null check (char_length(trim(corrected)) between 1 and 2000),
  explanation text not null check (char_length(trim(explanation)) between 1 and 2000),
  created_at timestamptz not null default now(),
  request_id uuid not null default gen_random_uuid(),
  constraint corrections_user_request_unique unique (user_id, request_id)
);
alter table public.corrections enable row level security;
revoke all privileges on table public.corrections from public, anon, authenticated;
revoke all privileges on sequence public.corrections_id_seq from public, anon, authenticated;
grant select, insert, delete on table public.corrections to authenticated;
grant usage, select on sequence public.corrections_id_seq to authenticated;
create policy "Users read own corrections" on public.corrections for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add own corrections" on public.corrections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete own corrections" on public.corrections for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Block OAuth clients from direct corrections access"
  on public.corrections as restrictive for all to authenticated
  using ((select auth.jwt()) ->> 'client_id' is null)
  with check ((select auth.jwt()) ->> 'client_id' is null);

create table public.mcp_clients (
  client_id text primary key check (char_length(client_id) between 1 and 256),
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  enabled boolean not null default false
);
alter table public.mcp_clients enable row level security;
revoke all privileges on table public.mcp_clients from public, anon, authenticated;
grant select on table public.mcp_clients to authenticated;
create policy "Browser reads registered clients" on public.mcp_clients for select to authenticated
  using (((select auth.jwt()) ->> 'client_id') is null);

create table public.mcp_grants (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id text not null references public.mcp_clients(client_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.mcp_grants enable row level security;
revoke all privileges on table public.mcp_grants from public, anon, authenticated;
grant select, delete on table public.mcp_grants to authenticated;
create policy "Browser reads own grants" on public.mcp_grants for select to authenticated
  using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'client_id') is null);
create policy "Browser revokes own grants" on public.mcp_grants for delete to authenticated
  using ((select auth.uid()) = user_id and ((select auth.jwt()) ->> 'client_id') is null);
create policy "Block browser grant creation" on public.mcp_grants as restrictive for insert to authenticated
  with check (false);
create policy "Block browser grant modification" on public.mcp_grants as restrictive for update to authenticated
  using (false) with check (false);

commit;
