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

Run `supabase test db` against the preview environment to execute the tenant-isolation checks in `tests/facility_rls.sql`.

This is an adoption migration, not a complete schema baseline. Capturing a reproducible baseline and adding database-level integration tests are required before general availability.

Also enable leaked-password protection in the Supabase Auth dashboard before inviting beta customers.
