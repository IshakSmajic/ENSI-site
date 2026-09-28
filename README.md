# Plant Pharmacy Website

Informational website for a pharmacy specializing in plant-based products, with an
employee-only administrative panel. The site is strictly informational: there is no
ordering, cart, checkout, payment, shipping, or customer account functionality.

See [PROJECT.md](PROJECT.md) for the full specification and milestone plan.

## Current state

Milestone 1 (Project Foundation) is complete. The application is currently a minimal
placeholder page; no features, Supabase integration, or design have been implemented yet.

## Technology foundation

- [Next.js](https://nextjs.org) 16 (App Router, `src/` directory)
- React 19
- TypeScript 5 (strict mode)
- ESLint 9 (flat config with `eslint-config-next` core-web-vitals and TypeScript rules)
- npm

## Prerequisites

- Node.js 20.9 or later (current LTS recommended)
- npm (bundled with Node.js)

## Installation

```bash
npm install
```

## Environment setup

Copy the example file and fill in values as they become required:

```bash
cp .env.example .env.local
```

`.env.local` is ignored by Git and must never be committed. `.env.example` is committed
and must only contain placeholders. Variables prefixed with `NEXT_PUBLIC_` are exposed to
the browser; everything else is server-only.

No environment variables are required at this stage.

## Commands

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Start the development server at http://localhost:3000 |
| `npm run build`     | Create a production build                          |
| `npm run start`     | Serve the production build (run `build` first)     |
| `npm run lint`      | Run ESLint                                         |
| `npm run typecheck` | Generate Next.js route types and run `tsc --noEmit` |

## Project structure

```
src/
  app/
    layout.tsx    Root layout
    page.tsx      Home page (placeholder)
    globals.css   Global styles
    favicon.ico
```

Path alias `@/*` maps to `src/*`.
