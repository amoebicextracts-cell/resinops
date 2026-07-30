import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { backupProduction, buildDumpFilename, validateEnv } from '../scripts/backup-production.mjs';

test('buildDumpFilename produces a sortable, filesystem-safe, gzip-suffixed name', () => {
  const name = buildDumpFilename(new Date('2026-07-29T13:05:09.123Z'));
  assert.equal(name, 'resinops-production-2026-07-29T13-05-09-123Z.sql.gz');
});

test('validateEnv requires a non-empty PRODUCTION_DB_URL', () => {
  assert.match(validateEnv({}), /PRODUCTION_DB_URL/);
  assert.match(validateEnv({ PRODUCTION_DB_URL: '   ' }), /PRODUCTION_DB_URL/);
  assert.equal(validateEnv({ PRODUCTION_DB_URL: 'postgres://x' }), null);
});

test('backupProduction refuses to run without a configured connection string', async () => {
  await assert.rejects(
    backupProduction({ env: {}, runner: async () => { throw new Error('should not run'); } }),
    /PRODUCTION_DB_URL/,
  );
});

test('backupProduction creates the output directory and invokes the runner with a timestamped path', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'resinops-backup-test-'));
  const outputDir = path.join(dir, 'nested', 'backups');
  let captured = null;
  try {
    const result = await backupProduction({
      env: { PRODUCTION_DB_URL: 'postgres://pooler.example/db' },
      now: new Date('2026-07-29T00:00:00.000Z'),
      outputDir,
      runner: async (args) => { captured = args; },
    });
    assert.equal(existsSync(outputDir), true);
    assert.equal(result.outputPath, path.join(outputDir, 'resinops-production-2026-07-29T00-00-00-000Z.sql.gz'));
    assert.equal(captured.connectionString, 'postgres://pooler.example/db');
    assert.equal(captured.outputPath, result.outputPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backupProduction propagates a runner failure', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'resinops-backup-test-'));
  try {
    await assert.rejects(
      backupProduction({
        env: { PRODUCTION_DB_URL: 'postgres://pooler.example/db' },
        outputDir: dir,
        runner: async () => { throw new Error('pg_dump exited with code 1'); },
      }),
      /pg_dump exited with code 1/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
