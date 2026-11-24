-- Read-only checks for migration 006, not the service-role comparison 005.
select p.proname,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig from pg_proc p
where p.pronamespace='public'::regnamespace and p.proname in ('mcp_check_session','mcp_save_correction','fluentloop_access_token_hook');
select r.rolname,p.proname,has_function_privilege(r.rolname,p.oid,'EXECUTE') as can_execute
from pg_roles r cross join pg_proc p where p.pronamespace='public'::regnamespace
and p.proname in ('mcp_check_session','mcp_save_correction','fluentloop_access_token_hook')
and r.rolname in ('anon','authenticated','service_role','supabase_auth_admin') order by p.proname,r.rolname;
-- Public wrappers: authenticated only; hook: supabase_auth_admin only (owners unaffected).
select r.rolname,has_schema_privilege(r.rolname,'fluentloop_private','USAGE') as private_schema_usage,
 p.proname,has_function_privilege(r.rolname,p.oid,'EXECUTE') as private_execute
from pg_roles r cross join pg_proc p where p.pronamespace='fluentloop_private'::regnamespace
and r.rolname in ('anon','authenticated','service_role');
-- All private_schema_usage and private_execute above must be false.
select client_id,display_name,enabled,resource,issuer from public.mcp_clients;
