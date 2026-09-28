# Plant Pharmacy Website

Informational website for a pharmacy specializing in plant-based products, with an
employee-only administrative panel. The site is strictly informational: there is no
ordering, cart, checkout, payment, shipping, or customer account functionality.

See [PROJECT.md](PROJECT.md) for the full specification and milestone plan.

## Current state

Milestones 1 (Project Foundation) and 2 (Supabase Foundation) are complete. The
application is a minimal placeholder page wired to Supabase: browser and server clients
and session-refreshing proxy exist, but no database tables, authentication UI, features,
or design have been implemented yet.

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
scripts/
  check-supabase.mjs  Read-only connectivity check against the Supabase Auth health endpoint
```

Use `@/lib/supabase/server` in server code and `@/lib/supabase/client` in Client
Components. Importing the server client into a Client Component is a build error.
The proxy only refreshes sessions; it does not protect any routes yet.

Path alias `@/*` maps to `src/*`.
