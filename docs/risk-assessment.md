# Risk assessment — ResinOps production platform

Closes the Annex 11 §1 (Risk Management) gap: prior work in this
project made risk-based decisions constantly (which document type to
archive first, which enforcement gap to close before which) without
ever writing them down as a single assessment. This is that write-down
— a snapshot as of 2026-08-23, not a one-time exercise. It should be
revisited whenever a new major feature ships or a rated risk's
mitigation changes.

**Reassessment, same day (2026-08-23):** three things changed since the
first pass, all reflected below rather than left stale — (1) the
METRC write path (`api/metrc.js`) now shares the same release gate as
`sales_orders`, closing the gap SEC-4 originally flagged as open; (2) a
real functional bug was found and fixed in that shared gate itself —
it checked whether a batch had *ever* failed QC, not whether its *most
recent* test failed, which would have kept a legitimately remediated
batch blocked forever; and (3) remediation retests now produce a real,
independently-signable QC record instead of a bare status flag,
closing part of DI-5. Separately, the self-attestation-vs-audit
decision named as open in the first pass (PR-3) has since been made.
This is the kind of update this document is meant to absorb routinely,
not a special event.

## Methodology

Each risk is rated **Likelihood** and **Impact** on a simple three-point
scale (Low / Medium / High), combined into an **Overall** rating.
Likelihood reflects how plausible the failure mode is given the current
system and its current (small, no-real-customer-yet) usage — not a
generic industry base rate. Impact reflects consequence if it happened
today. Both numbers will shift as real customer data and volume grow;
several risks rated Low likelihood today are rated that way specifically
*because* there's no real customer load yet, and are flagged as such.

## Data integrity risks

| # | Risk | Likelihood | Impact | Overall | Existing mitigation | Residual risk |
|---|---|---|---|---|---|---|
| DI-1 | Unauthorized or accidental modification of another tenant's data | Low | High | Medium | Row-level security on every tenant table, scoped by `facility_id`; proven daily in CI via a dedicated cross-tenant smoke test (`production-smoke.yml`, the `[SYNTHETIC] ResinOps Smoke Facility A`/`B - Forbidden` fixtures) | Low — this is the most independently-verified control in the system |
| DI-2 | A QC-failed or unsigned batch reaches sale or shipment | Low | High | Medium | Database-level trigger on `sales_orders` and a matching gate in `api/metrc.js`, both calling the shared `check_batch_release_block()`, which keys off each batch's *most recent* QC test (fixed from an initial version that checked whether any test had ever failed — that version would have kept a successfully remediated batch permanently blocked). All verified against production with throwaway data. | Low-Medium — quantity/inventory-availability isn't enforced (no real finished-goods ledger exists), only the hold/sign-off gates |
| DI-3 | A critical manually-entered value (QC result, batch weight, COGS input) is simply wrong, with no independent check | Medium | Medium | Medium | Ordinary single-entry form validation only — no second-entry or cross-check exists anywhere in the app | **Medium — open gap, no code-level mitigation yet** |
| DI-4 | A signed GMP record (batch record, SOP, deviation closure, QC/COA result) is tampered with after signing | Low | High | Medium | SHA-256 hash computed at signing, re-verified server-side against a re-verified password; immutable, insert-only `signature_records`; private storage bucket with no client-facing write/delete access | Low |
| DI-5 | A GMP record without a signing requirement (remediation, a deviation before closure) is edited with only a generic audit-log trail, not a full sign-and-lock | Medium | Medium | Medium | `audit_logs` before/after snapshot on every write; `gmp_change_reasons` requires a documented reason for the two highest-risk reversal actions (unsigning, reopening a closed deviation); a remediation retest now creates a real `qc_tests` row (independently signable via the existing COA sign flow) instead of a bare status dropdown value | Low-Medium — the retest COA itself can now be durably signed; the remediation *dose record* (original failed CFU data, irradiation settings) still has no sign-and-lock of its own, and a single terminal whole-batch-closure event still doesn't exist |
| DI-6 | A printed or exported record doesn't indicate the underlying data changed since original entry | High | Low-Medium | Medium | None — every export (batch record PDF, COA PDF, CSV exports) is a plain point-in-time snapshot | **Medium — open gap, no mitigation yet; likely the cheapest of the open gaps to close (a "last edited" timestamp on non-signed exports)** |

## Availability / continuity risks

| # | Risk | Likelihood | Impact | Overall | Existing mitigation | Residual risk |
|---|---|---|---|---|---|---|
| AV-1 | Supabase project loss or extended outage | Low | High | Medium | Two independent daily backups (Supabase's own built-in physical backup, and ResinOps' own restore-verified pipeline to 7-year GCS retention) — see [business-continuity-plan.md](./business-continuity-plan.md) | Medium — RPO is bounded to ~24h since Point-in-Time Recovery isn't enabled; RTO is an estimate, never rehearsed as a real drill |
| AV-2 | Vercel outage or a bad deploy | Low | Low | Low | Immutable, instantly-reversible deploys; database is untouched by a pure frontend/function incident | Low |
| AV-3 | The one person who can execute any recovery procedure is unavailable | Medium | High | Medium-High | None beyond documentation (this assessment, the BCP, and the change-management SOP make the dependency explicit rather than hidden) | **Medium-High — structural, accepted at current company size, not solved by any document** |

