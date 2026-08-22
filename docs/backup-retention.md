# Production backup, retention, and restore verification

This documents ResinOps' production database backup posture — written as
part of closing the "no documented retention policy" gap flagged when
scoping the app against EU GMP Annex 11 §17 (storage, backup, archival,
and retrieval of GMP-relevant records).

## What's backed up

The full production Postgres database (project `rcrkofzkbxfjzckyuqwy`),
via `pg_dump --format=custom` against the Supabase session pooler
connection. Custom format, not plain SQL, because it's what `pg_restore`
needs for selective/parallel restore and what the verification step
below already expects.

## Where it lives, and for how long

- **Daily**: `.github/workflows/scheduled-backup.yml` runs on a 9am UTC
  cron (`scripts/backup-production.mjs`), producing a `.dump` file and a
  JSON manifest (byte count, SHA-256, and row counts across six core
  tables — `facilities`, `facility_members`, `profiles`,
  `inventory_items`, `production_batches`, `audit_logs` — captured live
  from production at backup time).
- **Short-term**: both files are uploaded as a GitHub Actions artifact,
  retained 30 days. This is scratch space for the same-run restore
  verification below, not the real retention mechanism — GitHub Actions
  artifacts cap out at 90 days, nowhere near a defensible GMP
  record-retention window.
- **Long-term**: after (and only after) the restore-verify job below
  proves the day's backup actually restores cleanly, it's uploaded to
  Google Cloud Storage: bucket `resinops-production-backups-able-armor`,
  EU multi-region (`eu`), Coldline storage class, **7-year bucket
  retention policy**. The retention policy is currently *unlocked* —
  reducible or removable by a project owner if the retention window
  needs to change — not a permanent WORM lock. Locking it is a
  deliberate future decision, not an oversight; it forecloses ever
  shortening retention, even by mistake, so it's worth doing once the
  window is confirmed rather than by default.
- Public access to the bucket is prevented at the bucket level (not an
  ACL that could be individually overridden).

## Why only verified backups get promoted

A corrupted or incomplete dump that nobody ever tried to restore is
worse than no backup — it's false confidence. `restore-verify` runs
immediately after each backup, in the same workflow run, restoring into
a disposable Postgres 17 container and cross-checking SHA-256, byte
count, and the manifest's row counts before anything reaches long-term
storage. Only a backup that passed that check is written to the 7-year
bucket.

## Authentication: Workload Identity Federation, not a stored key

The GitHub Actions job that uploads to GCS authenticates via [Workload
Identity Federation][wif], not a downloaded service-account JSON key:

- Workload Identity Pool: `github-actions-pool`
  (`projects/988248465661/locations/global/workloadIdentityPools/github-actions-pool`)
- Provider: `github-actions`, an OIDC provider trusting
  `https://token.actions.githubusercontent.com`, with an attribute
  condition restricting it to `assertion.repository ==
  'amoebicextracts-cell/resinops'` — no other GitHub repo can obtain
  credentials through this pool, even if pool metadata leaked.
- Service account: `resinops-backup-uploader@able-armor-504314-n3.iam.gserviceaccount.com`,
  granted `roles/storage.objectCreator` on the backup bucket only (no
  read, delete, or replace permission) and `roles/iam.workloadIdentityUser`
  scoped to that specific repo's federated identity.

Nothing sensitive is stored in GitHub secrets for this — the provider
path and service account email aren't secrets (WIF's security boundary
is GCP validating the OIDC token's claims, not keeping these identifiers
private), and there's no static credential to leak, rotate, or expire.

[wif]: https://cloud.google.com/iam/docs/workload-identity-federation

## Retrieving a backup

1. `gcloud storage ls gs://resinops-production-backups-able-armor/` to
   find the run's folder (named by GitHub Actions run ID).
2. Download the `.dump` and matching `.json` manifest.
3. Run `scripts/verify-backup-restore.ps1 -BackupPath <file>.dump` to
   restore it into a disposable local Postgres container and confirm
   its checksum/row counts still match the manifest before trusting it
   for a real restore.

## Known gaps, not yet closed

- The GCS bucket's retention policy is unlocked (see above).
- No documented RTO/RPO target exists yet for a real disaster-recovery
  scenario — this covers backup/restore mechanics, not a full
  continuity plan.
- This project (`able-armor-504314-n3`, "My First Project") sits under
  a personal Google account rather than a dedicated ResinOps GCP
  organization — worth revisiting if/when ResinOps needs its own
  billing and access boundary independent of any one person's account.
