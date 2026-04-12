# Redundancy Audit — System tests vs E2E (Sprint 14)

Audit of `tests/system/S13-bulk-payment.test.ts`, `S13b-*.test.ts`, and
`tests/system/opening-balance-lifecycle.test.ts` vs E2E coverage in
`tests/e2e/bulk-payment.spec.ts` and `tests/e2e/full-cycle.spec.ts`.

**Decision: no removals in this sprint.** This audit identifies candidates only.

## Removal criteria

Overlap is acceptable when the system test provides more granular assertions
(line-level journal entries, exact verification numbers, specific error strings)
than the E2E counterpart. A system test becomes a candidate for removal only when
the E2E test duplicates both the flow AND the granularity. Until then, both layers
coexist — the cost of running an extra sub-second system test is negligible compared
to the risk of losing a precise regression signal.

## Legend

- **KEEP** — edge case or logic the E2E cannot realistically cover
- **OVERLAP** — happy-path overlap with E2E; candidate for future removal
- **NOTE** — informational

---

## S13-bulk-payment.test.ts (69 tests)

### Migration 021 schema tests (7 tests, lines 97–198)
**KEEP** — DDL/schema verification. E2E doesn't verify table structure.

### payInvoicesBulk — happy path (line 200)
**OVERLAP** — E2E test 4 covers the same 3-invoice + bank-fee flow with DB assertions.
However: system test asserts exact verification_series/number, journal_entry_lines content,
and KSUMMA checksums. E2E only counts entries and checks source_type. *Candidate for removal
only if E2E adds line-level assertions.*

### payInvoicesBulk — partial (line 259)
**OVERLAP** — E2E test 5 covers race-condition partial. System test has more precise
assertions (exact failed invoice id, ALREADY_PAID-like error). *Keep for error-path precision.*

### payInvoicesBulk — all fail (line 292)
**KEEP** — E2E doesn't test the all-fail/cancelled path.

### payInvoicesBulk — singular (line 325)
**KEEP** — single-invoice batch isn't covered by E2E.

### payInvoicesBulk — validation (lines 342–376)
**KEEP** — bank_fee >= sum, duplicate ids, future date. Pure validation edge cases.

### payInvoicesBulk — verification contiguity (line 376)
**KEEP** — contiguity after savepoint rollback. E2E doesn't verify ver numbers.

### payExpensesBulk — all tests (lines 409–951)
**KEEP** — E2E only covers invoice bulk, not expense bulk.

### payExpense — chronology check regression (line 970)
**KEEP** — M6 chronology enforcement. Not in E2E scope.

### payInvoice — public contract (line 995)
**KEEP** — single-payment public contract. Not in E2E scope.

### Cross-cutting invariants F1–F6 (lines 1015–1183)
**KEEP** — balance, source_type, FK integrity, source_reference, immutability, sequential bulk.
These are structural invariants that E2E can't efficiently verify.

### SIE4/SIE5 export after bulk batch G1–G2 (lines 1200–1270)
**OVERLAP** — full-cycle E2E verifies SIE4 export with #FNAMN + #VER + C-series. But system
tests verify bank-fee-specific verifikat with åäö in SIE4 CP437 and SIE5 UTF-8 respectively.
System tests are more targeted. *Keep both.*

### IDEMP1/IDEMP2 — idempotency (lines 1260–1355)
**KEEP** — retry/double-click scenarios. Not in E2E scope.

### BULK-ÖRES1/ÖRES2 — öresutjämning (lines 1355–1430)
**KEEP** — rounding edge cases. Not in E2E scope.

### BANK-FEE-EDGE1 — 0 vs undefined (lines 1430–1470)
**KEEP** — edge case around bank_fee_ore: 0 vs omitted.

### SIE-PARTIAL1/PARTIAL2 — SIE roundtrip with partial batch (lines 1470–1570)
**KEEP** — SIE roundtrip with partial batch data. Not in E2E scope.

### USER-NOTE-REGRESSION (line 1567)
**KEEP** — leak prevention (user_note stays in batch, not journal).

---

## S13b-partial-contiguity.test.ts (2 tests)
**KEEP** — period-closing triggers + contiguity after partial. E2E doesn't test closed periods.

## S13b-trigger-matrix.test.ts (10 tests)
**KEEP** — trigger-level opening_balance exception verification. Orthogonal to E2E.

## opening-balance-lifecycle.test.ts (4 tests, Sprint 14 S48)
**KEEP** — trigger contract tests at DB level. Not duplicated by E2E.

---

## Summary

| Category | Count | Verdict |
|----------|-------|---------|
| KEEP | ~65 | Edge cases, validation, structural invariants |
| OVERLAP (candidate) | ~4 | Happy-path overlap with E2E |
| Total system tests audited | ~69 + 16 | |

**Recommendation**: No removals. The 4 overlap candidates provide more granular assertions
than their E2E counterparts. Revisit if E2E tests expand to include line-level journal entry
assertions and expense-side bulk testing.

**Note on full-cycle E2E (S51)**: The full-cycle test verifies A-series and C-series entries
exist but does not assert exact verification numbers (A1, A2, C1). If a refactoring breaks
the numbering sequence, this test won't catch it. The A-series logic is covered by system
tests B9 (contiguity) and F6 (sequential contiguity).
