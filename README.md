# Corebridge X

Internal Project Management / PSA (Professional Services Automation) web app for Croki Digital. Tracks client work through **Project → Service → Activity → Task → Checklist**, with role-based visibility for Admin / Team Lead / Employee.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase (Postgres + Auth)

## Documentation

**Start at [`docs/README.md`](docs/README.md)** — the full documentation index, including domain model, authorization rules, architecture, database/migrations, development setup, testing strategy, deployment state, a decision log, and a full developer handover.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in real values; never commit this file
npm run dev
```

With `NEXT_PUBLIC_DATA_PROVIDER` unset (or `mock`), the app runs entirely against in-memory seeded data with no-password quick-login buttons per role — the fastest way to explore it. See [`docs/development.md`](docs/development.md) for every provider mode and [`docs/data-and-supabase.md`](docs/data-and-supabase.md) for what each environment variable does.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run a production build |
| `npm run lint` | ESLint |

## Current deployment status

**Frontend production hosting is not configured** — no CI/CD, no connected hosting provider. Hosted Supabase (the database/auth backend) is real and live. See [`docs/deployment.md`](docs/deployment.md) for the full audit before assuming anything is publicly reachable.
