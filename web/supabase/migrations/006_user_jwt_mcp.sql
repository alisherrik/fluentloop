-- Secretless candidate: apply ONCE directly after production_dashboard.sql; NOT after 003 or 005.
-- Requires the existing production_dashboard.sql schema; review before applying.
begin;
do $$ begin
  if to_regprocedure('public.fluentloop_access_token_hook(jsonb)') is not null
    or to_regclass('public.mcp_upload_windows') is not null then
    raise exception 'MCP draft objects already exist; review migration history before proceeding';
  end if;
  if 4<>(select count(*) from information_schema.columns where table_schema='auth' and table_name='sessions'
    and ((column_name in ('id','user_id','oauth_client_id') and udt_name='uuid') or (column_name='not_after' and udt_name='timestamptz'))) then
    raise exception 'Expected Supabase auth.sessions id/user/client/expiry columns are required';
  end if;
  if not has_table_privilege(current_user,'auth.sessions','SELECT') or not has_table_privilege(current_user,'auth.sessions','UPDATE') then
    raise exception 'Function owner needs existing Auth session read/locking privileges; do not grant browser access';
  end if;
end $$;

alter table public.mcp_clients add column resource text
  check (resource ~ '^https://[^/?#]+/mcp$' or resource ~ '^http://(localhost|127[.]0[.]0[.]1):[0-9]+/mcp$');
alter table public.mcp_clients add column issuer text check (issuer ~ '^https://[^/?#]+/auth/v1$' or issuer ~ '^http://(localhost|127[.]0[.]0[.]1):[0-9]+/auth/v1$');
create index corrections_user_created on public.corrections(user_id,created_at desc);

create table public.mcp_upload_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null, used integer not null check(used between 1 and 120)
);
create table public.mcp_request_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, correction_id bigint not null, primary key(user_id,request_id)
);

alter table public.mcp_upload_windows enable row level security;
alter table public.mcp_request_receipts enable row level security;
revoke all on public.mcp_upload_windows,public.mcp_request_receipts from public,anon,authenticated,service_role;
create schema fluentloop_private;
revoke all on schema fluentloop_private from public,anon,authenticated,service_role;

create function public.fluentloop_access_token_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid text:=event->'claims'->>'client_id'; target text;
begin
  if cid is null then return event; end if;
  select resource into target from public.mcp_clients where client_id=cid and enabled and issuer=event->'claims'->>'iss' for share;
  if target is null then raise exception 'Client denied' using errcode='42501'; end if;
  return jsonb_set(event,'{claims,aud}',to_jsonb(target));
end $$;

-- PostgREST verifies the signature before setting auth.jwt()/auth.uid().
-- Derive every identity field from that trusted request context, never RPC input.
create function fluentloop_private.mcp_identity()
returns table(user_id uuid,client_id text,session_id uuid,resource text)
language plpgsql security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); mapped_resource text; mapped_issuer text;
begin
  if claims->>'role' is distinct from 'authenticated' or claims->>'is_anonymous'='true'
    or jsonb_typeof(claims->'aud') is distinct from 'string'
    or jsonb_typeof(claims->'exp') is distinct from 'number'
    or jsonb_typeof(claims->'iat') is distinct from 'number'
    or claims->>'session_id' is null or claims->>'client_id' is null or auth.uid() is null then
    raise exception 'Identity denied' using errcode='42501';
  end if;
  if (claims->>'exp')::numeric<=extract(epoch from pg_catalog.clock_timestamp())
    or (claims->>'iat')::numeric>extract(epoch from pg_catalog.clock_timestamp())+5 then
    raise exception 'Identity denied' using errcode='42501';
  end if;
  select c.resource,c.issuer into mapped_resource,mapped_issuer from public.mcp_clients c
    where c.client_id=claims->>'client_id' and c.enabled for share;
  if mapped_resource is null or mapped_issuer is null
    or claims->>'aud' is distinct from mapped_resource or claims->>'iss' is distinct from mapped_issuer then
    raise exception 'Identity denied' using errcode='42501';
  end if;
  return query select auth.uid(),claims->>'client_id',(claims->>'session_id')::uuid,mapped_resource;
exception when invalid_text_representation then
  raise exception 'Identity denied' using errcode='42501';
