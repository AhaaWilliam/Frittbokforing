# E2E Tests (Playwright + Electron)

End-to-end tests that exercise the full stack: renderer UI, IPC layer, main process services, and SQLite database.

## Körning: använd `npm run test:e2e`, inte direkt `npx playwright test`

`better-sqlite3` är en native Node-modul som måste byggas för Electron-ABI
före E2E och åter till Node-ABI för vitest. `npm run test:e2e*` går via
`scripts/run-e2e.mjs` som:

1. Rebuild för Electron-ABI
2. Kör playwright med pass-through args
3. Rebuild tillbaka till Node-ABI (alltid, även vid test-failure eller Ctrl+C)
4. Smoketest att better-sqlite3 faktiskt laddas i Node-ABI

**Direkt `npx playwright test` bypassar wrappern** — din arbetsträd blir
kvar i Electron-ABI efter körningen, och nästa vitest kraschar med
`NODE_MODULE_VERSION`-fel. Om du gjorde det: kör `npm rebuild better-sqlite3`
manuellt. Se [ADR 001](../../docs/adr/001-sqlite-backend.md) för bakgrund.

IDE-integrerade playwright-körningar (VS Code Playwright extension)
bypassar också wrappern. Samma regel: rebuild manuellt efter körning.

## Architecture (M115, M116, M148, M150, M151)

**M115:** E2E tests run against the dev-built Electron app via Playwright. Each test file gets its own temp-db-path via `FRITT_DB_PATH` env. Data is seeded via IPC calls through the renderer. UI interactions are used only for what's being tested, not for setup.

**M116:** E2E tests cover flows that are unrealistic to test in the system layer (multi-step UI, renderer-to-main IPC contracts, full stack). System tests still own business logic testing. One E2E test per critical flow, not per edge case.

**M117:** `data-testid` attributes are allowed on critical bulk/export/dialog actions as a stable E2E contract.

**M148:** Fixtures byggs uteslutande via `window.api` eller `window.__testApi` — aldrig direkt better-sqlite3 i test-processen. Se `tests/e2e/fixtures/compose.ts`.

**M150:** Tid-känsliga tester fryser klockan via `freezeClock(window, iso)` (wrapper runt `__testApi.freezeClock`, satt som `FRITT_NOW`). Alla main-process-services läser tid via `getNow()` (se `src/main/utils/now.ts`).

