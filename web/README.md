# FluentLoop web foundation

This Next.js and TypeScript application provides a manual, opt-in corrections notebook. Its intended authentication is Google sign-in through Supabase. The existing FluentLoop CLI and hooks remain offline and are not connected to this application.

**Status:** the application is not yet production-ready. Google sign-in, hosted database policies and session behavior require end-to-end testing against the target deployment. The public MCP endpoint, its resource metadata and OAuth consent page are disabled. There is no working MCP connector, automated correction upload or active grant-creation flow.

## Local development

Requirements: Node.js 22.18 or later, npm, and a separately configured Supabase project.

1. Run `npm ci`. Copy `.env.example` to `.env.local`, and supply the project's URL and **publishable** key. Keep secret or service-role credentials out of browser variables and source control.
2. For an empty Supabase project, review `PRODUCTION_SCHEMA_REVIEW.md` and `supabase/production_dashboard.sql`. Confirm the intended project and obtain approval before applying the schema. Never run it over existing tables. Afterward review `supabase/production_verify.sql` and perform an isolated, rollback-only two-user authorization test.
3. Configure an authorized Google OAuth web client in Google Cloud and its Google provider in Supabase. Register the exact Supabase callback from that project's provider configuration with Google. Configure the Supabase Site URL and allow the app's `/auth/callback` for the intended site origin. Never put the Google client secret in this repository, a public variable, or chat.
4. For local development set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, run `npm run dev`, and open `http://localhost:3000`. Google login requires a configured provider and must be tested; an empty environment displays the setup-needed state.
5. Run `npm test` and `npm run build`. The schema tests use a local emulated database and do not verify hosted Supabase.

The browser sends the three form fields only when the user chooses Save; the database uses row-level security to separate accounts. Avoid entering secrets or private source code. Corrections can be deleted from the notebook. Account deletion, a public privacy policy, and production data-retention procedures are not yet implemented.

## Deployment

A production deployment requires an approved HTTPS site origin, separate production service configuration, verified access controls, a public privacy policy and a reviewed incident/data-retention plan. Build the exact commit with public configuration intended for that environment; Next.js can embed public variables into browser assets. Validate Google PKCE, redirect allowlists, session refresh, two-user RLS isolation, delete behavior and real browser flows before using real user data. The SQL is a one-time initial schema, not an automatic upgrade or a recorded migration history. Do not deploy or enable paid services without approval.

The Dockerfile is provided as an optional build path; it has not been verified in a Linux deployment environment. MCP must remain disabled until resource-bound authorization, consent and revocation, distributed limits and real-client integration are independently reviewed and tested.