## Security risks

| # | Risk | Likelihood | Impact | Overall | Existing mitigation | Residual risk |
|---|---|---|---|---|---|---|
| SEC-1 | Compromised Supabase service-role key or other static credential | Low | High | Medium | Stored only in Vercel's encrypted environment variables, never in client code or git; the backup pipeline specifically uses Workload Identity Federation instead of a static key, eliminating that credential from the threat model entirely | Medium — the service-role key itself is still a static secret with broad access; no rotation cadence is currently documented |
| SEC-2 | Stale or excessive facility member access going unnoticed | Medium | Medium | Medium | Periodic access-review workflow (90-day cadence, due/overdue banner, direct path from a flagged member to removal) | Low-Medium — the review is self-initiated by an admin, not enforced; nothing in the system currently blocks continued access if a review goes overdue |
| SEC-3 | A credential-aware safety check is silently bypassed via a manual-entry escape hatch (confirmed: the pesticide-applicator picker in cultivation-input/spray-log forms) | Low | Low-Medium | Low | The escape hatch exists for legitimate cases (a licensed applicator not yet in the roster) | Low — cosmetic/process risk more than a data-integrity one, since it doesn't affect GMP release decisions |
| SEC-4 | METRC integration becomes a live, unverified regulatory-submission channel | None currently (integration is fully unconfigured in every environment) | High, if it ever activates without further verification | Low today | Deliberately disabled pending a real ResinOps business license, EIN, and METRC vendor approval; `packages.create` and `transfers.create_outgoing` now both call `check_batch_release_block()` before pushing, confirmed wired up (previously just "planned" in the first pass of this assessment) | Low today, **re-assess before ever configuring METRC write credentials** — the transfer-manifest payload shape is still explicitly marked as unverified against real METRC API documentation, which the release gate doesn't address |

## Process / regulatory risks

| # | Risk | Likelihood | Impact | Overall | Existing mitigation | Residual risk |
|---|---|---|---|---|---|---|
| PR-1 | Demo/investor-facing data is confused with real customer data during a support or admin action | Low | Medium | Low-Medium | The demo-load/clear-all-data tool now requires typing the exact current facility's name back before either action runs | Low |
| PR-2 | No independent code review — every change is authored and merged by the same person | High | Medium | Medium | Automated CI (build, tests, RLS/security-invariant suite) is the only independent check | **Medium — structural, same root cause as AV-3, named honestly in the change-management SOP rather than hidden** |
| PR-3 | No third-party validation of any control described in this assessment or the traceability matrix | High (nothing has been externally audited) | Medium, rising if a real client requires it | Medium | None — every control here remains self-assessed | **Decided (2026-08-23): self-attestation for now, not third-party audit.** A deliberate choice for an early-stage vendor with no real paying customer yet, not an oversight — revisit if a prospective client (e.g. the Colombia conversation) specifically requires independent verification |

## Top residual risks, ranked

Ranked by overall rating combined with how cheaply the risk could be
reduced further — not a re-statement of the tables above, a judgment
call about where effort is best spent next:

1. **AV-3 / PR-2 — the single-person bus factor.** The highest-rated
   residual risk in this document, and the one no code change fixes.
   Worth naming as a real constraint in any conversation where ResinOps'
   operational maturity is being evaluated (e.g. the Colombia
   consulting conversation), not worth trying to paper over.
2. **DI-3 — no accuracy verification on critical data entry.** Medium
   likelihood, real impact, genuinely closeable in code.
3. **DI-6 — exports don't flag post-entry edits.** High likelihood
   (every export has this gap) but low-to-medium impact and, per the
   traceability matrix, cheap to close.
4. **AV-1 — unverified RTO, no PITR.** The business continuity plan
   already names both; the highest-leverage single action here is
   enabling Point-in-Time Recovery before onboarding a real paying
   facility.

~~5. PR-3 — the audit-approach decision.~~ **Resolved 2026-08-23**:
self-attestation, for now. No longer an open item on this list — see
the PR-3 row above.

## Known gaps in this assessment itself

- Ratings are the assessor's judgment (this document was written by
  the same person who built the controls it rates), not the output of
  an independent risk workshop. That's the same self-review limitation
  named in PR-2 and PR-3 above, applied recursively to this document.
- No formal review cadence is defined yet for this document itself —
  it should be revisited at minimum whenever a new major feature ships
  or the customer base changes from zero real customers to one.
