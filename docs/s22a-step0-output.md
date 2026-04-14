# Sprint 22a — F46 — Step 0 Output

## Baslinje

- Branch: main
- HEAD: f4306a3 (docs: STATUS.md Sprint 20+21, test-count 1472)
- Tests: 1472 passed, 2 skipped
- M131: OK

## 0.2 Nuvarande qty-constraints

| Schema | Constraints | Fil:rad |
|---|---|---|
| Invoice form qty | `z.number().refine(≤2 dec)` — ingen .min(), ingen .max() | invoice.ts:9 |
| Expense form qty | `z.number().int()` — ingen .min(), ingen .max() | expense.ts:9 |
| Invoice IPC qty | `z.number().positive().refine(≤2 dec)` | ipc-schemas.ts:259 |
| Expense IPC qty | `z.number().int().min(1)` | ipc-schemas.ts:369 |

## 0.2a Befintliga tester med qty >= 4 siffror

Inga träffar. Inget behöver uppdateras.

## 0.2b Error-meddelande-format

Dominerande mönster: svenska meddelanden, t.ex. "Quantity kan ha högst 2 decimaler",
"Räkenskapsårets slut måste vara efter start". Speccens svenska format passar.

Spikade error-meddelanden:
- Invoice: "Antal kan vara högst 9 999,99"
- Expense: "Antal kan vara högst 9 999"

## 0.2c Float vs int semantik

| Schema | Typ | MAX | Semantik |
|---|---|---|---|
| Invoice form | float (≤2 dec) | 9999.99 | 9999.99 accept, 10000 reject |
| Invoice IPC | float (≤2 dec) | 9999.99 | Samma |
| Expense form | int | 9999 | 9999 accept, 10000 reject |
| Expense IPC | int | 9999 | Samma |

## 0.2d Expense max-qty

MAX_QTY_EXPENSE = 9999 — paritetsval. Ingen produktionsdata analyserad.

## 0.2e Konstant-fil

Ingen befintlig src/shared/constants.ts. Skapas ny.

## 0.2f .min()-paritet

Invoice form qty saknar .min(). Läggs till: `.min(0.01, { message: 'Antal måste vara minst 0,01' })`.
IPC har `.positive()` som täcker min-fallet.

## 0.3 Scope-sanity

- Ingen DB CHECK på quantity → ej redundant
- Exakt 2 Zod-schemas per lager (form + IPC) → ej scope-ökning
- constants.ts skapas ny → ingen refaktor krävs
- Senaste M-nummer: M131 → M132 korrekt

## M132-beslut

M132 läggs till: "Cross-schema-gränser placeras i src/shared/constants.ts."

## 0.4 Testantal

9 nya tester i tests/session-22a-f46-max-qty.test.ts.
Baslinje: 1472 → 1481.
