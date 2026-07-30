// ============================================================
// ResinOps — Automated production database backup
// scripts/backup-production.mjs
//
// Runs pg_dump against production via the Supabase session pooler
// connection string (the direct/IPv6 connection string doesn't work from
// GitHub Actions' IPv4-only runners — the same constraint already solved
// for database-tests.yml's local Docker DB, except that one never talks
// to production at all). Pipes the dump through gzip and writes a
// timestamped file, invoked on a schedule by
// .github/workflows/scheduled-backup.yml.
//
// The actual pg_dump/gzip invocation is injectable (the `runner` option)
// so this is unit-testable without a real Postgres install; the default
// runner is what actually executes in CI.
//
// Usage:
//   PRODUCTION_DB_URL="postgres://...pooler.supabase.com:5432/postgres" \
//     node scripts/backup-production.mjs
// ============================================================

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildDumpFilename(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `resinops-production-${stamp}.sql.gz`;
}

export function validateEnv(env = process.env) {
  if (!env.PRODUCTION_DB_URL || !env.PRODUCTION_DB_URL.trim()) {
    return 'PRODUCTION_DB_URL is not configured (Supabase session pooler connection string)';
  }
  return null;
}

export function defaultRunner({ connectionString, outputPath }) {
  return new Promise((resolve, reject) => {
    const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', '--format=plain', connectionString], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const gzip = spawn('gzip', [], { stdio: ['pipe', 'pipe', 'inherit'] });
    const out = createWriteStream(outputPath);

    let failure = null;
    dump.on('error', err => { failure = failure || err; });
    gzip.on('error', err => { failure = failure || err; });
    out.on('error', err => { failure = failure || err; });
    dump.on('exit', code => { if (code !== 0) failure = failure || new Error(`pg_dump exited with code ${code}`); });
    gzip.on('exit', code => { if (code !== 0) failure = failure || new Error(`gzip exited with code ${code}`); });

    dump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(out);
    out.on('finish', () => { if (failure) reject(failure); else resolve(outputPath); });
  });
}

export async function backupProduction({
  env = process.env,
  now = new Date(),
  outputDir = 'backups',
  runner = defaultRunner,
} = {}) {
  const validationError = validateEnv(env);
  if (validationError) throw new Error(validationError);

  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, buildDumpFilename(now));
  await runner({ connectionString: env.PRODUCTION_DB_URL, outputPath });
  return { outputPath };
}

export async function main(env = process.env) {
  const result = await backupProduction({ env });
  console.log(`Production backup written to ${result.outputPath}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
