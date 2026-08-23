# Business continuity plan — production database and application

Written to close the "no documented RTO/RPO target" gap flagged in
[`docs/backup-retention.md`](./backup-retention.md) and in the EU GMP
Annex 11 §16 traceability line (Business Continuity). That document
covers backup/restore *mechanics*; this one covers what happens around
them — recovery targets, failure scenarios, and who does what — for a
disaster affecting ResinOps' production system.

This is a one-person-engineering-team plan. It says so explicitly rather
than pretending otherwise, because a continuity plan that assumes a team
that doesn't exist yet is worse than an honest one — a real incident is
the wrong time to discover the plan was written for staffing you don't
have.

## Scope

Covers `app.resinops.com` (Vercel-hosted frontend + serverless
functions) and its Supabase project (`rcrkofzkbxfjzckyuqwy`) — Postgres,
Auth, and Storage. Does not cover a customer's own METRC account, their
own devices, or their physical facility — those are the customer's own
continuity concerns.

## Recovery targets

**RPO (Recovery Point Objective) — up to 24 hours, with two independent
backup mechanisms landing on the same worst case:**

- Supabase's own built-in daily physical backups (Pro plan), confirmed
  live in the dashboard — one per day, ~7–8 days retained on the
  platform itself. Restorable directly from the Supabase dashboard
  without touching any ResinOps-authored script.
- ResinOps' own custom pipeline (`scripts/backup-production.mjs`,
  documented in `backup-retention.md`) — also daily, restore-verified in
  CI before promotion to 7-year Google Cloud Storage retention.

Both run once a day, so the honest worst case is that an incident
happens right before the next backup: **up to ~24 hours of data loss**,
not the few minutes a continuously-shipped WAL-based system would give.
**Point-in-Time Recovery (PITR) is available on this Supabase project as
a paid add-on and is not currently enabled** — turning it on is the
single highest-leverage change available to tighten RPO, likely to
single-digit minutes, and is the natural next step once real customer
data volume justifies the cost. Recommended before onboarding a real
paying facility, not required before that.

**RTO (Recovery Time Objective) — estimated 2–4 hours for a full
database restore, untested end-to-end against production scale:**

`scripts/verify-backup-restore.ps1` proves a backup restores cleanly
into a disposable local container every day in CI, and that process
typically completes in a few minutes against current data volume — but
that is restoring into a throwaway container to prove the *backup* is
good, not a rehearsal of standing up a *replacement production
database* Supabase would actually serve traffic from. The 2–4 hour
estimate covers: provisioning a new Supabase project or using Supabase's
own dashboard restore, running `pg_restore` against it, re-pointing
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
in Vercel, and smoke-testing before calling it live. This has not been
rehearsed as a full drill. Doing that drill once — deliberately, on a
disposable Supabase project, not production — would turn this estimate
into a verified number and is the other clear next step.

## Failure scenarios and response

### 1. Accidental data deletion or corruption (application bug, bad migration, human error)

- Fastest path: Supabase dashboard → Database → Backups → Scheduled
  backups → Restore. This is Supabase's own point-and-click restore of
  their daily physical backup, no script required.
- If the incident is caught within a few hours and only affects specific
  rows/tables (not a full corruption), prefer a targeted fix over a full
  restore — a full restore rolls back *everything* to the last backup,
  including unrelated legitimate changes made since. Check `audit_logs`
  first (every write across ~30 tenant tables has a before/after
  snapshot) to see whether a scoped fix is possible before reaching for
  a full restore.
- If a full restore is genuinely needed, `scripts/verify-backup-restore.ps1`
  plus the GCS-retained `.dump`/manifest pair (see `backup-retention.md`
  for retrieval steps) is the documented, tested path.

### 2. Supabase project loss or extended platform outage

- Check [Supabase's own status page](https://status.supabase.com) first
  — most "the app is down" incidents are a transient platform issue,
  not something a restore fixes.
- If Supabase itself is unrecoverable (not just slow/degraded): the
  7-year GCS-retained backups are the actual disaster-recovery copy,
  independent of Supabase's own infrastructure. Restoring means standing
  up a **new** Supabase project, `pg_restore`-ing the latest verified
  `.dump` into it, and re-pointing every `VITE_SUPABASE_*`/
  `SUPABASE_SERVICE_ROLE_KEY` env var in Vercel (production and any
  preview branches that need it) at the new project's URL/keys. This is
  the RTO-driving scenario above, and the one that most needs a real
  rehearsal.
- Row-level security policies, triggers, functions, and storage bucket
  configuration are **not** captured by the data-only `pg_dump` backup —
  they live in `supabase/migrations/`. A from-scratch restore must
  replay every migration file, in order, before the data restore, or
  the new project will have data with none of its access controls.
  (`supabase/README.md`'s CI job already replays the full migration set
  against a disposable database on every PR — that's the proof this
  replay path works, just not yet rehearsed against a truly empty new
  project standing in for a real disaster.)

### 3. Vercel outage or bad deploy

- Vercel deploys are immutable and instantly reversible — redeploy the
  last known-good deployment from the Vercel dashboard. No database
  involvement at all for a pure frontend/function-code incident.
- If a bad deploy shipped a migration that already ran against
  production (schema change, not just code), the code rollback alone
  won't undo the schema — the specific migration's `down`-equivalent
  (a new corrective migration, since this project doesn't use
  auto-generated down-migrations) has to be written and applied.

### 4. Compromised credentials (Supabase service role key, GCS backup credentials, METRC keys once those exist)

- Rotate the specific credential first (Supabase service role key from
  the Supabase dashboard, Vercel env var updated immediately after).
- The GCS backup pipeline authenticates via Workload Identity
  Federation with no static key to rotate (see `backup-retention.md`) —
  a compromised GitHub Actions token can't be replayed outside the
  narrow window WIF issues it for, which meaningfully limits this
  scenario's blast radius already.
- Check `audit_logs` for activity in the window the credential may have
  been exposed, scoped to whichever facility/table the credential could
  reach.

## Roles and communication

- **Alex** is currently the only person who can execute any of the
  above — there is no on-call rotation because there is no second
  engineer yet. This plan's honesty about that is itself the mitigation
  available right now: know the single point of failure explicitly
  rather than assume redundancy that doesn't exist.
- **Customer communication**: no formal incident-communication template
  exists yet. For a real outage affecting a paying customer's access to
  their own data, at minimum: acknowledge the issue is known, give a
  realistic timeframe once the failure scenario above is identified, and
  confirm data integrity (via `audit_logs`/backup verification) before
  declaring resolution — don't declare "fixed" before confirming no
  silent data loss occurred.

## Known gaps, not yet closed

- **RTO is an estimate, not a rehearsed number.** A real restore-to-new-project
  drill has never been run. This is the single most valuable thing to
  do before treating this plan as load-bearing for a real customer.
- **PITR is not enabled**, so RPO is bounded by daily backups rather than
  continuous replication.
- **No incident-communication template or SLA exists.** Not written
  because no real paying customer depends on uptime commitments yet —
  worth building before that changes, not after.
- **Single-person operational bus factor.** Documented here as a known,
  accepted risk at current company size, not solved by this plan.
