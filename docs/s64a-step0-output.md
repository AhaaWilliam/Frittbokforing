# S64a Steg 0 — Preflight Output

## 1. Sprint-baseline-commit-hash

`e71e7a0eb5292fc1a2574328a3a4ddc66a378195` — `docs(sprint-17): S62 tsc-audit och klassificering`

## 2. Testantal före

**1223 passed** (2 skipped), 101 test files. Promptens uppskattning (916) baserades
på S40-kontext; 307 tester har tillkommit sedan dess. Inga konsekvenser
utöver att commit-meddelandet använder 1223 som baseline.

## 3. Dependencies-status

| Paket | Status |
|-------|--------|
| `@testing-library/react` | OK (^16.3.2) |
| `@testing-library/user-event` | **Saknades** — installerad |
| `@testing-library/jest-dom` | **Saknades** — installerad |
| `vitest` | OK (^4.1.1) |
| `@vitest/ui` | **Saknades** — installerad |
| `jsdom` | OK (^29.0.1) |

Alla sex nu installerade.

## 4. Schema-inventering

- `*Schema`-exports: **63** (OK, >= 61)
- `PayloadSchema`-substring-träffar: **2** — `PayInvoicesBulkPayloadSchema`
  och `PayExpensesBulkPayloadSchema`. Dessa är domänkorrekta namn
  (bulk-betalning payload), **inte** legacy-namnkonvention. Utfall A.
- `channelMap`-export: **Saknas** — Utfall C. Förleverans skapas som
  separat commit.

## 5. FiscalYearContext-utfall

Fil: `src/renderer/contexts/FiscalYearContext.tsx` (PascalCase, inte
kebab-case). `restoredIdLoaded` finns (rad 22, 59, 62). **Utfall A.**

Notering: Sökvägen i prompten antog kebab-case. Leverans 3 justerar
importvägen till PascalCase.

## 6. Git status efter Steg 0

Nya/ändrade filer:
- `docs/s64a-step0-output.md` (denna fil)
- `package.json` + `package-lock.json` (tre nya devDependencies)
- `src/shared/ipc-schemas.ts` (channelMap-förleverans, separat commit)

---
Steg 0 klar. Väntar på go för Leveranser.
