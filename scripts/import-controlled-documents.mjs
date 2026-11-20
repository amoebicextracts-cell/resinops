#!/usr/bin/env node
// ============================================================
// Bulk-import existing documents (and their version history) into
// Document Control. Server-side only: needs the service role key.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/import-controlled-documents.mjs <facilityId> <manifest.json> [--dry-run]
//
// manifest.json:
// {
//   "baseDir": ".",                 // relative to this manifest file
//   "documents": [{
//     "docKey": "GCCNY-TCOOK-1GRPR-111826-B01",
//     "title": "Tropicana Cookies 1 g Pre-Roll",
//     "category": "batch_record",          // template | batch_record | rd_record | sop | form | other
//     "productType": "Pre-roll",
//     "rdDosed": null,                      // true/false for rd_record
//     "notes": "optional",
//     "versions": [                         // oldest first; the last one ends up current
//       { "versionLabel": "1.0", "effectiveDate": "2026-11-18", "file": "Pre-Rolls/.../v1.0.pdf", "changelog": "..." }
//     ]
//   }]
// }
//
// Idempotent: documents are matched on (facility, docKey) and versions on
// (document, versionLabel); anything already present is skipped, so a
// re-run after a partial failure picks up where it stopped.
// ============================================================

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildStoragePath, validateCreateUploadPayload } from '../api/_controlled-documents.js';

const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.csv': 'text/csv', '.md': 'text/markdown', '.txt': 'text/plain' };

const [facilityId, manifestPath, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
if (!facilityId || !manifestPath) {
  console.error('usage: node scripts/import-controlled-documents.mjs <facilityId> <manifest.json> [--dry-run]');
  process.exit(2);
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// A relative baseDir is relative to the manifest file, not the current directory.
const baseDir = path.resolve(path.dirname(path.resolve(manifestPath)), manifest.baseDir || '.');

// Validate everything up front with the same rules the API enforces.
const problems = [];
for (const doc of manifest.documents) {
  doc.versions.forEach((v, i) => {
    const err = validateCreateUploadPayload({
      facilityId,
      ...(i === 0 ? { newDocument: { docKey: doc.docKey, title: doc.title, category: doc.category, productType: doc.productType, rdDosed: doc.rdDosed, notes: doc.notes } } : { documentId: '00000000-0000-4000-8000-000000000000' }),
      versionLabel: v.versionLabel, changelog: v.changelog, fileName: path.basename(v.file),
      mimeType: MIME[path.extname(v.file).toLowerCase()], effectiveDate: v.effectiveDate,
    });
    if (err) problems.push(`${doc.docKey} v${v.versionLabel}: ${err}`);
  });
}
if (problems.length) {
  console.error('Manifest problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !key)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run).');
  process.exit(2);
}
const admin = dryRun ? null : createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let created = 0, added = 0, skipped = 0;
for (const doc of manifest.documents) {
  let documentId;
  if (dryRun) {
    console.log(`[dry-run] ${doc.docKey} (${doc.category}) — ${doc.versions.length} version(s)`);
    for (const v of doc.versions) {
      const bytes = await readFile(path.join(baseDir, v.file));
      console.log(`           v${v.versionLabel}  ${v.file}  ${bytes.length} bytes`);
    }
    continue;
  }

  const { data: existing, error: findError } = await admin.from('controlled_documents')
    .select('id').eq('facility_id', facilityId).eq('doc_key', doc.docKey).maybeSingle();
  if (findError) throw findError;
  if (existing) {
    documentId = existing.id;
  } else {
    const { data: inserted, error } = await admin.from('controlled_documents').insert({
      facility_id: facilityId, doc_key: doc.docKey, title: doc.title, category: doc.category,
      product_type: doc.productType || null, rd_dosed: doc.rdDosed ?? null, notes: doc.notes || null,
    }).select('id').single();
    if (error) throw error;
    documentId = inserted.id;
    created++;
  }

  for (const v of doc.versions) {
    const { data: have } = await admin.from('controlled_document_versions')
      .select('id, status').eq('document_id', documentId).eq('version_label', v.versionLabel).maybeSingle();
    if (have && have.status !== 'pending') { skipped++; continue; }

    const bytes = await readFile(path.join(baseDir, v.file));
    const fileName = path.basename(v.file);
    let versionId = have?.id;
    if (!versionId) {
      const { data: row, error } = await admin.from('controlled_document_versions').insert({
        facility_id: facilityId, document_id: documentId, version_label: v.versionLabel,
        changelog: v.changelog.trim(), effective_date: v.effectiveDate || null,
        file_name: fileName, mime_type: MIME[path.extname(fileName).toLowerCase()] || null, status: 'pending',
      }).select('id').single();
      if (error) throw error;
      versionId = row.id;
    }
    const storagePath = buildStoragePath(facilityId, documentId, versionId, fileName);
    const { error: upErr } = await admin.storage.from('controlled-documents')
      .upload(storagePath, bytes, { contentType: MIME[path.extname(fileName).toLowerCase()] || 'application/octet-stream', upsert: true });
    if (upErr) throw upErr;
    const { error: pathErr } = await admin.from('controlled_document_versions').update({ storage_path: storagePath }).eq('id', versionId);
    if (pathErr) throw pathErr;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { error: promoteErr } = await admin.rpc('promote_controlled_document_version', { p_version_id: versionId, p_file_size: bytes.length, p_sha256: sha256 });
    if (promoteErr) throw promoteErr;
    added++;
    console.log(`${doc.docKey} v${v.versionLabel}  ${sha256.slice(0, 12)}…`);
  }
}
console.log(dryRun ? 'Dry run complete.' : `Done: ${created} document(s) created, ${added} version(s) added, ${skipped} already present.`);
