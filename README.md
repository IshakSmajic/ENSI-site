# Plant Pharmacy Website

Informational website for a pharmacy specializing in plant-based products, with an
employee-only administrative panel. The site is strictly informational: there is no
ordering, cart, checkout, payment, shipping, or customer account functionality.

See [PROJECT.md](PROJECT.md) for the full specification and milestone plan.

## Current state

Milestones 1–6 (Project Foundation, Supabase Foundation, Database Schema, Database
Security / RLS, Admin Authentication, Owner Employee Management) are complete. The public site is still a placeholder
page. The `products`, `events` and `user_roles` tables with Row Level Security are applied
to the hosted Supabase project and verified there (2026-09-28). Staff can sign in at
`/admin/login` and reach a minimal `/admin` dashboard (see [Admin authentication](#admin-authentication));
the Owner sign-in flow has been verified against the hosted project (2026-09-28).
Owner employee management (`/admin/employees`) works on the hosted project, which sends
invitation emails through custom SMTP. The full invite, accept, sign-in and removal
lifecycle was verified there on 2026-09-30 (see
[Employee management](#employee-management-owner-only)). Product/event management and the
visual design are not implemented yet.

## Access model

Three access levels (full detail in [PROJECT.md](PROJECT.md) sections 5 and 7):

- **Public Visitor**: no account. Reads all products (unavailable ones included; the UI
  will label them) and currently visible events. No writes.
- **Employee**: signs in with Supabase Auth. Manages products and events.
- **Owner**: signs in with Supabase Auth. Has every Employee permission and is the only
  role that can manage employees (`/admin/employees`).

Signing in is not enough to get admin access: a user also needs an `owner` or `employee`
role in an application authorization record. There is no public sign-up. The Owner invites
each Employee through Supabase, and the Employee then sets their own password. The
privileged Supabase key used for invitations stays in server-side code only.

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
| `SUPABASE_SECRET_KEY` (server-only)    | Project Settings → API Keys → Secret keys (`sb_secret_...`); the legacy `service_role` key also works |

The two `NEXT_PUBLIC_` values are public by design. Never put the secret key
(`sb_secret_...`) or legacy `service_role` key in a `NEXT_PUBLIC_` variable; the app
refuses to start if one is detected.

`SUPABASE_SECRET_KEY` is the only privileged credential. It has no `NEXT_PUBLIC_` prefix,
so Next.js never ships it to the browser. It is read only by
[src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) (a `server-only` module) and used
only by Owner employee management. Set it in `.env.local` locally and as a server-side
environment variable in production. Never commit it. If it leaks, rotate it in the
Dashboard. Without it, everything except `/admin/employees` works, and that page shows
"Employee management is not configured on the server."

The app requires the two public variables: without them every request fails with a
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
through the Data API by anyone, the Owner included. Owner employee management uses the
secret key (`service_role`) in server-side code only, after checking the Owner role (see
[Employee management](#employee-management-owner-only)). No migration or RLS change was
needed for it.

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
   email; the Owner types their own password and "Auto Confirm User" is ticked.
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
[Bootstrapping the Owner](#bootstrapping-the-owner)). Employees are invited by the Owner
from `/admin/employees` (see [Employee management](#employee-management-owner-only)).

**Authorization.** A session alone is not enough. Every `/admin` route except
`/admin/login` and `/admin/accept-invite` requires the signed-in user to have an `owner` or `employee` row in
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
logout, `/admin` protected afterwards). Employee sign-in was verified on the hosted project
on 2026-09-30 as part of the employee management check (below). The no-role path has not
been run against the hosted project, because no such account exists there. It is covered
by the local end-to-end tests and the Milestone 4 RLS tests.

## Employee management (Owner only)

The Owner manages Employees at **`/admin/employees`**, linked from the dashboard for the
Owner only. The page lists current Employees (email, "Employee", invitation
pending/active, date added), has an "Add employee" form (email only) and a "Remove access"
button per Employee, which asks for confirmation. There is no role editor: the page only
ever grants or revokes the `employee` role. The Owner never appears in the list, and no
Owner can be created, changed or removed here.

**Who can use it.**

| Caller                     | `/admin/employees` page                         | Invite / remove Server Functions |
| -------------------------- | ----------------------------------------------- | -------------------------------- |
| Anonymous                  | Redirect to `/admin/login` (proxy)              | Redirect to `/admin/login`; nothing runs |
| Signed in, no role         | Signed out, `/admin/login?error=unauthorized`   | Same; nothing runs               |
| Employee                   | "Only the owner can manage employees." No data  | Same message; no privileged call |
| Owner                      | List and forms                                  | Allowed                          |

**Architecture.**

- [src/lib/employees/management.ts](src/lib/employees/management.ts) holds the rules:
  `listEmployees`, `inviteEmployee` and `removeEmployee`. Each one starts with
  `authorizeOwner()`, based on the caller's verified session and their own `user_roles`
  row (`getAdminAccess()`). The privileged directory is opened only after that check
  passes. Nothing the browser sends is trusted as authorization: any `role` form field is
  ignored, and a submitted user id is only a reference that the server re-checks.
- [src/lib/employees/supabase-directory.ts](src/lib/employees/supabase-directory.ts)
  performs the privileged operations: the Auth Admin API (`inviteUserByEmail`,
  `getUserById`, `listUsers`, `deleteUser`) and `user_roles` insert/delete with the secret
  key. The role insert is hard-coded to `employee`, and the delete is filtered on
  `role = 'employee'`, so it can never touch the Owner row. Only error codes are kept.
  Raw Supabase/SQL messages and user metadata are never passed to the UI.
- [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) creates the privileged client:
  `server-only`, stateless (no session storage or refresh), and reading
  `SUPABASE_SECRET_KEY`. Everything else still uses the user-scoped clients and RLS.
- Server Functions:
  [src/app/admin/(dashboard)/employees/actions.ts](src/app/admin/(dashboard)/employees/actions.ts).
- No database migration and no RLS change. `service_role` already had the grants from the
  Milestone 4 migration.

**Provisioning (invitation).**

1. The Owner enters an email. It is validated, trimmed and lower-cased.
2. The server refuses the email if an Auth account already exists for it: the Owner's
   email, an existing Employee, or an account without a role. Existing accounts are never
   silently given the employee role.
3. `inviteUserByEmail` creates the Auth user, and Supabase sends the invitation email.
4. The server inserts `user_roles (user_id, 'employee')`.
5. The invited Employee opens the link, which leads to **`/admin/accept-invite`**, and
   chooses a password (8–72 characters, typed twice). Only on submit does the server
   verify the one-time token (`verifyOtp` type `invite`, with the publishable key). It
   then sets the password (`updateUser`), checks the role, and redirects to `/admin`.
   Opening the link does not spend the token, so email link scanners cannot use it up.
   The page sends no referrer.

The Owner never sees, sets or stores the password. Public sign-up stays disabled:
invitations work regardless.

**Revocation.** "Remove access" works in this order:

1. The server re-reads the target's role. It refuses the Owner, the caller themselves and
   any non-employee.
2. It deletes the `employee` row. From this point every admin request, Server Function
   and RLS check denies the user.
3. It **deletes the Auth user** (`deleteUser`, a hard delete). This removes their sessions
   and refresh tokens and frees the email for a later re-invite.

Access tokens they already hold stay cryptographically valid until they expire (1 hour or
less), but they are useless: the role is gone and is re-checked on every request.

**Partial failures.**

| Failure | Result |
| ------- | ------ |
| Invite API fails (network, rate limit, duplicate) | Safe message; no role granted. Supabase rolls the user back if the email cannot be sent. |
| Auth user created, role insert fails | The new Auth user is deleted again, which also invalidates the emailed link. If that cleanup fails too, an account without a role (no access) remains, and the Owner is told. |
| Role deleted, Auth user deletion fails | Access is revoked anyway. The Owner is told to delete the account in the Dashboard. |
| Role lookup/revoke fails | Nothing is deleted; the Owner may retry. |
| Password save fails after the token was verified | The session is signed out. The link is spent, so the Owner removes and re-invites the Employee. |

An Auth user without a `user_roles` row never has admin access, so every failure fails
closed.

**Required hosted configuration (done on the current hosted project; repeat for every new
environment).**

1. Add `SUPABASE_SECRET_KEY` to `.env.local` (and later to the production environment).
2. Dashboard → Authentication → Emails → **Invite user** template: replace the body with
   [supabase/templates/invite.html](supabase/templates/invite.html). It links to
   `{{ .SiteURL }}/admin/accept-invite?token_hash={{ .TokenHash }}`. The default template
   uses a link the app cannot complete. The local stack picks the template up from
   [supabase/config.toml](supabase/config.toml).
3. Dashboard → Authentication → URL Configuration → **Site URL** must be the address the
   app is served from (for example `http://localhost:3000` while testing locally, and the
   production domain at deployment).
4. Dashboard → Authentication → Emails → **SMTP Settings**: configure a custom SMTP
   provider. Supabase's built-in sender is heavily rate-limited and meant for testing
   only. The SMTP credentials live only in the Supabase Dashboard, never in this
   repository or in `.env.local`.

**Manual hosted check (Owner; creates one real test Employee account).**

1. Sign in as the Owner, open `/admin/employees` and add an email address you control.
2. Open the email, set a password, and confirm you land on `/admin` as "Employee".
3. As that Employee, open `/admin/employees` and confirm you see "Only the owner can manage
   employees."
4. As the Owner, remove the Employee, then confirm the Employee's session is sent to
   `/admin/login` and that their sign-in now fails.

This check passed on the hosted project on 2026-09-30, with the invitation delivered
through custom SMTP: the Owner invited a test Employee, the email link opened
`/admin/accept-invite`, the Employee set their own password, signed in and reached the
admin area, and after the Owner removed them they could no longer sign in or reach the
admin area.

**Tests.** `npm test` covers the Owner gate for every caller type, validation, duplicates,
Owner protection, partial-failure compensation, the adapter's queries and the
accept-invite flow. See PROJECT.md (development log) for the mock end-to-end run.

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
      accept-invite/      /admin/accept-invite: invited Employee sets their password (public)
      (dashboard)/        Protected admin routes: layout (requireStaff + header) and /admin page
        employees/        /admin/employees (Owner only): page, client forms, Server Functions
  lib/
    auth/
      roles.ts    Admin authorization rules (role parsing, protected paths, role lookup, messages)
      staff.ts    Server-only data access layer: getAdminAccess(), requireStaff()
      invite.ts   Invitation acceptance rules (token/password validation, acceptInvitation)
    employees/
      management.ts        Owner-only list/invite/remove rules (authorizeOwner first)
      supabase-directory.ts  Privileged Auth Admin API + user_roles operations
      directory.ts         Server-only: opens the directory with the secret-key client
    supabase/
      env.ts      Reads/validates the public Supabase env vars
      client.ts   Supabase client for Client Components (browser)
      server.ts   Supabase client for Server Components, Server Functions, Route Handlers (server-only)
      admin.ts    Privileged secret-key client, server-only, employee management only
      proxy.ts    Session refresh + redirect helpers used by the proxy
  proxy.ts        Next.js proxy (formerly middleware): refreshes the session, guards /admin/*
tests/
  auth-roles.test.ts           Unit tests for src/lib/auth/roles.ts (npm test)
  employee-management.test.ts  Owner gate, invite/remove rules, partial failures, adapter
  accept-invite.test.ts        Invitation acceptance rules
supabase/
  config.toml   Supabase CLI configuration (local stack, seed paths; public sign-up disabled; invite template)
  migrations/   Database schema migrations, applied in filename order
  seed.sql      Local development data (loaded by `supabase db reset` only)
  templates/invite.html  Invitation email (links to /admin/accept-invite); copy into the hosted Dashboard
scripts/
  check-supabase.mjs  Read-only connectivity check against the Supabase Auth health endpoint
  bootstrap-owner.sql One-time manual SQL to assign the initial Owner (run in the SQL Editor)
```

Use `@/lib/supabase/server` in server code and `@/lib/supabase/client` in Client
Components. Importing the server client into a Client Component is a build error.
The proxy refreshes sessions on every request and guards `/admin/*` (see
[Admin authentication](#admin-authentication)).

Path alias `@/*` maps to `src/*`.