**M151:** Snapshot-tester av SIE4/SIE5/pain.001 maskar volatila fält (#GEN-datum, Date-attribut, CreDtTm, UUID, KSUMMA) via helpers i `tests/e2e/helpers/snapshot-mask.ts` innan `toMatchSnapshot()`.

### data-testid whitelist

- `wizard` — onboarding wizard root
- `app-ready` — AppShell mounted
- `app-loading` — initial loading state
- `page-{name}` — page content container (e.g. `page-income`, `page-expenses`)
- Bulk action bar: sticky bar with "{n} valda" text, "Bulk-betala" button, "Avmarkera alla" button
- BulkPaymentDialog: per-row amount inputs, "Bankavgift (kr)" input, submit "Betala {n} poster"
- BulkPaymentResultDialog: "{x} av {y} genomförda" text, "Misslyckades:" list, "Stäng" button
- `arets-resultat-value` — Årets resultat i resultaträkningen (RR). `data-raw-ore` innehåller råvärdet i ören som integer-sträng (locale-oberoende).
- `arets-resultat-br-value` — Årets resultat i balansräkningen (BR), under Eget kapital. `data-raw-ore` innehåller råvärdet i ören. Separat testid från RR eftersom rapporter kan renderas samtidigt vid tabbning.
- Export page: "Exportera SIE4", "Exportera SIE5", "Exportera Excel" buttons
- Manual entry form: "Bokför" button — use `getByRole('button', { name: 'Bokför' })` to avoid text collision with nav/headings
- Payment dialog: "Registrera" submit button
- Invoice list: `button[title="Registrera betalning"]` for per-row pay action
- Fixed assets page: `page-fixed-assets`, `fa-create`, `fa-execute-period`, `fa-list`, `fa-row-{id}`, `fa-toggle-{id}`, `fa-detail-row-{id}`, `fa-dispose-{id}`, `fa-delete-{id}`, `fa-edit-{id}`
- Fixed asset form dialog: `fixed-asset-form-dialog`, `fa-name`, `fa-cost`, `fa-submit`
- Pagination: `pag-invoices-position`, `pag-invoices-next`, `pag-invoices-prev`, `pag-expenses-position`, `pag-expenses-next`, `pag-expenses-prev` — state synced to URL query `?invoices_page=N` / `?expenses_page=N` (Sprint C B1)
- Bank reconciliation: `bank-import-input` — file input for CAMT/MT940/BGMax import, `bank-match-dialog` — match confirmation dialog, `bank-match-submit` — submit button inside match dialog, `bank-match-entity-select` — entity type/id selector inside match dialog
- Vardag-sheets (VS-3 + VS-4 + VS-7 + VS-8): `vardag-bigbtn-kostnad`, `vardag-bigbtn-faktura`, `vardag-bigbtn-stang-manad`, `vardag-hero`, `vardag-shell`, `vardag-kostnad-{date,amount,supplier,description,account,vat,submit,error,receipt-pick,receipt-attached,receipt-clear,multiline-cta}`, `vardag-faktura-{customer,date,payment-terms,description,qty,price,line-total,account,vat,submit,error,multiline-cta}`

## How to run

```bash
# Build first (required — E2E runs against compiled app)
npm run build

# Run all E2E tests (full suite, ~15–25 min seriellt)
npm run test:e2e

# Snabb smoke-suite: endast tester taggade @critical (<3 min)
npm run test:e2e:critical

# Headed mode (see the app)
npm run test:e2e:headed

# Debug a specific test
npx playwright test tests/e2e/app-launch.spec.ts --headed --debug

# Trace viewer (after failure)
npx playwright show-trace test-results/<test-name>/trace.zip
```

## Configuration

- `playwright.config.ts` — test runner config
- `workers: 1` — Electron requires serial execution (one app instance at a time)
- `timeout: 30s` per test
- Traces, screenshots, and video captured on failure

## DB handle contract

- Electron owns the primary read-write handle to the temp-db.
- Test code seeds data via `window.evaluate()` → IPC → main process services.
- No `better-sqlite3` in the test process (avoids native module version conflicts between Node.js and Electron).

## Seed helpers

- `launchAppWithFreshDb()` — launches Electron with a fresh migrated temp-db
- `seedCompanyViaIPC(window)` — creates company + FY + periods via IPC
- `seedCustomer(window)` / `seedSupplier(window)` — create counterparties via IPC
- `seedAndFinalizeInvoice(window, opts)` — create + finalize invoice via IPC

## Test-only IPC endpoints (`__testApi`)

Guarded by `FRITT_TEST=1` env var — not registered in production. Exposed on `window.__testApi` (separate from `window.api`).

Available endpoints:
- `getJournalEntries(fyId?)` — all entries + lines
- `getInvoicePayments(invoiceId?)` — payment records
- `getPaymentBatches()` — batch records
- `getInvoices(fyId?)` — with status and remaining
- `getExpenses(fyId?)` — expense records
- `setInvoiceStatus(id, status)` — simulate race conditions
- `createFiscalYear(opts)` — bypass onboarding for FY setup

Source: `src/main/ipc/test-handlers.ts`, registered in `src/main/ipc-handlers.ts` with guard.

## Katalogstruktur (Fas 1)

```
tests/e2e/
├─ modules/         # Per-modul-tester (01-onboarding, 02a-customers, …)
├─ flows/           # Multi-modul användarflöden (first-time-setup, invoice-lifecycle)
├─ fixtures/        # compose*-funktioner som seedar deterministiska test-state
├─ helpers/         # launch-app, seed, assertions, ipc-testapi, snapshot-mask, pdf-parse
├─ snapshots/       # Toleranta snapshots (SIE4/SIE5/pain.001 efter maskning)
└─ *.spec.ts        # Befintliga tester från Sprint 13–50 (behålls där de är)
```

**Regel:** Nya tester går i `modules/` eller `flows/`. Befintliga 22 tester migreras inte.

## Fixtures

Alla fixtures seedas via IPC (M148). Använd compose-funktioner från
`fixtures/compose.ts`:

- `composeEmptyK2(window)` — K2-bolag + FY 2026, inga transaktioner
- `composeEmptyK3(window)` — K3-variant
- `composeActiveYear(window)` — K2 + 3 kunder + 2 lev + 2 bokförda fakturor
- `composeOverdueInvoices(window)` — K2 + 1 kund + 1 förfallen faktura
  (kräver `FRITT_NOW` > due_date satt innan launch)

## Clock-freeze (M150)

Main-process-tid styrs via `FRITT_NOW`-env. E2E-tester använder
`freezeClock(window, iso)` efter launch, eller sätter env innan:

```ts
// Alternativ 1: frys vid launch för overdue-tester
process.env.FRITT_NOW = '2026-05-01T12:00:00Z'
const ctx = await launchAppWithFreshDb()

// Alternativ 2: frys runtime via __testApi
await freezeClock(ctx.window, '2025-06-15T12:00:00Z')
await freezeClock(ctx.window, null) // unfreeze
```

Påverkar: SIE4 `#GEN`, SIE5 `Date`, pain.001 `<CreDtTm>`, backup-filnamn,
overdue-beräkning, chronology-guard-default.

## Snapshot-mask (M151)

Volatila fält maskas innan `toMatchSnapshot()`:

```ts
import { maskSie4, maskPain001 } from './helpers/snapshot-mask'
expect(maskSie4(sie4Text)).toMatchSnapshot('sie4-empty-k2.txt')
```

## `@critical`-konvention

Tagga ett test med `@critical` i test-titeln om det blockerar demo-flödet:
onboarding → skapa kund → skapa faktura → boka → betala → se i dashboard.
`npm run test:e2e:critical` kör endast dessa (<3 min). Full svit körs på PR-merge.

## Why workers: 1

Electron apps are singletons. Each test file launches its own Electron instance sequentially. Parallel workers would conflict on the Electron binary.

## Dialog bypass (M63)

Native `dialog.showSaveDialog` / `showOpenDialog` cannot be driven from Playwright. Handlers bypass the dialog when `E2E_TESTING=true`:

- **Save dialogs** — `getE2EFilePath(defaultFilename, 'save')` returns a deterministic path in `E2E_DOWNLOAD_DIR`. Handler writes directly without showing a dialog. Covers: SIE4-export, SIE5-export, Excel-export, invoice PDF save, pain.001 export.
- **Open-file dialog (fixed filename)** — `getE2EFilePath(defaultFilename, 'open')` returns a mock file from `E2E_DOWNLOAD_DIR` if it exists.
- **Open-file dialog (arbitrary filename)** — `getE2EMockOpenFile()` reads the path from `E2E_MOCK_OPEN_FILE` env var. Used by SIE4 import (user picks a fixture file).
- **Open-directory dialog** — `invoice:select-directory` returns `E2E_DOWNLOAD_DIR` directly. Used by PDF batch export.

Test usage:
```ts
// Before clicking "Välj fil" in PageImport:
process.env.E2E_MOCK_OPEN_FILE = path.join(downloadDir, 'fixture.se')
fs.writeFileSync(process.env.E2E_MOCK_OPEN_FILE, sie4Content)
```

Helpers live in `src/main/utils/e2e-helpers.ts` and are guarded by `E2E_TESTING=true`.

## Flakiness debug tips

- **Strict-mode violations from toast + dialog**: Same text can appear in both a dialog and a toast simultaneously. Scope assertions to the dialog container (`.fixed.inset-0` or `role=dialog`) to avoid Playwright strict-mode violations.
- **"Bokför" text collision**: Navigation link, page headings, and submit button all contain "Bokför". Always use `getByRole('button', { name: 'Bokför' })` for the submit action.
- **List vs detail text collision**: Entity name appears in both list card and detail heading. Use `getByRole('heading', { name: '...' })` to disambiguate.

## Flakiness policy

Zero tolerance. A flaky test is worse than no test. Use:
- `getByRole` / `getByText` / `getByTestId` — not CSS selectors
- `expect(...).toBeVisible({ timeout })` — not `waitForTimeout`
- Deterministic seeds — no random data

## Future CI setup

Headless Linux requires Xvfb:
```bash
xvfb-run -a npm run test:e2e
```

No CI pipeline configured in this sprint. `retries: process.env.CI ? 1 : 0` is pre-configured.
