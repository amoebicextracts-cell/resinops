# SOP: Software change management

**Applies to:** every change to `supabase/migrations/`, `api/`, and `src/`
in the ResinOps production application.
**Owner:** Alex (sole engineer as of this writing — see
[business-continuity-plan.md](./business-continuity-plan.md) for the
single-person bus-factor this implies).

This documents the change process ResinOps already follows in practice
— it was written by observing and formalizing real recent changes
(the EU-GMP Annex 11 compliance work merged as PRs #61–#70), not
invented as an aspirational ideal. Annex 11 §10 (Change and
Configuration Management) expects changes to a GMP-relevant system to
be assessed, authorized, and recorded before going live; this SOP is
that record for how ResinOps meets it.

## 1. Every change starts as a branch and, for schema changes, a migration file

- One git branch per change, named for what it does
  (`enforce-batch-release-gating`, not `fix-1`).
- Any schema, RLS policy, trigger, or function change is a new
  timestamped file under `supabase/migrations/`, named
  `YYYYMMDDHHMMSS_description.sql` — never edited in place after it's
  been applied to production. If a later change needs to correct an
  earlier migration's mistake, that's a *new* migration, not an edit to
  the old one; the migration history is an append-only record of what
  actually happened to the schema over time.
- Every migration file opens with a comment explaining **why** the
  change exists (which gap it closes, what it's scoped to, what it
  deliberately does *not* do) — not just what the SQL does. The SQL
  itself already says what; a future reader (including a future Alex)
  needs the why to judge whether the change still makes sense months
  later.

## 2. Schema changes are reviewed against production's real shape before being written

Before writing a migration that touches an existing table, its actual
column names and types are confirmed directly — either by reading the
migration that created it, or, for tables that predate the migration
history (several core tables were adopted from an existing hosted
schema rather than created by a migration in this repo), by querying
`information_schema.columns` directly against production. Guessing a
column name or type and letting a migration fail in the SQL editor is
an avoidable, self-inflicted risk when the real schema is one read-only
query away.

## 3. Automated checks run on every pull request

- `.github/workflows/ci.yml` (`test-and-build`): `npm test` and
  `npm run build` — catches JS-level breakage on every PR and on every
  push to `master`.
- `.github/workflows/database-tests.yml` (`migration-and-rls`), for any
  PR touching `supabase/`: applies every migration in order to a
  disposable local Supabase instance seeded from
  `supabase/ci/production_schema.sql` (a fixture standing in for
  production's real shape), then runs the pgTAP suites
  (`facility_rls.sql`, `security_invariants.sql`, `scope_permissions.sql`)
  against it — proving tenant isolation and access-control invariants
  hold with the new change applied, without ever touching production.
- Branch protection on `master` requires these to pass before merge is
  even offered as an option.

## 4. Production schema changes are applied manually, deliberately, one at a time

CI proves a migration is *safe to apply*; it does not apply it.
Production schema changes go through the Supabase SQL editor by hand:

1. The migration's full text is reviewed one more time immediately
   before running it.
2. It's pasted into the SQL editor and run against production.
3. Supabase's own "potential issue detected" confirmation (triggered by
   any destructive-looking statement — `DROP`, `REVOKE`, etc.) is a
   second, independent checkpoint, not treated as a rubber-stamp step.
4. The result (`Success. No rows returned` or the actual query output)
   is checked before moving on — a hung request or a silent partial
   failure is not assumed away.

This is intentionally not automated. A migration that's about to
permanently change a live GMP-relevant production database is exactly
the kind of action this project's own safety posture (see the
assistant-level "risky action" guidance this whole engineering effort
was carried out under) treats as warranting a human in the loop every
time, not a CI pipeline with merge-and-forget semantics.

## 5. Every change is verified against live behavior before merge, not just against CI green

CI proves the change doesn't break existing invariants. It does not
prove the *new* behavior works. Before merging, the actual new behavior
is exercised for real — on a Vercel preview deployment tied to the PR's
branch when the change has a UI surface, or via a self-contained,
fully-cleaned-up throwaway-data script run directly against production
when it doesn't (the pattern used for `enforce_batch_release_on_sale`:
insert disposable test rows, prove the trigger blocks a bad case and
allows a good one, then delete every row the script created).

Preview-deployment verification has a known limitation worth naming
here rather than rediscovering each time: preview branch alias URLs
(`*-git-<branch>-*.vercel.app`) don't satisfy this project's
origin-allowlist check inside serverless functions (`api/_request-security.js`'s
`isOriginAllowed`, which checks against `VERCEL_URL` — the deployment's
unique hash URL, not the stable branch alias). Any endpoint gated by
that check will reject requests from a preview branch's alias domain.
When that's the blocker, fall back to the throwaway-data-script pattern
against production instead of forcing a UI reproduction.

## 6. Pull requests carry their own audit trail

Every PR description states what changed, why, and an explicit test
plan — including what was *not* verified and why (e.g., "METRC has no
configured credentials in any environment, so this cannot be exercised
live today"). An honest "not yet verified, here's why" is worth more
than a checklist that implies more confidence than actually exists.

## 7. Merges are squashed, branches are deleted

One squash commit per PR keeps `master`'s history readable as a
sequence of real changes rather than a sequence of commit-message
noise. The feature branch is deleted on merge — there is no long-lived
parallel branch to fall out of sync with `master`.

## Known gaps, not yet closed

- **No second reviewer.** Every PR in this process is authored and
  merged by the same person. CI is the only independent check; there is
  no human code review by anyone other than the author. This is the
  same single-person bus-factor named in the business continuity plan,
  applied to change review specifically.
- **No formal change-approval log distinct from git/PR history.** Git
  and GitHub PRs *are* the record today — section 6 above describes
  what that record actually contains — but there's no separate sign-off
  register an auditor might expect as a distinct artifact. Whether one's
  needed depends on the self-attestation-vs-third-party-audit decision
  that's still open.
