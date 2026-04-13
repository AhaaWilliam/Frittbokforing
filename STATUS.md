# Fritt Bokforing -- Projektstatus

## Aktuell sprint: 15 KLAR (S41--S47) -- Kritiska normaliseringar

Sprint 15 adresserade 16 findings fran kontraktsaudit S41. 7 sessioner,
M119--M124 + M126 introducerade. PRAGMA user_version = 24, 22 tabeller.

### Sprint 15 sessioner
| Session | Scope | Status |
|---------|-------|--------|
| S41 | Kontraktsaudit + rapport (16 findings) | KLAR |
| S42 | F1: Ore-suffix-renames (5 kolumner), M121 table-recreate | KLAR |
| S43 | F2: manual_entry_lines FK + payment_batches FK, M122 | KLAR |
| S44 | F5: invoice_lines.account_number NOT NULL vid finalize | KLAR |
| S45 | Testkonsolidering + M123 | KLAR |
| S46 | M100-normalisering over services + dublettdetektion M124 | KLAR |
| S47 | CLAUDE.md-sync + STATUS.md + M126 bank-fee-policy | KLAR |

### Sprint 16 (B-findings fran S41)
| Session | Scope | Status |
|---------|-------|--------|
| S48 | F4: ore-suffix products/price_list_items (M119) | KLAR |
| S57 | F10: expense_lines paritet (M127) | KLAR |
| S58 | F4: Schema-namnkonvention (created_by → created_by_id) | KLAR |
| S59 | F9: Timezone-konsolidering | - |
| S60 | F13: Handler error-patterns | - |

## Test-count
- Vitest (system + unit): 1196 passed, 2 skipped (1198 totalt)
- Testfiler: 95
- Playwright E2E: 10 (kors separat)
- Korning: ~9s

## Known infrastructure contracts
- **FRITT_DB_PATH**: guardad till test-env (NODE_ENV=test eller FRITT_TEST=1). Ignoreras i production.
- **FRITT_TEST=1**: aktiverar `window.__testApi` och test-only IPC-handlers (`__test:`-prefix).
- **E2E_DOWNLOAD_DIR**: bypass for dialog.showSaveDialog i E2E.
- **better-sqlite3 handle-kontrakt**: Electron ager primary rw-handle under test. Test-kod seedar via IPC, inte direkt db-access.
- **Playwright workers: 1**: Electron singleton per test-fil.

## Kanda fynd vantande

### Schema conventions -- medvetna avvikelser (klass B)
- **accounts.k2_allowed** -- boolean utan `is_`-prefix. `is_k2_allowed` borderline, ej tydligt battre. 54 referenser over 8 filer.
- **accounts.k3_only** -- boolean utan `is_`-prefix. `is_k3_only` borderline. Samma fotavtryck som k2_allowed.

Dokumenterat i S58 (Sprint 16 F4). Konservativ default: ej andrade.

### Tech debt (by design, ej blockerande)
1. **4 invariant-throws i validatePeriodInvariants** -- fangade av PERIOD_GENERATION_ERROR-wrapper, inte user-facing.
2. **ManualEntryListItem.total_amount** -- saknar `_ore`-suffix (M119). Rename ar breaking for renderer. Lagreprioritet.
3. **E03 supplier-picker** -- saknar data-testid for E2E-selektering.

### UX-friktioner (upptackta under S51 E2E)
4. **Picker-komponenter saknar data-testid** -- CustomerPicker/ArticlePicker dropdown-rader har inga testbara selektorer.
5. **"Bokfor" text-collision** -- Navigation-lank, sidrubriker och submit-knapp delar texten "Bokfor".
6. **Payment fran list-row med stopPropagation** -- Betala-knappen finns bara i InvoiceList action-kolumn.

### Arkitektur/test-beslut vantande
7. **Bank-fee proportionalitet** -- nuvarande policy: hel avgift per batch (M126). Framtida: proportionell fordelning.
8. **Trigger 6/7-analys** -- opening_balance entries exempterade fran triggers 1-5 men ej 6-7.
9. **Redundans-audit** -- se tests/REDUNDANCY_AUDIT.md.

## Tidigare sprintar
- Sprint 15 (S41-S47): Kritiska normaliseringar -- KLAR
- Sprint 14 (S48-S53): E2E-testinfrastruktur -- KLAR
- Sprint 13 (S55-S56): Bulk-betalningar -- KLAR
- Sprint 12 (S54): Bankavgifter -- KLAR
- Sprint 11 (S42-S53): Atomicitet, SSOT resultat, Oresutjamning, Performance, Rename -- KLAR
