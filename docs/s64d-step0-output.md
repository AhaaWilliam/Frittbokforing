# S64d — Steg 0 Preflight Output

## Baseline
- Commit: `34a2289562bea79c1df987ad1920464800f50972` — Sprint 18 S64c: hook-tester för useEntityForm
- Branch: `main`
- Testantal före: **1261 passed** (2 skipped)

## FiscalYearContext.tsx — Verifierad (Utfall A)
- Rader: 91
- Exports: 2 (`FiscalYearProvider`, `useFiscalYearContext`)
- `restoredIdLoaded`: rad 22 (state), rad 59, 62 (auto-persist-guard)
- `settings:get` / `settings:set`: rad 25 (getSetting), rad 54, 60 (setSetting)
- `useFiscalYears`: rad 10 (import), rad 19 (anrop) — fortfarande importerad ✓

## Befintliga tests/**/*fiscal-year*
- `tests/system/S04-fiscal-year-transition.test.ts`
- `tests/session-42-fiscal-year-overlap.test.ts`
- **Ingen** renderer-testfil för FiscalYearContext ✓

## Befintliga FiscalYearContext-tester i render-with-providers.test.tsx
1. `it('renders with loaded fiscal year from mock-IPC', ...)` — rad 42
2. `it('renders loading state when fiscalYear is "loading"', ...)` — rad 54

## Mock-IPC kanalstatus (0.5)
- `settings:get`: **(b)** — i `noSchemaSet` whitelist (rad 26). Mockas via `mockIpcResponse`/`mockIpcPending`.
- `settings:set`: **(b)** — i `noSchemaSet` whitelist (rad 27). Mockas via `mockIpcResponse`.
- `fiscal-year:list`: **(b)** — i `noSchemaSet` whitelist (rad 23). Mockas via `mockIpcResponse`/`mockIpcPending`.

## useFiscalYearContext utanför provider
Hooken kastar `Error('useFiscalYearContext måste användas inom FiscalYearProvider')` vid rad 86.
→ **Test 15 läggs till.** Total: **15 tester.**

## git status
Clean.

---
Steg 0 klar. Väntar på go.
