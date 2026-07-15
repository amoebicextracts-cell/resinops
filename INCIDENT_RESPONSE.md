# ResinOps private-beta incident response

During the private beta, the founder is the incident owner and technical responder until these roles are assigned to named people. Every tester receives one support channel and is asked to include the on-screen request reference, approximate time, facility, and action attempted. Testers must never send passwords, API keys, or regulated customer data through support chat.

## Severity levels

| Severity | Examples | Initial response target | Required action |
| --- | --- | --- | --- |
| SEV-1 | Cross-facility data exposure, credential exposure, destructive data loss, unsafe METRC write | 15 minutes | Disable affected function, preserve evidence, notify affected testers promptly, and begin an incident timeline. |
| SEV-2 | Sign-in unavailable, facility-wide outage, repeated `5xx`, imports corrupting records | 1 hour | Stop the affected workflow, assess rollback, notify impacted operators, and provide updates until stable. |
| SEV-3 | Degraded feature, isolated `429`, incorrect non-destructive calculation, recoverable UI failure | 1 business day | Record request IDs, create a tracked fix, and give the reporter a workaround when available. |
| SEV-4 | Cosmetic issue, documentation gap, enhancement request | 3 business days | Add it to weekly beta triage. |

## Response sequence

1. Acknowledge the report and assign severity.
2. Record UTC and local timestamps, request IDs, deployment version, facility, affected workflow, and who is responding.
3. Contain the issue. Disable writes or integrations before attempting risky repairs.
4. Check Vercel runtime logs, GitHub workflow status, Supabase logs/advisors, and the public health endpoint.
5. Roll back or forward-fix using `ROLLBACK.md`.
6. Verify with the reporter without exposing another facility's data.
7. Close with impact, root cause, remediation, prevention, and any reconciliation steps.

## Customer notification

- For suspected cross-tenant or credential exposure, notify affected beta operators as soon as the known facts are sufficient to be useful; do not wait for a full root-cause analysis.
- State what happened, what data or workflow may be affected, containment completed, actions the operator should take, and when the next update will arrive.
- Do not speculate. Clearly distinguish confirmed facts from investigation hypotheses.
- Preserve the final notification and incident timeline in the auditable incident log adopted before general availability.

## Weekly review

Review incidents, near misses, support requests, and workflow feedback once per week. Group feedback by operational workflow and severity rather than by feature popularity alone.
