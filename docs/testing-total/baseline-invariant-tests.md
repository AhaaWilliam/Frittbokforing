# Befintliga invariant/consistency/parity-tester (baseline)

Grep: `tests/**/*.test.ts` med `invariant|consistency|parity`.

| Fil | Kort sammanfattning |
|---|---|
| tests/migrations/full-chain-regression.test.ts | Kör alla migrations 001→N och verifierar slutstate |
| tests/migrations/migration-026-expense-lines-parity.test.ts | Paritet invoice_lines ↔ expense_lines schema |
| tests/s25-backend-vat.test.ts | VAT-beräkning main-side |
| tests/s25-vat-parity.test.ts | Paritet renderer↔backend VAT (M135) |
| tests/security/SEC04-financial-integrity.test.ts | SUM(debit)=SUM(credit), paid_amount-integritet |
| tests/session-14.test.ts | Öresutjämning (M99) |
| tests/session-15.test.ts | Structured errors (M100) |
| tests/session-16-sie5-export.test.ts | SIE5-roundtrip |
| tests/session-32-verifikat-search.test.ts | FTS5 rebuild-säkerhet |
| tests/session-35-credit-note-defense.test.ts | M138 defense-in-depth |
| tests/session-42-aging.test.ts | Aging-berakning |
| tests/session-43-result-service.test.ts | M96–M98 result-service invarianter |
| tests/session-45-fas5a-performance.test.ts | Performance-regress |
| tests/session-53-cash-flow.test.ts | Cash flow-beräkning |
| tests/session-55-bank-statement-service.test.ts | Bank-statement roundtrip |
| tests/session-56-bank-match-suggester.test.ts | M153 scoring-invariant |
| tests/session-56-pagination.test.ts | Paginering deterministisk |
| tests/session-68-ipc-precision.test.ts | IPC öre-precision |
| tests/system/S04-fiscal-year-transition.test.ts | M93–M95 FY-transitions |
| tests/system/S13-bulk-payment.test.ts | M112–M114 bulk-payments |

Total: 20 filer. Fas 3 ska expandera till full M-täckning (62 principer).