end $$;
create function fluentloop_private.mcp_check_session(p_user uuid,p_client text,p_session uuid,p_resource text) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
begin
  perform 1 from public.mcp_clients c where c.client_id=p_client and c.enabled and c.resource=p_resource for share;
  if not found then raise exception 'Client denied' using errcode='42501'; end if;
  perform 1 from auth.sessions s where s.id=p_session and s.user_id=p_user
    and s.oauth_client_id::text=p_client and (s.not_after is null or s.not_after>pg_catalog.clock_timestamp()) for share;
  if not found then raise exception 'Session denied' using errcode='42501'; end if;
  return true;
end $$;

create function fluentloop_private.mcp_save_correction(
  p_user uuid,p_client text,p_session uuid,p_resource text,p_request uuid,
  p_original text,p_corrected text,p_explanation text
) returns table(id bigint,created_at timestamptz)
language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare
  saved public.corrections;
  quota_used integer;
  quota_now timestamptz;
  receipt_id bigint;
begin
  perform fluentloop_private.mcp_check_session(p_user,p_client,p_session,p_resource);
  if p_request is null then raise exception 'Missing request ID' using errcode = '22023'; end if;
  -- Serialize this user's upload attempts before checking idempotency/quota.
  -- A hash collision only serializes unrelated users; it does not grant access.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 0));
  quota_now := pg_catalog.clock_timestamp();
  select r.correction_id into receipt_id from public.mcp_request_receipts r
    where r.user_id = p_user and r.request_id = p_request;
  if found then
    select * into saved from public.corrections c
      where c.id = receipt_id and c.user_id = p_user and c.request_id = p_request for key share;
    if not found then raise exception 'Previously saved correction already deleted' using errcode = '22023'; end if;
    if saved.original is distinct from trim(p_original) or saved.corrected is distinct from trim(p_corrected)
      or saved.explanation is distinct from trim(p_explanation) then
      raise exception 'Request ID already used for different content' using errcode = '22023';
    end if;
    return query select saved.id, saved.created_at;
    return;
  end if;
  if not exists(select 1 from public.corrections c where c.user_id = p_user and c.request_id = p_request) then
    insert into public.mcp_upload_windows as w (user_id, window_start, used)
      values (p_user, quota_now, 1)
      on conflict (user_id) do update set
        window_start = case when w.window_start <= quota_now - interval '1 hour'
          then quota_now else w.window_start end,
        used = case when w.window_start <= quota_now - interval '1 hour'
          then 1 else w.used + 1 end
      where w.window_start <= quota_now - interval '1 hour' or w.used < 120
      returning used into quota_used;
    if not found then raise exception 'Upload limit reached' using errcode = '54000'; end if;
  end if;
  insert into public.corrections(user_id, request_id, original, corrected, explanation)
    values(p_user, p_request, trim(p_original), trim(p_corrected), trim(p_explanation))
    on conflict(user_id, request_id) do nothing returning * into saved;
  if saved.id is null then
    select * into saved from public.corrections c where c.user_id = p_user and c.request_id = p_request for key share;
    if saved.original is distinct from trim(p_original) or saved.corrected is distinct from trim(p_corrected)
      or saved.explanation is distinct from trim(p_explanation) then
      raise exception 'Request ID already used for different content' using errcode = '22023';
    end if;
  end if;
  insert into public.mcp_request_receipts(user_id, request_id, correction_id) values (p_user, p_request, saved.id);
  return query select saved.id, saved.created_at;
end;
$$;


-- The only public RPC entry points; no identity or resource arguments exist.
create function public.mcp_check_session() returns boolean
language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare identity record;
begin
  select * into strict identity from fluentloop_private.mcp_identity();
  return fluentloop_private.mcp_check_session(identity.user_id,identity.client_id,identity.session_id,identity.resource);
end $$;
create function public.mcp_save_correction(p_request uuid,p_original text,p_corrected text,p_explanation text)
returns table(id bigint,created_at timestamptz)
language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare identity record;
begin
  select * into strict identity from fluentloop_private.mcp_identity();
  return query select * from fluentloop_private.mcp_save_correction(identity.user_id,identity.client_id,identity.session_id,identity.resource,p_request,p_original,p_corrected,p_explanation);
end $$;
revoke all on all functions in schema fluentloop_private from public,anon,authenticated,service_role;
revoke all on function public.mcp_check_session(),public.mcp_save_correction(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.mcp_check_session(),public.mcp_save_correction(uuid,text,text,text) to authenticated;
revoke all on function public.fluentloop_access_token_hook(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fluentloop_access_token_hook(jsonb) to supabase_auth_admin;
-- No runtime service/admin credential. Existing mcp_grants stays locked and inert.
commit;
