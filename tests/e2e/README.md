# E2E Tests (Playwright + Electron)

End-to-end tests that exercise the full stack: renderer UI, IPC layer, main process services, and SQLite database.

## Architecture (M115, M116)

**M115:** E2E tests run against the dev-built Electron app via Playwright. Each test file gets its own temp-db-path via `FRITT_DB_PATH` env. Data is seeded via IPC calls through the renderer. UI interactions are used only for what's being tested, not for setup.

**M116:** E2E tests cover flows that are unrealistic to test in the system layer (multi-step UI, renderer-to-main IPC contracts, full stack). System tests still own business logic testing. One E2E test per critical flow, not per edge case.

**M117:** `data-testid` attributes are allowed on critical bulk/export/dialog actions as a stable E2E contract.

### data-testid whitelist

- `wizard` — onboarding wizard root
- `app-ready` — AppShell mounted
- `app-loading` — initial loading state
- `page-{name}` — page content container (e.g. `page-income`, `page-expenses`)
- Bulk action bar: sticky bar with "{n} valda" text, "Bulk-betala" button, "Avmarkera alla" button
- BulkPaymentDialog: per-row amount inputs, "Bankavgift (kr)" input, submit "Betala {n} poster"
- BulkPaymentResultDialog: "{x} av {y} genomförda" text, "Misslyckades:" list, "Stäng" button
- Export page: "Exportera SIE4", "Exportera SIE5", "Exportera Excel" buttons
- Manual entry form: "Bokför" button — use `getByRole('button', { name: 'Bokför' })` to avoid text collision with nav/headings
- Payment dialog: "Registrera" submit button
- Invoice list: `button[title="Registrera betalning"]` for per-row pay action

## How to run

```bash
# Build first (required — E2E runs against compiled app)
npm run build

# Run all E2E tests
npm run test:e2e

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

## Why workers: 1

Electron apps are singletons. Each test file launches its own Electron instance sequentially. Parallel workers would conflict on the Electron binary.

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
