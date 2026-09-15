# Deployment

**Status as of this writing: frontend production hosting is NOT configured.** This is a confirmed finding, not an unresolved unknown — see the audit evidence below.

## What's confirmed live today

- **Hosted Supabase** (Postgres + Auth) exists and is real — it has been used, migrated, and verified against directly throughout this project's history. See `data-and-supabase.md` for the migration history and what's confirmed applied.
- **The frontend application** (this Next.js codebase) has only ever run locally (`npm run dev`/`npm run build`+`npm run start`) or been validated via local builds against each provider mode. It has never been deployed to any hosting target.

## Audit evidence (do not re-guess this — it was directly checked)

- No hosting config files anywhere in the repo: no `vercel.json`, `netlify.toml`, `render.yaml`, `railway.*`, `Dockerfile`, `docker-compose*`, `fly.toml`, `Procfile`.
- No `.github/workflows/` directory — zero GitHub Actions of any kind.
- `gh run list` — zero workflow runs, ever.
- `gh api repos/.../deployments` — `[]` (zero GitHub Deployments recorded — this is the API most hosting-provider GitHub-App integrations, including Vercel's, register against automatically; its emptiness is real evidence of "nothing connected," not just "nothing found").
- `gh api repos/.../environments` — zero GitHub Environments configured.
- Zero check-runs and zero commit statuses on either of this project's two merge commits to `main`.
- The root `README.md`'s "Deploy on Vercel" section is unmodified `create-next-app` boilerplate — a generic suggestion baked into the template, not evidence of an actually-connected project. Don't mistake it for infrastructure.

**Conclusion: merging to `main` has never triggered, and currently cannot trigger, any deployment.** Whoever eventually deploys this app will be the first to do so.

## Build commands (already verified to work)

```bash
npm run build     # next build — has been run successfully under all 4 provider modes
npm run start     # next start — standard Next.js production server
```

## Required environment variables for a production deployment

See `data-and-supabase.md`'s table (`NEXT_PUBLIC_DATA_PROVIDER`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). All four are known locally (present in `.env.local`, correctly gitignored) but not provisioned anywhere else, since nowhere else exists yet.

## Deployment readiness by area

| Area | Status | Notes |
|---|---|---|
| Hosting provider | **Not chosen** | No technical requirement forces one — this is a stock Next.js App Router project with zero custom server code, so it's compatible with any standard Next.js-capable host. That's a genuine choice to make, not a default already set. |
| Build | Ready | Passes locally under all 4 provider modes |
| Environment variables | Known, not provisioned | 4 names identified; values exist locally only |
| Supabase connectivity | Ready | Hosted project is real and live |
| Database migrations | Ready | Current `main` requires nothing beyond what's already applied (CD-190 added zero migrations) |
| Auth/domain config | **Unknown** | The hosted Supabase project's actual Auth Site URL/Redirect URLs (configured in the Supabase Dashboard, not this repo) are not verifiable from repo/GitHub evidence — check the Dashboard directly when a domain is chosen |
| CI/CD | Not configured | No workflow exists |
| Rollback mechanism | Not applicable yet | Depends entirely on whichever host is eventually chosen |
| Monitoring/health check | Not configured | None found; use the manual smoke test below until something automated exists |

## When a hosting decision is made — recommended first-deploy sequence

This intentionally stops short of host-specific commands, since none has been chosen. Once it has:

1. Connect the repository to the chosen host, with `main` as the production branch.
2. Provision the four environment variables with real production values.
3. Confirm/update the hosted Supabase project's Auth Site URL and Redirect URLs for the real production domain (Supabase Dashboard — cannot be done from this repo).
4. Trigger the first deploy and watch the build log — it should produce the same route table (`○`/`ƒ` per route) that local builds already produce.
5. Open the resulting URL and run the smoke test below.
6. Only after a clean smoke test pass should the corresponding Jira ticket(s) move past "pending deployment."

## Minimum manual smoke test (until an automated one exists)

- **Admin**: login → Dashboard → Projects → a Service detail page → Tasks → Team Activity (Updates tab, then Time tab).
- **Team Lead**: login → My Day → confirm Team Activity roster shows only direct reports.
- **Employee**: login → My Day → open a Task → log manual time → confirm no Team Activity nav item appears.
- **Local-date regression**: log a Duration-mode manual time entry for today → confirm it appears on My Day's Today card and Team Activity's Time tab for today, and does NOT appear on yesterday (see `troubleshooting.md` for why this specific check exists).
