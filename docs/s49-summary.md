# Sprint 49 — Refaktor + E2E-vakter för F1–F5

**Session:** S49  •  **Datum:** 2026-04-16  •  **Scope:** Stabilisering (0 nya features, 0 migrationer, 0 nya M-principer)

## Resultat

| Metrik | Före | Efter |
|---|---|---|
| Vitest | 2247 pass | 2247 pass |
| E2E | 11 specs | 16 specs (15 pass) |
| TSC errors | 0 | 0 |
| PRAGMA user_version | 37 | 37 |
| Största page-fil (LOC) | 488 | 461* |

*PageAccountStatement (278 LOC) blev största page efter refaktor. PageBudget/PageImport/PageAccruals ligger nu under 130 LOC var.

## Fas A — Komponent-extraktion

Pure move, 0 beteendeändring. Existerande renderer-tester (PageBudget.test.tsx, PageAccruals.test.tsx) passerar oförändrat.

### PageBudget 488 → 91 LOC
```
src/renderer/components/budget/
  BudgetInputGrid.tsx     — grid + save/copy/distribute
  VarianceGrid.tsx        — read-only matrix + sub-components
  budget-grid-utils.ts    — GridState, oreToKr, krToOre, PERIOD_LABELS
```

### PageImport 359 → 89 LOC
```
src/renderer/components/import/
  ImportSelectPhase.tsx
  ImportPreviewPhase.tsx  — validation summary + strategy picker
  ImportDonePhase.tsx
  import-types.ts         — ValidationSummary, ValidationResult, ImportResult, Phase
```

### PageAccruals 461 → 124 LOC
```
src/renderer/components/accruals/
  CreateAccrualDialog.tsx
  ScheduleCard.tsx
  accrual-constants.ts    — ACCRUAL_TYPES, TYPE_LABELS, TYPE_BADGE, kronorToOre
```

### Övrig cleanup
Redundant `data-testid="page-*"` borttagen från tre pages. `AppShellInner` wrapper (AppShell.tsx:88) sätter redan `data-testid={page-${page}}`, så sida-nivå-duplikat orsakade strict-mode-violations i Playwright.

## Fas B — E2E dialog-bypass (utvidgar M63)

Före S49: bypass fanns för save-dialogs + open-dialogs med default filename. Saknades: open-file utan default namn, open-directory.

### Nytt: `getE2EMockOpenFile()` i `src/main/utils/e2e-helpers.ts`
Läser `E2E_MOCK_OPEN_FILE` env. Retur null i prod.

### Handlers som fick bypass
| Kanal | Bypass-mekanism |
|---|---|
| `import:sie4-select-file` | `E2E_MOCK_OPEN_FILE` env |
| `payment-batch:export-pain001` | `getE2EFilePath` (save) |
| `invoice:select-directory` | Retur av `E2E_DOWNLOAD_DIR` |

### Dokumentation
`tests/e2e/README.md` fick ny rubrik "Dialog bypass (M63)" med konkret test-exempel.

## Fas C — 5 nya E2E-specs (alla gröna)

Mönster: happy-path per feature, en spec per kritiskt IPC-kontrakt. M116-konform (ingen duplicering av system-test-edge-cases).

| Fil | Feature | Huvud-assertion |
|---|---|---|
| `tests/e2e/budget-save.spec.ts` | F2 Budget | Grid fill → save → reload → värden kvar |
| `tests/e2e/accrual-execute.spec.ts` | F3 Periodiseringar | Create schedule → kör P1 → C-serie-verifikat med rätt belopp |
| `tests/e2e/sie4-import.spec.ts` | F5 SIE4-import | Fixture via E2E_MOCK_OPEN_FILE → merge → I-serie-verifikat |
| `tests/e2e/pain001-export.spec.ts` | F4 Pain.001 | Seed + bulk-pay → export → XML på disk med `<PmtInf>` + belopp |
| `tests/e2e/pdf-batch-export.spec.ts` | F1 PDF batch | 2 fakturor → select-all → 2 PDF-filer i downloadDir |

## Bonus — M144-regression i E2E-helpers

Sprint 38 (F60b) migrerade `fiscal-year:list` och `vat-code:list` till IpcResult-wrapping men E2E-helpers uppdaterades inte. Upptäckt i denna sprint eftersom ALLA E2E-tester failade i första körningen.

**Fix:**
- `tests/e2e/helpers/launch-app.ts:seedCompanyViaIPC` — unwrap `fiscal-year:list`
- `tests/e2e/helpers/seed.ts:seedAndFinalizeInvoice` — unwrap `listVatCodes`
- `tests/e2e/bulk-payment.spec.ts`, `full-cycle.spec.ts`, `result-consistency.spec.ts` — samma fixes inline

## Backlog (ej i scope)

- **`bulk-payment.spec.ts:78` "Drafts/paid är icke-selectable"** failar (paid-fakturor är nu selectable via select-all i InvoiceList). Pre-existing, ej orsakat av S49. App-beteende behöver utredas separat — antingen är testet utdaterat (paid ska vara selectable i bulk?) eller så är det en regression i InvoiceList select-all-logik.

## Inga nya M-principer

Sprinten introducerade inga nya arkitekturregler. Befintliga M63 (E2E dialog bypass), M115 (E2E temp-db), M116 (E2E täckningsbeslut), M144 (IpcResult-mandat) utvidgades marginellt (M63: +open-file env + select-directory, M144: E2E-helpers följer nu kontraktet).
