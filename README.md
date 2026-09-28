# Plant Pharmacy Website

Informational website for a pharmacy specializing in plant-based products, with an
employee-only administrative panel. The site is strictly informational: there is no
ordering, cart, checkout, payment, shipping, or customer account functionality.

See [PROJECT.md](PROJECT.md) for the full specification and milestone plan.

## Current state

Milestones 1–5 (Project Foundation, Supabase Foundation, Database Schema, Database
Security / RLS, Admin Authentication) are complete. The public site is still a placeholder
page. The `products`, `events` and `user_roles` tables with Row Level Security are applied
to the hosted Supabase project and verified there (2026-09-28). Staff can sign in at
`/admin/login` and reach a minimal `/admin` dashboard (see [Admin authentication](#admin-authentication));
the Owner sign-in flow has been verified against the hosted project (2026-09-28).
Product/event management, employee management and the visual design are not
implemented yet.

## Access model

Three access levels (full detail in [PROJECT.md](PROJECT.md) sections 5 and 7):

- **Public Visitor**: no account. Reads all products (unavailable ones included; the UI
  will label them) and currently visible events. No writes.
- **Employee**: signs in with Supabase Auth. Manages products and events.
- **Owner**: signs in with Supabase Auth. Has every Employee permission and is the only
  role that can manage employees (`/admin/employees`).

Signing in is not enough to get admin access: a user also needs an `owner` or `employee`
role in an application authorization record. There is no public sign-up. The Owner invites
each Employee through Supabase, and the Employee then sets their own password. Any
privileged Supabase key used for invitations stays in server-side code only. The database
side (roles and RLS) and staff login are implemented; employee management comes in
Milestone 6.

## Technology foundation

- [Next.js](https://nextjs.org) 16 (App Router, `src/` directory)
- React 19
- TypeScript 5 (strict mode)
- ESLint 9 (flat config with `eslint-config-next` core-web-vitals and TypeScript rules)
- [Supabase](https://supabase.com) via `@supabase/ssr` and `@supabase/supabase-js`
- npm

## Prerequisites

- Node.js 22.18 or later on the 22.x line, or 23.6 or later (current LTS recommended).
  Supabase's client libraries require Node 22, and `npm test` needs Node's built-in
  TypeScript type stripping, which is on by default from 22.18 / 23.6.
- npm (bundled with Node.js)
- A Supabase project (https://supabase.com/dashboard)

## Installation

```bash
npm install
```

## Environment setup

Copy the example file and fill in your Supabase project's values:

```bash
cp .env.example .env.local
```

| Variable                               | Where to find it (Supabase Dashboard)                    |
| -------------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project Settings → Data API → Project URL                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key (`sb_publishable_...`); the legacy `anon` key also works |

Both values are public by design. Never put the secret key (`sb_secret_...`) or legacy
`service_role` key in a `NEXT_PUBLIC_` variable; the app refuses to start if one is
detected. The application does not currently use any privileged key.

The app requires these variables: without them every request fails with a
"Missing Supabase environment variables" error.

Verify the connection with:

```bash
npm run check:supabase
```

`.env.local` is ignored by Git and must never be committed. `.env.example` is committed
and must only contain placeholders. Variables prefixed with `NEXT_PUBLIC_` are exposed to
the browser; everything else is server-only.

## Commands

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Start the development server at http://localhost:3000 |
| `npm run build`     | Create a production build                          |
| `npm run start`     | Serve the production build (run `build` first)     |
| `npm run lint`      | Run ESLint                                         |
| `npm run typecheck` | Generate Next.js route types and run `tsc --noEmit` |
| `npm test`          | Run the unit tests in `tests/` (Node's built-in test runner) |
| `npm run check:supabase` | Check the configured Supabase project is reachable and accepts the key (reads `.env.local`) |

## Database

The schema lives in [supabase/migrations/](supabase/migrations/) and is managed with the
[Supabase CLI](https://supabase.com/docs/guides/local-development) (run it with
`npx supabase ...`; it is not a project dependency). Never create or alter tables through
the dashboard: add a new migration instead (`npx supabase migration new <name>`) and do
not edit migrations that have already been applied.

| Table      | Purpose                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `products` | Catalog entries. `slug` is unique lowercase kebab-case; `price` is optional and non-negative. |
| `events`   | Promotions, announcements and events. Publicly visible when `is_active and starts_at <= now() and ends_at >= now()`. |
| `user_roles` | Application role (`owner` or `employee`) per staff member, keyed by `auth.users.id`. No credentials. At most one `owner`. |

All tables have `created_at`/`updated_at`; a trigger keeps `updated_at` current on every
update.

With Docker installed, `npx supabase start` runs a local stack and
`npx supabase db reset` rebuilds the local database from the migrations and loads the
development data in [supabase/seed.sql](supabase/seed.sql). The seed is never applied to
the hosted project.

### Security model

Authorization is enforced by PostgreSQL, not by the UI. Two layers apply to every Data API
request (browser or server, both use the publishable key plus the user's session):

1. **Grants** decide which statements the Postgres role may run at all.
2. **RLS policies** decide which rows those statements can see or change.

The request runs as `anon` without a session and as `authenticated` with one. The
application role (`owner`/`employee`) is looked up in `user_roles` by the policies through
`private.is_staff()`; nothing in the JWT (including `user_metadata`) grants privileges.

| Who                        | `products`             | `events`                           | `user_roles`       |
| -------------------------- | ---------------------- | ---------------------------------- | ------------------ |
| `anon` (Public Visitor)    | read all               | read currently visible only        | no access          |
| `authenticated`, no role   | read all               | read currently visible only        | read own row (none) |
| `authenticated` employee   | read all, insert/update/delete | read all, insert/update/delete | read own row      |
| `authenticated` owner      | read all, insert/update/delete | read all, insert/update/delete | read own row      |
| `service_role` (server only) | all (bypasses RLS)   | all (bypasses RLS)                 | all (bypasses RLS) |

Grants: `anon` has only `SELECT` on `products`/`events`. `authenticated` has `SELECT`,
`INSERT`, `UPDATE`, `DELETE` on `products`/`events` (RLS lets writes through only for
staff) and only `SELECT` on `user_roles`. Nobody but `service_role` has `TRUNCATE`
(which ignores RLS) or any write privilege on `user_roles`, so roles cannot be changed
through the Data API by anyone, the Owner included. Owner employee management
(Milestone 6) will use the `service_role`/secret key in server-side code only.

`private.is_staff()` is a `SECURITY INVOKER` function in the `private` schema, which is
not exposed through the Data API (so it is not callable as RPC). It works because every
authenticated user may read their own `user_roles` row.

### Auth settings: no public sign-up

Public sign-up is disabled in [supabase/config.toml](supabase/config.toml) (`[auth]` and
`[auth.email]` `enable_signup = false`). That file only configures the **local** stack.
On a hosted project it is a separate Dashboard setting: Authentication → Sign In /
Providers → turn off "Allow new users to sign up" (done and verified on the current
hosted project: `/auth/v1/signup` returns `signup_disabled`). Invitations (Dashboard or the server-side Admin API)
still work with sign-up disabled.

### Deploying the database

Done for the current hosted project; repeat for any new environment. Apply the
migrations together, never just the first one (the Milestone 3 tables have no RLS on
their own):

1. Disable public sign-up on the hosted project (above).
2. `npx supabase link --project-ref <project-ref>`, then `npx supabase db push`. Check the
   list of pending migrations it prints includes both files before confirming.
3. Verify in the Dashboard (Database → Tables) that RLS is enabled on `products`,
   `events` and `user_roles`, and that the Security Advisor reports no issues for them.
   The CLI applies the migrations one after another, so for a moment the Milestone 3
   tables exist without RLS; also confirm all three tables are still empty (the seed is
   never pushed, so any row would be unexpected).
4. Bootstrap the Owner (below).

### Bootstrapping the Owner

There is exactly one Owner. No identity is stored in migrations; the Owner is assigned
once per environment by a deliberate manual step:

1. Dashboard → Authentication → Users → Add user → **Create new user** with the Owner's
   email; the Owner types their own password and "Auto Confirm User" is ticked. (Do not
   use "Invite user" yet: the application has no page to accept an invitation and set a
   password until Milestone 6.)
2. Run [scripts/bootstrap-owner.sql](scripts/bootstrap-owner.sql) with
   `REPLACE_WITH_OWNER_EMAIL` replaced by the Owner's email **outside the repository**
   (never commit it), either:
   - Dashboard → SQL Editor: paste the script and replace the placeholder in the editor, or
   - linked CLI, substituting in memory only:
     `npx supabase db query --linked --file <(sed "s/REPLACE_WITH_OWNER_EMAIL/owner@example.com/" scripts/bootstrap-owner.sql)`
     (use `--file`: passed as an argument, the script's leading `--` comment is parsed as
     a CLI flag and nothing runs).

The script refuses to run with the placeholder, fails if no Auth user has that email, and
fails if an Owner already exists. Transferring ownership later is a manual SQL operation
(delete or demote the current owner row, then insert the new one in the same
transaction).

## Admin authentication

Staff (Owner and Employees) sign in at **`/admin/login`** with email and password through
Supabase Auth. There is no sign-up form, registration link or other way to create an
account in the application, and public sign-up stays disabled in Supabase (see
[Auth settings](#auth-settings-no-public-sign-up)).

**Provisioning accounts.** Accounts are created administratively, never by the public:
the Owner was created in the Supabase Dashboard and given the `owner` role with
[scripts/bootstrap-owner.sql](scripts/bootstrap-owner.sql) (see
[Bootstrapping the Owner](#bootstrapping-the-owner)). Employees will be invited by the Owner
from `/admin/employees` (Milestone 6). Until then, an Employee would need an Auth user
created in the Dashboard plus a `user_roles` row with role `employee` inserted with SQL by a
privileged database user; none exist today.

**Authorization.** A session alone is not enough. Every `/admin` route except
`/admin/login` requires the signed-in user to have an `owner` or `employee` row in
`user_roles`. The role is read with the user's own session and the publishable key (the
`user_roles_select_own` RLS policy lets users read only their own row); no privileged key
is used and no RLS policy was changed.

| Visitor                                    | `/admin` and child routes                          | `/admin/login`                    |
| ------------------------------------------ | -------------------------------------------------- | --------------------------------- |
| No session (or expired/invalid session)    | Redirect to `/admin/login`                         | Login form                        |
| Signed in, `owner`/`employee` role         | Allowed                                            | Redirect to `/admin`              |
| Signed in, no staff role                   | Session is signed out, redirect to `/admin/login?error=unauthorized` ("This account does not have access to the admin area.") | Login form (no redirect loop) |
| Role could not be read (network/DB error)  | Redirect to `/admin/login?error=unavailable`; session kept, access denied (fails closed) | Login form |

Signing in with valid credentials for an account without a staff role is refused the same
way: the new session is signed out immediately and the form shows the "does not have
access" message. Wrong credentials always show "Invalid email or password.", whether or
not the email exists.

**Where the checks run.** All of these checks run on the server:

1. [src/proxy.ts](src/proxy.ts) runs on every request. It refreshes the session and, for
   `/admin/*` except `/admin/login`, verifies the JWT (`getClaims()`) and looks up the
   role. This covers page loads, client-side navigations and Server Function POSTs,
   so new admin routes are protected automatically.
2. [src/lib/auth/staff.ts](src/lib/auth/staff.ts) is the data access layer:
   `requireStaff()` returns `{ id, email, role }` or redirects. The layout of the
   `src/app/admin/(dashboard)/` route group calls it, and every admin page and Server
   Function that reads or changes admin data must call it too, because layouts do not
   re-run on client navigation.
3. RLS in the database still enforces every write, whatever the UI does.

Put new admin pages inside `src/app/admin/(dashboard)/`. The role rules live in
[src/lib/auth/roles.ts](src/lib/auth/roles.ts).

**Logout.** The "Log out" button in the admin header calls a Server Function that revokes
the current session (`signOut({ scope: "local" })`, so other devices stay signed in),
clears the auth cookies and redirects to `/admin/login`. After that, `/admin` redirects
back to the login page.

**Sessions.** Sessions live in the standard `@supabase/ssr` auth cookies and survive
navigation and page refreshes. The proxy refreshes expired access tokens with the refresh
token, and a session whose refresh fails is treated as signed out. The hosted project
signs JWTs with an asymmetric key (ES256), so `getClaims()` verifies them locally. As a
result, a copy of an access token taken before logout stays cryptographically valid until
it expires (1 hour by default), although the refresh token is revoked immediately.
Revoking a user's role takes effect on their next request, because the role is read from
`user_roles` on every admin request.

**Manual check (Owner, per environment).** With `npm run dev` (or the deployed site):
open `/admin` and confirm it sends you to `/admin/login`. Sign in and confirm you land on
`/admin`, which shows your email and "Owner". Refresh, go to `/` and back to `/admin`: you
should still be signed in. Open `/admin/login` and confirm it sends you to `/admin`. Click
"Log out" and confirm you land on `/admin/login`, and that `/admin` now redirects there
again. A wrong password shows "Invalid email or password.".

This check passed for the real Owner account on the hosted project on 2026-09-28 (login,
role shown as Owner, session kept across refresh and navigation, `/admin/login` redirect,
logout, `/admin` protected afterwards). The Employee and no-role paths have not been run
against the hosted project, because no such accounts exist there. They are covered by the
local end-to-end tests and the Milestone 4 RLS tests.

## Project structure

```
src/
  app/
    layout.tsx    Root layout
    page.tsx      Home page (placeholder)
    globals.css   Global styles
    favicon.ico
    admin/
      actions.ts          logout Server Function
      login/              /admin/login: page, client form, login Server Function
      (dashboard)/        Protected admin routes: layout (requireStaff + header) and /admin page
  lib/
    auth/
      roles.ts    Admin authorization rules (role parsing, protected paths, role lookup, messages)
      staff.ts    Server-only data access layer: getAdminAccess(), requireStaff()
    supabase/
      env.ts      Reads/validates the public Supabase env vars
      client.ts   Supabase client for Client Components (browser)
      server.ts   Supabase client for Server Components, Server Functions, Route Handlers (server-only)
      proxy.ts    Session refresh + redirect helpers used by the proxy
  proxy.ts        Next.js proxy (formerly middleware): refreshes the session, guards /admin/*
tests/
  auth-roles.test.ts  Unit tests for src/lib/auth/roles.ts (npm test)
supabase/
  config.toml   Supabase CLI configuration (local stack, seed paths; public sign-up disabled)
  migrations/   Database schema migrations, applied in filename order
  seed.sql      Local development data (loaded by `supabase db reset` only)
scripts/
  check-supabase.mjs  Read-only connectivity check against the Supabase Auth health endpoint
  bootstrap-owner.sql One-time manual SQL to assign the initial Owner (run in the SQL Editor)
```

Use `@/lib/supabase/server` in server code and `@/lib/supabase/client` in Client
Components. Importing the server client into a Client Component is a build error.
The proxy refreshes sessions on every request and guards `/admin/*` (see
[Admin authentication](#admin-authentication)).

Path alias `@/*` maps to `src/*`.
