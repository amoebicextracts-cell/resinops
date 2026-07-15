# Supabase launch foundation

The migration in `migrations/` adopts the current hosted ResinOps schema and hardens it for private-beta use. It has **not** been applied to production.

It replaces permissive tenant policies with facility-scoped roles, removes browser-readable integration credential columns, protects the last facility owner, and adds immutable facility audit history.

## Safe rollout

1. Merge the AI and METRC endpoint hardening PR first.
2. Create a Supabase preview branch from the current production database.
3. Apply this migration to the preview branch only.
4. Test two separate facilities and confirm neither account can read, create, update, or delete the other's records.
5. Confirm owner/admin, manager/member, and viewer behavior against the role matrix.
6. Run Supabase security and performance advisors and resolve any new findings.
7. Deploy the compatible application release, back up production, schedule a maintenance window, and apply only after preview sign-off.

Every pull request that changes `supabase/` now runs an isolated database job. The job starts a disposable local Supabase database, adds the production-shaped fixture from `ci/production_schema.sql`, applies the real adoption migration, and runs the pgTAP tenant-isolation and security-invariant suites. The fixture exists only in the CI runner and is never part of a hosted deployment.

Run `supabase test db` against a preview environment to execute the same checks manually. Supabase-hosted preview branches require the Pro plan; until that upgrade, GitHub Actions provides the no-production-impact validation gate.

This is an adoption migration, not a complete schema baseline. Capturing a reproducible baseline and adding database-level integration tests are required before general availability.

Also enable leaked-password protection in the Supabase Auth dashboard before inviting beta customers.
