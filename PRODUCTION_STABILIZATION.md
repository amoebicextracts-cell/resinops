# ResinOps production stabilization runbook

## Off-site database backup

Use the session-pooler host and database user shown under **Supabase Dashboard → Connect**. The script prompts for the database password without echoing it, keeps the password out of command-line arguments, creates a compressed custom-format dump, verifies that `pg_restore` can read its catalog, and writes a SHA-256 manifest beside it.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\backup-production-supabase.ps1" `
  -HostName "YOUR_SESSION_POOLER_HOST" `
  -User "postgres.rcrkofzkbxfjzckyuqwy"
```

Copy both the `.dump` and `.json` files from `Documents\ResinOps Backups` to a separate encrypted location. A backup is not considered complete until it has been restored into a disposable database and the core row counts have been compared.

Verify a backup without touching production:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\verify-backup-restore.ps1" `
  -BackupPath "C:\path\to\resinops-project-date.dump"
```

The verifier confirms the manifest size and SHA-256, restores the archive into a temporary PostgreSQL 17 container, verifies core ResinOps tables, compares recorded row counts when present, and deletes the container. Supabase-managed Vault internals are intentionally excluded because the stock PostgreSQL portability target does not include the hosted Vault extension. The July 15, 2026 production archive completed this disposable restore drill successfully.

## Scheduled production smoke test

The GitHub workflow always validates the public health endpoint. Configure these repository secrets to add read-only RLS checks:

- `PRODUCTION_SUPABASE_URL`
- `PRODUCTION_SUPABASE_ANON_KEY`
- `PRODUCTION_SMOKE_USER_EMAIL`
- `PRODUCTION_SMOKE_USER_PASSWORD`
- `PRODUCTION_SMOKE_FACILITY_ID`
- `PRODUCTION_SMOKE_FORBIDDEN_FACILITY_ID`

The smoke user should be a viewer in a dedicated non-customer facility. The forbidden facility should also contain no customer data. The workflow never creates, updates, or deletes production rows.

After creating those two non-customer facilities and the viewer account, configure all six secrets without exposing them in command history:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\configure-production-smoke.ps1"
```

The helper validates both facility UUIDs, streams values to GitHub CLI over standard input, and starts the smoke workflow. The health check uses the canonical `https://app.resinops.com` origin.

## Supabase Auth setting

The production dashboard currently labels leaked-password protection as available only on Supabase Pro and above, so it cannot be enabled on the Free plan. Keep the advisor warning documented during the closed beta. Immediately after a plan upgrade, open **Authentication → Sign In / Providers → Email**, enable **Prevent use of leaked passwords**, save, and confirm the security advisor no longer reports `auth_leaked_password_protection`.

## Rollback evidence

The internal pre-migration snapshot is in the locked `resinops_backup_20260715` schema. Do not delete it until an off-site backup and disposable restore drill have both succeeded. Database rollbacks should be performed from a reviewed migration or verified dump, never by manually editing production policies in the dashboard.
