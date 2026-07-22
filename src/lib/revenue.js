// ============================================================
// ResinOps — Shared revenue calculations
// src/lib/revenue.js
//
// sales_orders is the single source of truth for realized revenue.
// Finance.jsx (per-batch P&L) and BatchDashboard.jsx (margin dashboard)
// both derive from these helpers instead of computing their own
// independent, disconnected revenue estimates.
// ============================================================

// Sum of committed (non-canceled) order-line qty/revenue for one batch.
export function bookedRevenueForBatch(batchId, salesOrders) {
  let units = 0, revenue = 0;
  for (const o of salesOrders || []) {
    if (o.status === "canceled") continue;
    for (const l of o.lines || []) {
      if (String(l.batchId) === String(batchId)) {
        const qty = parseFloat(l.qty) || 0;
        units += qty;
        revenue += qty * (parseFloat(l.unitPrice) || 0);
      }
    }
  }
  return { units, revenue };
}

function orderTotal(o) {
  const direct = parseFloat(o.orderTotal || o.order_total || 0) || 0;
  if (direct > 0) return direct;
  return (o.lines || []).reduce((a, l) => a + (parseFloat(l.orderTotal) || (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0)), 0);
}

// Same confirmed/pending/waitlist bucketing SalesOrders.jsx and
// Dashboard.jsx each used to reimplement independently.
export function pipelineRevenue(salesOrders) {
  const orders = salesOrders || [];
  const confirmed = orders.filter(o => (o.importStatus || "") === "confirmed" || (o.status === "open" && !o.importStatus));
  const pending = orders.filter(o => (o.importStatus || "") === "pending");
  const waitlist = orders.filter(o => (o.importStatus || "") === "waitlist");
  return {
    confirmedRevenue: confirmed.reduce((a, o) => a + orderTotal(o), 0),
    pendingRevenue: pending.reduce((a, o) => a + orderTotal(o), 0),
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    waitlistCount: waitlist.length,
  };
}
