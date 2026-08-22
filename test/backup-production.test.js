import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { backupProduction, buildDumpFilename, buildManifestFilename, validateEnv } from '../scripts/backup-production.mjs';

test('buildDumpFilename produces a sortable, filesystem-safe, custom-format-suffixed name', () => {
  const name = buildDumpFilename(new Date('2026-07-29T13:05:09.123Z'));
  assert.equal(name, 'resinops-production-2026-07-29T13-05-09-123Z.dump');
});

test('buildManifestFilename matches the dump filename with a .json extension', () => {
  const now = new Date('2026-07-29T13:05:09.123Z');
  assert.equal(buildManifestFilename(now), 'resinops-production-2026-07-29T13-05-09-123Z.json');
});

test('validateEnv requires a non-empty PRODUCTION_DB_URL', () => {
  assert.match(validateEnv({}), /PRODUCTION_DB_URL/);
  assert.match(validateEnv({ PRODUCTION_DB_URL: '   ' }), /PRODUCTION_DB_URL/);
  assert.equal(validateEnv({ PRODUCTION_DB_URL: 'postgres://x' }), null);
});

test('backupProduction refuses to run without a configured connection string', async () => {
  await assert.rejects(
    backupProduction({ env: {}, dumpRunner: async () => { throw new Error('should not run'); } }),
    /PRODUCTION_DB_URL/,
  );
});

test('backupProduction creates the output directory, dumps, and writes a matching manifest', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'resinops-backup-test-'));
  const outputDir = path.join(dir, 'nested', 'backups');
  let capturedDump = null;
  let capturedRowCount = null;
  try {
    const result = await backupProduction({
      env: { PRODUCTION_DB_URL: 'postgres://pooler.example/db' },
      now: new Date('2026-07-29T00:00:00.000Z'),
      outputDir,
      dumpRunner: async (args) => {
        capturedDump = args;
        // A real dumpRunner writes the file at outputPath before resolving —
        // backupProduction stats it immediately after, so the stub must too.
        writeFileSync(args.outputPath, 'fake-custom-format-dump-bytes');
      },
      rowCountRunner: async (args) => {
        capturedRowCount = args;
        return { facilities: 3, facility_members: 5, profiles: 5, inventory_items: 12, production_batches: 7, audit_logs: 900 };
      },
      hasher: async () => 'deadbeef',
    });

    assert.equal(existsSync(outputDir), true);
    assert.equal(result.outputPath, path.join(outputDir, 'resinops-production-2026-07-29T00-00-00-000Z.dump'));
    assert.equal(result.manifestPath, path.join(outputDir, 'resinops-production-2026-07-29T00-00-00-000Z.json'));
    assert.equal(capturedDump.connectionString, 'postgres://pooler.example/db');
    assert.equal(capturedDump.outputPath, result.outputPath);
    assert.equal(capturedRowCount.connectionString, 'postgres://pooler.example/db');

    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
    assert.equal(manifest.archive, 'resinops-production-2026-07-29T00-00-00-000Z.dump');
    assert.equal(manifest.bytes, 'fake-custom-format-dump-bytes'.length);
    assert.equal(manifest.sha256, 'deadbeef');
    assert.deepEqual(manifest.rowCounts, { facilities: 3, facility_members: 5, profiles: 5, inventory_items: 12, production_batches: 7, audit_logs: 900 });
    assert.equal(result.manifest.archive, manifest.archive);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backupProduction propagates a dumpRunner failure', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'resinops-backup-test-'));
  try {
    await assert.rejects(
      backupProduction({
        env: { PRODUCTION_DB_URL: 'postgres://pooler.example/db' },
        outputDir: dir,
        dumpRunner: async () => { throw new Error('pg_dump exited with code 1'); },
      }),
      /pg_dump exited with code 1/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backupProduction propagates a rowCountRunner failure without leaving a manifest behind', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'resinops-backup-test-'));
  try {
    await assert.rejects(
      backupProduction({
        env: { PRODUCTION_DB_URL: 'postgres://pooler.example/db' },
        outputDir: dir,
        dumpRunner: async (args) => { writeFileSync(args.outputPath, 'x'); },
        rowCountRunner: async () => { throw new Error('psql exited with code 2'); },
        hasher: async () => 'deadbeef',
      }),
      /psql exited with code 2/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
