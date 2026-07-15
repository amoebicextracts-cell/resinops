# ResinOps rollback runbook

Use this runbook when a production deployment or database migration causes a confirmed regression. Preserve request IDs, timestamps, and operator reports before changing production.

## Web deployment rollback

1. Confirm the failure on `https://app.resinops.com/api/health` and record the reported version and request ID.
2. In Vercel, identify the last known-good production deployment. Prefer the deployment that previously passed CI and the production smoke workflow.
3. Reassign production to that deployment from the Vercel dashboard, or run `vercel rollback <deployment-url-or-id>` from the linked project.
4. Confirm the health endpoint returns `status: ok` and the expected earlier version.
5. Test sign-in, facility selection, one read-only operational screen, and one authenticated API request.
6. Open a corrective pull request. Do not force-push or rewrite `master` to imitate a rollback.

## Database rollback

Database rollbacks require more care because a web rollback does not reverse schema or data changes.

1. Stop imports and other write-heavy operator activity.
2. Preserve the failing request IDs and take a fresh database backup when the database is reachable.
3. Review the migration and decide whether a forward-fix migration is safer than restoring data. Prefer a forward fix for additive indexes, functions, policies, and compatible columns.
4. Test the corrective migration against the disposable production-shaped database and run all pgTAP tests.
5. Apply the reviewed corrective migration transactionally, verify migration history, and run security and performance advisors.
6. Restore from the verified off-site dump only when a forward fix cannot recover the required state. Restoring is an incident-level action and requires explicit approval from the incident owner.

Never run `supabase db reset --linked` against production. Never delete the locked `resinops_backup_20260715` schema until the private beta has completed a second independent restore drill.

## Completion evidence

- Incident timeline and severity recorded.
- Known-good web version recorded.
- Database migration or restore evidence attached.
- `/api/health` green.
- Production smoke workflow green.
- Affected operators notified of resolution and any required reconciliation.
