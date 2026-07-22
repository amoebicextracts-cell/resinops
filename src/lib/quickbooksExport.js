// ============================================================
// ResinOps — QuickBooks Online journal-entry CSV export
// src/lib/quickbooksExport.js
//
// Builds a CSV in the format QuickBooks Online's own journal-entry
// importer expects: Journal Date, a Ref Number shared by every line of
// one entry, Account Name (sub-accounts as "Parent:Sub"), Debit, Credit
// (blank/zero-free in the unused column), a per-line Description, and a
// per-entry Memo, with every debit line listed before any credit line.
// One journal entry per production batch. Client-side only — no API
// connection to a real QuickBooks account, since this repo has no way to
// read a facility's actual chart of accounts; the account names used
// come from the facility's own qb_account_map setting (Facility
// Settings), defaulting to generic names the facility can rename in
// QuickBooks to match their real books.
// ============================================================

import { calcBatchCOGS } from './cogs.js';

const DEFAULT_MAP = {
  materialsDebit: 'COGS:Materials', materialsCredit: 'Inventory Asset',
  laborDebit: 'COGS:Direct Labor', laborCredit: 'Wages Payable',
  testingDebit: 'COGS:Lab Testing', testingCredit: 'Accounts Payable',
  cultivationDebit: 'COGS:Cultivation', cultivationCredit: 'Overhead Clearing',
  overheadDebit: 'COGS:Allocated Overhead', overheadCredit: 'Overhead Clearing',
};

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function money(n) { return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2); }

export function buildQuickBooksRows(batches, ctx, accountMap) {
  const map = { ...DEFAULT_MAP, ...(accountMap || {}) };
  const rows = [['Journal Date', 'Ref Number', 'Account Name', 'Debit', 'Credit', 'Description', 'Memo']];

  for (const batch of batches || []) {
    const cogs = calcBatchCOGS(batch, ctx);
    const refNumber = 'BATCH-' + (batch.name || batch.id).toString().replace(/\s+/g, '-').slice(0, 20);
    const date = batch.d || new Date().toISOString().split('T')[0];
    const memo = `COGS — ${batch.name} (${batch.catLabel || batch.cat}${batch.subLabel ? ' — ' + batch.subLabel : ''})`;

    const components = [
      { amount: cogs.materialCost, debitAccount: map.materialsDebit, creditAccount: map.materialsCredit, desc: 'Direct materials' },
      { amount: cogs.directLaborCost, debitAccount: map.laborDebit, creditAccount: map.laborCredit, desc: 'Direct labor' },
      { amount: cogs.testFee, debitAccount: map.testingDebit, creditAccount: map.testingCredit, desc: 'Lab testing' },
      { amount: cogs.cultivationCost, debitAccount: map.cultivationDebit, creditAccount: map.cultivationCredit, desc: 'Cultivation cost allocation' },
      { amount: cogs.allocatedOverhead, debitAccount: map.overheadDebit, creditAccount: map.overheadCredit, desc: 'Allocated overhead (§263A)' },
    ].filter(c => c.amount > 0);

    if (!components.length) continue;

    // All debit lines first, then all credit lines, per QuickBooks Online's
    // import requirements.
    for (const c of components) {
      rows.push([date, refNumber, c.debitAccount, money(c.amount), '', c.desc, memo]);
    }
    for (const c of components) {
      rows.push([date, refNumber, c.creditAccount, '', money(c.amount), c.desc, memo]);
    }
  }

  return rows;
}

export function exportQuickBooksCsv(batches, ctx, accountMap) {
  const rows = buildQuickBooksRows(batches, ctx, accountMap);
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ResinOps-QuickBooks-JournalEntries-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
