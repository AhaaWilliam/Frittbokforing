/**
 * J03 — Bankavstämning end-to-end (prompten-journey 4).
 *
 * Status: SKELETON / skip.
 *
 * Scope:
 *  - Seed 30 fakturor + 15 kostnader via __test:seedBulk
 *  - Importera camt.053-fixture (tests/fixtures/bank/sample.camt.053)
 *    via Settings → Bank → Importera (dialog bypass via E2E_MOCK_OPEN_FILE)
 *  - Kör auto-match — ≥ 20 TX ska få match-suggestions
 *  - Manuellt match 5 TX via UI-klick
 *  - Klassificera 3 avgifter som bankavgift (6570)
 *  - Unmatch en, rematcha
 *  - Assert: SUM(invoice_payments.amount_ore + expense_payments.amount_ore)
 *    === SUM(matched bank_transactions.amount_ore)
 *  - Assert: alla nya C-serie-verifikat från M154 unmatch balanserar
 *
 * Infrastruktur krävs:
 *  - tests/fixtures/bank/sample.camt.053 — canonical testfil
 *  - __test:seedBulk för snabbare seeding än UI-klick
 *  - data-testid för bulk-select-rows + match-suggestion-accept
 */
import { test, expect } from '../app-fixture'

test.skip('J03 @pending — camt.053 import + auto-match + manual-match + unmatch', async ({
  window,
}) => {
  expect(true).toBe(true)
  void window
})
