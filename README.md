# Plant Pharmacy Website

Informational website for a pharmacy specializing in plant-based products, with an
employee-only administrative panel. The site is strictly informational: there is no
ordering, cart, checkout, payment, shipping, or customer account functionality.

See [PROJECT.md](PROJECT.md) for the full specification and milestone plan.

## Current state

Milestones 1–4 (Project Foundation, Supabase Foundation, Database Schema, Database
Security / RLS) are complete. The application is a minimal placeholder page wired to
Supabase: browser and server clients and session-refreshing proxy exist, and the
`products`, `events` and `user_roles` tables with Row Level Security are defined as
migrations (not yet applied to the hosted project; see
[Deploying the database](#deploying-the-database)). Authentication UI, features, and
design have not been implemented yet.

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
side (roles and RLS) is implemented; login and employee management come in Milestones 5
and 6.

## Technology foundation

- [Next.js](https://nextjs.org) 16 (App Router, `src/` directory)
- React 19
- TypeScript 5 (strict mode)
- ESLint 9 (flat config with `eslint-config-next` core-web-vitals and TypeScript rules)
- [Supabase](https://supabase.com) via `@supabase/ssr` and `@supabase/supabase-js`
- npm

## Prerequisites

- Node.js 20.9 or later (current LTS recommended)
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
On the hosted project, disable it in the Dashboard: Authentication → Sign In / Providers →
turn off "Allow new users to sign up". Invitations (Dashboard or the server-side Admin API)
still work with sign-up disabled.

### Deploying the database

The hosted project has none of the migrations yet. Apply them together, never just the
first one (the Milestone 3 tables have no RLS on their own):

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

1. Dashboard → Authentication → Users → **Invite user** with the Owner's email. The
   Owner accepts the invitation and sets their own password.
2. Dashboard → SQL Editor: paste [scripts/bootstrap-owner.sql](scripts/bootstrap-owner.sql),
   replace `REPLACE_WITH_OWNER_EMAIL` with the Owner's email **in the editor only** (never
   commit it), and run it.

The script refuses to run with the placeholder, fails if no Auth user has that email, and
fails if an Owner already exists. Transferring ownership later is a manual SQL operation
(delete or demote the current owner row, then insert the new one in the same
transaction).

## Project structure

```
src/
  app/
    layout.tsx    Root layout
    page.tsx      Home page (placeholder)
    globals.css   Global styles
    favicon.ico
  lib/
    supabase/
      env.ts      Reads/validates the public Supabase env vars
      client.ts   Supabase client for Client Components (browser)
      server.ts   Supabase client for Server Components, Server Functions, Route Handlers (server-only)
      proxy.ts    Session refresh helper used by the proxy
  proxy.ts        Next.js proxy (formerly middleware): refreshes the Supabase session cookie
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
The proxy only refreshes sessions; it does not protect any routes yet.

Path alias `@/*` maps to `src/*`.
