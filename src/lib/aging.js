// ============================================================
// ResinOps — Shared AP/AR aging logic
// src/lib/aging.js
//
// Identical bucket/status math used by both Accounts Payable
// (InventoryERP.jsx) and Accounts Receivable (SalesOrders.jsx) so the
// two never drift apart.
// ============================================================

export function agingBucket(dueDate) {
  if (!dueDate) return null;
  const days = Math.floor((new Date() - new Date(dueDate + "T00:00:00")) / 86400000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function paymentStatus(amount, amountPaid) {
  const paid = parseFloat(amountPaid) || 0, total = parseFloat(amount) || 0;
  if (paid <= 0) return "unpaid";
  return paid >= total ? "paid" : "partial";
}
