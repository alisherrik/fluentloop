-- Read-only preflight. Run against the explicitly confirmed target; review output.
select current_database(),current_user;
select table_name,column_name,udt_name from information_schema.columns
where (table_schema='auth' and table_name='sessions' and column_name in ('id','user_id','oauth_client_id','not_after'))
   or (table_schema='public' and table_name='mcp_clients') order by table_name,ordinal_position;
select has_table_privilege(current_user,'auth.sessions','SELECT') as owner_can_read_sessions,
       has_table_privilege(current_user,'auth.sessions','UPDATE') as owner_can_lock_sessions;
select to_regprocedure('public.fluentloop_access_token_hook(jsonb)') as existing_hook,
       to_regclass('public.mcp_upload_windows') as existing_mcp_draft,
       to_regclass('public.mcp_grants') as locked_legacy_grants;
select relname,relrowsecurity from pg_class where oid in ('public.corrections'::regclass,'public.mcp_clients'::regclass,'public.mcp_grants'::regclass);
select has_table_privilege('authenticated','public.mcp_grants','INSERT') as browser_can_create_grants,
       has_table_privilege('authenticated','public.mcp_grants','UPDATE') as browser_can_modify_grants;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('corrections','mcp_clients','mcp_grants');
-- Inspect Supabase migration history and existing hook configuration separately.
