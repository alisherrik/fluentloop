-- READ ONLY: run against the verified target, after separate migration approval.
-- 1. Expected: exactly 3 rows, each relrowsecurity=true.
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('corrections','mcp_clients','mcp_grants') and c.relkind='r'
order by c.relname;

-- 2. Expected: corrections authenticated SELECT/INSERT/DELETE only;
-- mcp_clients SELECT only; mcp_grants SELECT/DELETE only; anon all false.
with t(name) as (values ('corrections'),('mcp_clients'),('mcp_grants')),
 p(priv) as (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))
select t.name, p.priv,
 has_table_privilege('anon',format('public.%I',t.name),p.priv) as anon,
 has_table_privilege('authenticated',format('public.%I',t.name),p.priv) as authenticated
from t cross join p order by t.name,p.priv;

-- 3. Expect no authenticated/anon INSERT or UPDATE column privilege on grants.
select column_name,
 has_column_privilege('anon','public.mcp_grants',column_name,'INSERT') as anon_insert,
 has_column_privilege('anon','public.mcp_grants',column_name,'UPDATE') as anon_update,
 has_column_privilege('authenticated','public.mcp_grants',column_name,'INSERT') as authenticated_insert,
 has_column_privilege('authenticated','public.mcp_grants',column_name,'UPDATE') as authenticated_update
from information_schema.columns where table_schema='public' and table_name='mcp_grants' order by ordinal_position;

-- 4. Expected restrictive grant insert/update blocks; own read/delete policies;
-- restrictive OAuth client denial for corrections and own correction policies.
select tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in ('corrections','mcp_clients','mcp_grants')
order by tablename,policyname;

-- 5. Expect anonymous USAGE and SELECT false; authenticated USAGE and SELECT true.
select has_sequence_privilege('anon','public.corrections_id_seq','USAGE') anon_usage,
 has_sequence_privilege('anon','public.corrections_id_seq','SELECT') anon_select,
 has_sequence_privilege('authenticated','public.corrections_id_seq','USAGE') authenticated_usage,
 has_sequence_privilege('authenticated','public.corrections_id_seq','SELECT') authenticated_select;

-- 6. Inspect ALL explicit ACLs, inherited role memberships and platform access.
-- The migration does not revoke owner/service roles or unknown pre-existing roles.
select c.relname, coalesce(c.relacl::text,'<owner/default>') as acl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('corrections','corrections_id_seq','mcp_clients','mcp_grants') order by c.relname;
select r.rolname as member, p.rolname as granted_role
from pg_auth_members m join pg_roles r on r.oid=m.member join pg_roles p on p.oid=m.roleid
where r.rolname in ('anon','authenticated') order by r.rolname,p.rolname;
