# S66b — Steg 0 Output

## 0.1 Baseline
- Branch: main
- HEAD: 149d550c57996d35f5e5a5ea7c0cc01dfa2a094a
- Tests: 1403 passed | 2 skipped

## 0.2 Komponenter
- ExpenseForm.tsx: 419 rader
- ExpenseLineRow.tsx: 127 rader, memo-wrappat
- form-schemas/expense.ts: 83 rader

## 0.4 IPC-kanaler
- `expense:save-draft`, `expense:update-draft`, `expense:delete-draft`
- `expense:get-draft` (edit-mode via useExpenseDraft hook)
- Transitiva: `company:get`, `vat-code:list`, `account:list`, `fiscal-year:list`

## 0.5 Cascading
- handleSupplierChange: _supplier + paymentTerms + dueDate (alltid override)
- handleDateChange: expenseDate + dueDate (alltid override)
- handlePaymentTermsChange: paymentTerms + dueDate (alltid override)
- Edit-mode: initialData via useMemo, ingen cascade-useEffect

## 0.6 Transform
- `transformExpenseForm(form: ExpenseFormState, fiscalYearId: number): ExpenseSavePayload`
- description: Zod min(1)
- quantity: z.number().int()
- unit_price_ore: toOre(line.unit_price_kr) per rad

## 0.8a Spikade värden
| qty | price | rate | net_ore | vat_ore |
|-----|-------|------|---------|---------|
| 1.5 | 100.33| 0.25 | 15050   | 3763    |
| 1   | 1250  | 0.25 | 125000  | 31250   |
| 2   | 123.45| 0.25 | 24690   | 6173    |
| 1   | 0.99  | 0.25 | 99      | 25      |
| 3×1 | 0.99  | 0.25 | 297     | 75      |

## 0.8b Karakterisering
Se docs/s66b-characterization.md. Go — max delta 1 öre.

## 0.14 M-nummer
Sista: M128 (sektion 33). Ny: **M129** (sektion 34).

## 0.10 Props
`{ expenseId?: number, onSave: () => void, onCancel: () => void }`
expenseId→useExpenseDraft(id) → edit-mode. Create-mode: expenseId=undefined.

## Commit-kedja
| # | Commit | Tester | Baslinje |
|---|--------|--------|----------|
| 1 | chore(test-utils): byKr → shared util | 0 | 1403→1403 |
| 2a| test(expenses): transformExpenseForm | +10 | 1403→1413 |
| 2b| refactor(expenses): extract ExpenseTotals + M129 | 0 | 1413→1413 |
| 3 | test(expenses): ExpenseTotals F27-kärna | +11 | 1413→1424 |
| 4 | Sprint 19 S66b: ExpenseForm + integration | +25 | 1424→1449 |

## toOre-semantik
`toOre(kr) = Math.round(kr * 100)` — identiskt med `Math.round(qty * price_kr * 100)`.
ExpenseTotals använder `toOre(qty * price_kr)` för konvergens med InvoiceTotals.
