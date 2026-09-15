# Development Setup

## Prerequisites

- Node.js (a version compatible with Next.js 16 / React 19)
- npm (the repo ships a standard `package.json`; no other package manager is configured)

## Install

```bash
npm install
```

## Environment

```bash
cp .env.example .env.local
```

Then fill in real values in `.env.local` (gitignored — never commit it). See `data-and-supabase.md` for what each variable is and when it's required. The simplest way to start with zero setup is to leave `NEXT_PUBLIC_DATA_PROVIDER` unset or set to `mock` — the app runs entirely in-memory with seeded fixture data and quick-login buttons (no password) per role.

## Run the dev server

```bash
npm run dev
```

Opens on `http://localhost:3000` by default (`-p <port>` to use another one).

> **Gotcha**: this Next.js version locks the project directory against a second `next dev` instance in the same folder, even on a different port. If you need a second isolated instance (e.g. for QA against a different provider mode while a dev server is already running), copy the working tree elsewhere first — see `testing.md`.

## Build

```bash
npm run build
```

Validate against a specific provider mode by setting the env var inline:

```bash
NEXT_PUBLIC_DATA_PROVIDER=mock npm run build
NEXT_PUBLIC_DATA_PROVIDER=supabase-auth npm run build
NEXT_PUBLIC_DATA_PROVIDER=supabase-core npm run build
NEXT_PUBLIC_DATA_PROVIDER=supabase npm run build
```

All four are expected to pass before any change is considered validated — see `testing.md`.

## Lint / typecheck

```bash
npm run lint          # ESLint
npx tsc --noEmit       # TypeScript, no dedicated script — run directly
```

## Start (production mode, after build)

```bash
npm run start
```

## Package manager / scripts summary

`package.json` defines exactly four scripts: `dev`, `build`, `start`, `lint`. There is no test runner script and no CI configuration in this repo (see `deployment.md`).
