// ============================================================
// ResinOps — Automated production database backup
// scripts/backup-production.mjs
//
// Runs pg_dump against production via the Supabase session pooler
// connection string (the direct/IPv6 connection string doesn't work from
// GitHub Actions' IPv4-only runners — the same constraint already solved
// for database-tests.yml's local Docker DB, except that one never talks
// to production at all). Invoked on a schedule by
// .github/workflows/scheduled-backup.yml, which also runs
// scripts/verify-backup-restore.ps1 against the result immediately
// afterward — an untested backup is a documentation exercise, not a
// disaster-recovery capability.
//
// Custom format (not plain-text SQL piped through gzip, which is what
// this produced before) for two reasons: it's what pg_restore's
// selective/parallel restore actually needs, and it's what
// verify-backup-restore.ps1 (originally built for the manual
// backup-production-supabase.ps1 + Docker DR drill) already expects, so
// the SAME script verifies the SAME artifact this job produces instead
// of the two staying disconnected. Alongside the dump, this also writes
// a manifest (byte count, SHA-256, and row counts from a handful of
// core tables captured at backup time) in the same shape
// backup-production-supabase.ps1 already writes, so a human running the
// manual DR drill and this scheduled job produce interchangeable
// artifacts.
//
// Every external effect (the dump itself, the row-count query, the
// hash) is injectable so this is unit-testable without a real Postgres
// install or file I/O; the default implementations are what actually
// run in CI.
//
// Usage:
//   PRODUCTION_DB_URL="postgres://...pooler.supabase.com:5432/postgres" \
//     node scripts/backup-production.mjs
// ============================================================

import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export function buildDumpFilename(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `resinops-production-${stamp}.dump`;
}

export function buildManifestFilename(now = new Date()) {
  return buildDumpFilename(now).replace(/\.dump$/, '.json');
}

export function validateEnv(env = process.env) {
  if (!env.PRODUCTION_DB_URL || !env.PRODUCTION_DB_URL.trim()) {
    return 'PRODUCTION_DB_URL is not configured (Supabase session pooler connection string)';
  }
  return null;
}

export function defaultDumpRunner({ connectionString, outputPath }) {
  return new Promise((resolve, reject) => {
    const dump = spawn(
      'pg_dump',
      ['--no-owner', '--no-privileges', '--format=custom', '--compress=6', '--file', outputPath, connectionString],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    dump.on('error', reject);
    dump.on('exit', code => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`pg_dump exited with code ${code}`));
    });
  });
}

// Same six tables backup-production-supabase.ps1's manual DR drill
// captures, and the same tables verify-backup-restore.ps1 already knows
// how to compare a restored count against — kept identical on purpose
// so either backup path's manifest can be verified by the same script.
const ROW_COUNT_SQL = `select json_build_object(
  'facilities', (select count(*) from public.facilities),
  'facility_members', (select count(*) from public.facility_members),
  'profiles', (select count(*) from public.profiles),
  'inventory_items', (select count(*) from public.inventory_items),
  'production_batches', (select count(*) from public.production_batches),
  'audit_logs', (select count(*) from public.audit_logs)
)::text;`;

export async function defaultRowCountRunner({ connectionString }) {
  const { stdout } = await execFileAsync('psql', [
    connectionString,
    '--set', 'ON_ERROR_STOP=1',
    '--tuples-only', '--no-align',
    '--command', ROW_COUNT_SQL,
  ]);
  return JSON.parse(stdout.trim());
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function backupProduction({
  env = process.env,
  now = new Date(),
  outputDir = 'backups',
  dumpRunner = defaultDumpRunner,
  rowCountRunner = defaultRowCountRunner,
  hasher = sha256File,
} = {}) {
  const validationError = validateEnv(env);
  if (validationError) throw new Error(validationError);

  mkdirSync(outputDir, { recursive: true });
  const dumpName = buildDumpFilename(now);
  const outputPath = path.join(outputDir, dumpName);
  await dumpRunner({ connectionString: env.PRODUCTION_DB_URL, outputPath });

  const bytes = statSync(outputPath).size;
  const sha256 = await hasher(outputPath);
  const rowCounts = await rowCountRunner({ connectionString: env.PRODUCTION_DB_URL });

  const manifest = { capturedAt: now.toISOString(), archive: dumpName, bytes, sha256, rowCounts };
  const manifestPath = path.join(outputDir, buildManifestFilename(now));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  return { outputPath, manifestPath, manifest };
}

export async function main(env = process.env) {
  const result = await backupProduction({ env });
  console.log(`Production backup written to ${result.outputPath}`);
  console.log(`Manifest written to ${result.manifestPath}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
