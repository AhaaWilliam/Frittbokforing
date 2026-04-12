# Fritt Bokforing -- Projektstatus

## Aktuell sprint: 15 (S41--S43) -- Kritiska normaliseringar

S41 (kontraktsaudit) klar. 16 findings identifierade. Scope-gate: 34 normaliseringsatgarder
=> Sprint 16 utbruten per M109.

### Sprint 15 scope (A-findings)
| Session | Scope | Status |
|---------|-------|--------|
| S41 | Kontraktsaudit + rapport | KLAR |
| S42 | F1: Ore-suffix-renames (8 kolumner) | - |
| S43 | F2: manual_entry_lines FK + F3: fiscalYearId casing | - |

### Sprint 16 scope (B-findings)
| Session | Scope | Status |
|---------|-------|--------|
| S44 | F4/F5/F6: Schema-namnkonvention (~30 renames) | - |
| S45 | F9: Timezone-fix + F10: expense_lines paritet | - |
| S46 | F13: Handler error-pattern normalisering | - |

Se docs/s41-report.md for full rapport.

## Test-count
- Vitest (system + unit): 1159 passed, 2 skipped (1161 totalt)
- Testfiler: 85
- Playwright E2E: 10 (kors separat)
- Korning: ~6.7s

## Known infrastructure contracts
- **FRITT_DB_PATH**: guardad till test-env (NODE_ENV=test eller FRITT_TEST=1). Ignoreras i production.
- **FRITT_TEST=1**: aktiverar `window.__testApi` och test-only IPC-handlers (`__test:`-prefix).
- **E2E_DOWNLOAD_DIR**: bypass for dialog.showSaveDialog i E2E.
- **better-sqlite3 handle-kontrakt**: Electron ager primary rw-handle under test. Test-kod seedar via IPC, inte direkt db-access.
- **Playwright workers: 1**: Electron singleton per test-fil.

## Kanda fynd vantande

### UX-friktioner (upptackta under S51 E2E)

1. **Picker-komponenter saknar data-testid** -- CustomerPicker/ArticlePicker dropdown-rader har inga testbara selektorer.
2. **"Bokfor" text-collision** -- Navigation-lank, sidrubriker och submit-knapp delar texten "Bokfor".
3. **Payment fran list-row med stopPropagation** -- Betala-knappen finns bara i InvoiceList action-kolumn.

### Arkitektur/test-beslut vantande

4. **Bank-fee proportionalitet** -- diskussion fran Sprint 13b.
5. **Trigger 6/7-analys** -- opening_balance entries exempterade fran triggers 1-5 men ej 6-7.
6. **Redundans-audit** -- se tests/REDUNDANCY_AUDIT.md.

## Tidigare sprintar
- Sprint 14 (S48-S53): E2E-testinfrastruktur -- KLAR
- Sprint 13 (S55-S56): Bulk-betalningar -- KLAR
- Sprint 12 (S54): Bankavgifter -- KLAR
- Sprint 11 (S42-S53): Atomicitet, SSOT resultat, Oresutjamning, Performance, Rename -- KLAR
