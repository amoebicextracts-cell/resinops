# ResinOps private-beta launch checklist

This checklist separates the private beta from general availability. An LLC, EIN, DUNS number, App Store listing, and METRC vendor credentials are **not** prerequisites for the private web beta.

## Code and data gates

- [x] Hosted AI and METRC endpoints require authenticated sessions.
- [x] METRC writes are disabled unless explicitly enabled server-side.
- [x] AI output is rendered as inert React content rather than executable HTML.
- [x] Facility roles and strict tenant isolation are defined in a reviewable migration.
- [x] Browser-readable integration credential fields are removed by the migration.
- [x] Facility changes produce immutable audit history.
- [x] CI runs application tests and a production build on every pull request.
- [x] API responses include request references and defensive headers.
- [x] `/api/health` provides a credential-free liveness check.
- [ ] Apply the facility migration to a Supabase preview branch and run the database tests.
- [ ] Verify two-facility isolation manually with owner, manager, member, and viewer accounts.
- [ ] Run Supabase security and performance advisors after the preview migration.
- [ ] Verify the complete backup and restore procedure with non-production data.

## Deployment gates

- [ ] Merge the endpoint-hardening PR.
- [ ] Merge the launch-foundation PR after preview database sign-off.
- [ ] Configure production-only Supabase and AI environment variables in Vercel.
- [ ] Keep all METRC credentials and `METRC_WRITES_ENABLED` unset.
- [ ] Confirm `app.resinops.com` is the only production application origin.
- [ ] Monitor `/api/health` and alert on repeated `401`, `403`, `429`, and `5xx` responses.
- [ ] Document rollback steps for both the web deployment and database migration.

## Beta operations

- [ ] Start with 1–3 invited facilities and named operator contacts.
- [ ] Require operators to export a backup before their first production-data import.
- [ ] Give testers one support channel and ask them to include the displayed request reference.
- [ ] Define incident severity, response ownership, and customer-notification rules.
- [ ] Publish plain-language privacy, acceptable-use, and beta data-retention terms.
- [ ] Review AI advice disclaimers for safety-critical extraction, pesticide, facility, and compliance workflows.
- [ ] Collect weekly feedback by workflow, not only by feature request.

## General-availability gates

- [ ] Form the business entity and obtain the tax/vendor identifiers required by chosen distribution channels.
- [ ] Complete METRC vendor onboarding before enabling any METRC connection.
- [ ] Replace the in-memory API limiter with a shared durable limiter.
- [ ] Add centralized error monitoring and an auditable incident log.
- [ ] Establish tested recovery objectives, automated backups, and a disaster-recovery exercise.
- [ ] Complete legal review for customer agreements, privacy obligations, and cannabis compliance claims.
