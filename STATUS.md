# Fritt Bokföring — Projektstatus

## Senaste sprint: 14 (KLAR, S48–S53)

## Test-count
- Vitest (system + unit): ~1155
- Playwright E2E: 10
- Totalt: ~1165

## Known infrastructure contracts
- **FRITT_DB_PATH**: guardad till test-env (NODE_ENV=test eller FRITT_TEST=1). Ignoreras i production.
- **FRITT_TEST=1**: aktiverar `window.__testApi` och test-only IPC-handlers (`__test:`-prefix).
- **E2E_DOWNLOAD_DIR**: bypass för dialog.showSaveDialog i E2E.
- **better-sqlite3 handle-kontrakt**: Electron äger primary rw-handle under test. Test-kod seedar via IPC, inte direkt db-access.
- **Playwright workers: 1**: Electron singleton per test-fil.

## Kända fynd väntande

### UX-friktioner (Sprint 15-kandidater, upptäckta under S51 E2E)

1. **Picker-komponenter saknar data-testid** — CustomerPicker/ArticlePicker dropdown-rader har inga testbara selektorer. Fix: `data-testid="picker-item-{id}"` på dropdown-rader. Liten ändring, stor E2E-vinst.

2. **"Bokför" text-collision** — Navigation-länk, sidrubriker och submit-knapp delar texten "Bokför". Kräver `getByRole('button', { name: 'Bokför' })` i E2E. Fix: `data-testid="bokfor-submit"` på knappen, eller byt knapp-text till "Spara och bokför" (bättre UX också).

3. **Payment från list-row med stopPropagation** — Betala-knappen finns bara i InvoiceList action-kolumn, inte i faktura-detaljvyn. Fungerar men är oupptäckbart utan att känna till mönstret. Fix: exponera betalning även från faktura-detaljvyn, eller lägg till tydlig tooltip.

### Arkitektur/test-beslut väntande

4. **Bank-fee proportionalitet** — diskussion från Sprint 13b om huruvida bankavgift ska fördelas proportionellt per faktura vid bulk-betalning. Nuvarande: en flat fee-post per batch.

5. **Trigger 6/7-analys** — opening_balance entries är exempterade från immutability-triggers (1-5) men INTE från balance/period-triggers (6-7). Om framtida IB-korrigeringsflöde behövs måste trigger 6/7 få opening_balance-undantag.

6. **Redundans-audit** — se tests/REDUNDANCY_AUDIT.md. System-tester som överlappar E2E-happy-path markeras som kandidater för borttag (4 st). Beslut skjuts till Sprint 15. Kriterium: borttagning först när E2E duplicerar både flöde OCH granularitet.

## Nästa sprint: TBD
