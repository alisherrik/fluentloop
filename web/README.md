# FluentLoop web

A corrections notebook with opt-in MCP uploads. Local FluentLoop hooks remain offline.

Use Node 22.18 or later. Run npm ci, npm test, npm run typecheck and npm run build. Configure the public values in .env.example for the target Supabase project and site origin. No runtime service-role/admin secret is required.

MCP stays closed unless MCP_ENABLED=true. Before activation, review and apply supabase/migrations/006_user_jwt_mcp.sql directly after the existing production_dashboard.sql foundation. Do not layer it over historical drafts 003 or 005. The transaction aborts on conflicting draft objects or missing Auth session prerequisites. It does not register a client, enable OAuth, configure a hook or deploy the application.

An approved setup requires Supabase OAuth with public PKCE clients, the app's /oauth/consent authorization path, asymmetric signing, and the fluentloop_access_token_hook. Each trusted mcp_clients registration must include its exact resource URL ending in /mcp and the exact Supabase Auth issuer ending in /auth/v1. Keep unrestricted dynamic registration disabled when using pre-registered clients. Review actual callback URLs with each client.

The app verifies JWT signature, issuer and exact resource audience. Authenticated SQL wrappers derive identity from the verified request claims and check the live user/client/session within the insertion transaction. Private internals cannot be called by browser roles. Only save_correction is exposed: original, corrected and explanation, with request_id retry metadata and consent=true. Quotas remain shared per user; deletion receipts prevent retries from recreating deleted text.

MCP_ENABLED=false closes app routes; disabling the registry client or revoking its native OAuth grant stops direct authenticated RPC writes. The local ingress cap is process-local, so retain trusted upstream connection/request limits.

Local tests execute real PostgreSQL/PGlite and real MCP SDK loopback HTTP/JWKS with synthetic Auth sessions. A separate unit test checks Supabase SDK bearer and RPC argument wiring. These tests do not verify hosted PostgREST resource-audience acceptance, actual provider/client OAuth, or native concurrent database locking. Verify those against the target configuration before production activation; do not broaden the audience requirement to make a rejected token work.
