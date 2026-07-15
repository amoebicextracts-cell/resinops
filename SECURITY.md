# Hosted API security

The AI and METRC serverless endpoints require a valid Supabase access token. METRC requests also require the signed-in user to be a member of the selected facility, and the requested license must exactly match that facility's `license_number`.

## Server configuration

Set these only in the deployment environment:

- `ANTHROPIC_API_KEY` enables hosted AI requests.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` validate access tokens and apply the user's Row Level Security policies. The server can fall back to the corresponding `VITE_` values, but dedicated server variables are preferred.
- `ALLOWED_ORIGINS` optionally adds comma-separated origins for staging environments. ResinOps production and local Vite origins are allowed by default.
- `METRC_SOFTWARE_KEY` and `METRC_USER_KEY` enable a single-license METRC deployment. For multiple licenses, prefer `METRC_USER_KEY_<SANITIZED_LICENSE>`.
- `METRC_WRITES_ENABLED=true` explicitly enables non-GET METRC operations. Writes are denied by default.

METRC credentials are not required while vendor access is pending. Leave them unset and keep `METRC_WRITES_ENABLED` unset; the API returns a controlled `503` response instead of attempting a call.

Integration credentials must never be collected by the browser or stored in facility rows. Configure approved private-beta integrations only as server-side deployment secrets.

## Facility access

The launch-foundation migration defines five roles: `owner`, `admin`, `manager`, `member`, and `viewer`. Owners and admins manage facility settings and memberships; managers and members may change operational records; viewers are read-only. Destructive operational actions require an owner or admin. Every accepted facility member may read that facility's audit history, but browser clients cannot alter it.

Do not apply the adoption migration directly to production. Validate it on a Supabase preview branch using two separate facilities, then run the security and performance advisors before rollout.

The in-process request limiter is defense in depth for a warm serverless instance. Before high-volume or multi-tenant production use, replace it with a shared durable limiter and alert on repeated `401`, `403`, and `429` responses.

Every hosted API response includes an `X-Request-ID`. User-facing API failures include that reference so an operator can report it without sharing request bodies or credentials. `/api/health` is a public liveness endpoint and intentionally reports no dependency configuration or secret status.
