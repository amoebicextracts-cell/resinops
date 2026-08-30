// ============================================================
// ResinOps — Production pool ledger
// src/lib/productionPools.js
//
// Item 3 of the TSW KPI Cost Tracker competitive-feature-adoption list:
// named intermediate WIP pools sitting between Harvest Batches and
// Production Batches, fed by deposits from source batches and drawn
// down by withdrawals into downstream batches.
//
// A pool's current balance and weighted-average cost-per-gram are
// always DERIVED by replaying its transactions in order, never stored
// on the pool row itself -- the same "compute from raw facts, don't
// maintain a running total that could drift from its own source rows"
// philosophy src/lib/reconciliation.js already uses for the batch
// mass-balance ledger.
//
// Costing method: moving weighted average, same as most real inventory
// costing systems. Each deposit blends its own cost/gram into the
// pool's running average. Each withdrawal draws material out at the
// pool's average *immediately before that withdrawal* -- the migration
// deliberately snapshots that average onto the withdrawal's own
// unit_cost_per_g at insert time, so a later deposit changing the pool's
// live average can never retroactively change what a past withdrawal's
// cost basis was.
// ============================================================

export function poolLedger(poolId, transactions) {
  const txs = (transactions || [])
    .filter(t => t.poolId === poolId)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  let balanceG = 0;
  let totalValue = 0; // == balanceG * avgCostPerG, tracked directly to avoid repeated division

  const rows = txs.map(t => {
    const amount = parseFloat(t.amountG) || 0;
    const unitCost = parseFloat(t.unitCostPerG) || 0;
    if (t.type === "deposit") {
      totalValue += amount * unitCost;
      balanceG += amount;
    } else {
      balanceG = Math.max(0, balanceG - amount);
      totalValue = Math.max(0, totalValue - amount * unitCost);
    }
    return { ...t, runningBalanceG: balanceG, runningAvgCostPerG: balanceG > 0 ? totalValue / balanceG : 0 };
  });

  return {
    transactions: rows,
    balanceG,
    avgCostPerG: balanceG > 0 ? totalValue / balanceG : 0,
  };
}

// What a withdrawal recorded right now would cost/gram -- the pool's
// current average, before that withdrawal is actually inserted. Callers
// recording a new withdrawal should read this value and snapshot it onto
// the transaction row, per the costing method above.
export function currentAvgCostPerG(poolId, transactions) {
  return poolLedger(poolId, transactions).avgCostPerG;
}

export function currentBalanceG(poolId, transactions) {
  return poolLedger(poolId, transactions).balanceG;
}
