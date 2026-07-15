# Supabase launch foundation

The migrations in `migrations/` adopt the hosted ResinOps schema and harden it for private-beta use. The facility-access migration was applied to production on July 15, 2026 after its local pgTAP suite passed. A locked pre-migration snapshot remains in the production database under `resinops_backup_20260715`.

It replaces permissive tenant policies with facility-scoped roles, removes browser-readable integration credential columns, protects the last facility owner, and adds immutable facility audit history.

## Production status and continued validation

1. Keep every schema change in a timestamped migration and run the disposable database job before merging.
2. Run the production smoke workflow after deployment. With its optional GitHub secrets configured, it verifies anonymous denial, the dedicated smoke user's own-facility access, cross-facility denial, and audit-log readability.
3. Run Supabase security and performance advisors after every production migration.
4. Keep `METRC_WRITES_ENABLED` and METRC credentials unset until vendor onboarding is complete.
5. Create and verify an off-site database dump before importing private-beta customer data.

Every pull request that changes `supabase/` now runs an isolated database job. The job starts a disposable local Supabase database, adds the production-shaped fixture from `ci/production_schema.sql`, applies the real adoption migration, and runs the pgTAP tenant-isolation and security-invariant suites. The fixture exists only in the CI runner and is never part of a hosted deployment.

Run `supabase test db` against a preview environment to execute the same checks manually. Supabase-hosted preview branches require the Pro plan; until that upgrade, GitHub Actions provides the no-production-impact validation gate.

The adoption migration is not a complete schema baseline. Capturing a reproducible baseline and performing a full restore drill are required before general availability.

Leaked-password protection is unavailable on the current Supabase Free plan. Keep that advisor warning documented for the closed beta and enable the control immediately after upgrading to Pro.
