# Sprint N — jsx-a11y baseline 46 → 0 + IBAN-spec ✅ KLAR

**Session:** 2026-04-18 (Sprint N, direkt efter Sprint M)
**Scope:** (1) jsx-a11y baseline-stängning 46 → 0, (2) IBAN-prefix-dispatch
spec-draft.
**Estimat:** ~2 SP. **Faktiskt:** ~2 SP.

## Backlog-hantering

Av 5 backlog-items från Sprint M:

| Item | Status | Åtgärd i SN |
|---|---|---|
| **jsx-a11y baseline (46)** | Aktionerbart | ✅ Stängt: 46 → 0 |
| **IBAN-prefix-dispatch (spec)** | Aktionerbart | ✅ Spec-draft skriven |
| **Sprint H (T3.a F62-e)** | Blockerad (revisor) | Ingen åtgärd — ADR 002 väntar på domän-input |
| **T3.d MT940 + BGC** | Framtid (H2 2026) | Ingen åtgärd — timing-gate |
| **Radix UI-migration** | Nice-to-have | Ingen åtgärd — `useDialogBehavior` (M156) ger redan focus-trap/escape/return utan migration |

## Leverans

### P1 — jsx-a11y baseline 46 → 0

Strategi: semantiska fixes där naturligt; `eslint-disable-next-line` med
motivering för edge-cases (custom component-wrappers, combobox-options).

#### Fixes per kategori

**Backdrop dialog-divs (6): `role="presentation"` + `onKeyDown`**
Dialoger som använder `useDialogBehavior` (M156) har `onKeyDown` på yttre
backdrop-div. jsx-a11y klassar det som "static element with interaction".
Fix: `role="presentation"` eftersom backdrop är visual-only container.
- [BatchPdfExportDialog.tsx](src/renderer/components/ui/BatchPdfExportDialog.tsx)
- [BulkPaymentDialog.tsx](src/renderer/components/ui/BulkPaymentDialog.tsx)
- [BulkPaymentResultDialog.tsx](src/renderer/components/ui/BulkPaymentResultDialog.tsx)
- [ConfirmDialog.tsx](src/renderer/components/ui/ConfirmDialog.tsx)
- [ConfirmFinalizeDialog.tsx](src/renderer/components/ui/ConfirmFinalizeDialog.tsx)
- [PaymentDialog.tsx](src/renderer/components/ui/PaymentDialog.tsx)

**Klickbara rader i rapporter (2): `<div>` → `<button aria-expanded>`**
- [BalanceSheetView.tsx](src/renderer/components/reports/BalanceSheetView.tsx)
- [IncomeStatementView.tsx](src/renderer/components/reports/IncomeStatementView.tsx)

Expand/collapse-rader konverterade till `<button type="button">` med
`aria-expanded` + `disabled` när `hasAccounts` är falskt. Tidigare
`<div onClick>`. Semantiskt korrekt — raden är en tri-state toggle.

**Action-cell stopPropagation (2): `role="presentation"`**
- [InvoiceList.tsx](src/renderer/components/invoices/InvoiceList.tsx)
- [ExpenseList.tsx](src/renderer/components/expenses/ExpenseList.tsx)

Cell med action-knappar har `onClick={e => e.stopPropagation()}` för att
inte trigga row-click. Syfte är ren event-bubble-kontroll — inget
interaktivt element. `role="presentation"` markerar det.

**Dialogs med inline backdrop-close (2): target-check + Escape**
- [FixedAssetFormDialog.tsx](src/renderer/components/fixed-assets/FixedAssetFormDialog.tsx)
- [PageAccruals.tsx](src/renderer/pages/PageAccruals.tsx)

Dialoger som inte använder `useDialogBehavior` (M156-variants) har nu:
- `onClick` som checkar `e.target === e.currentTarget` (backdrop-only)
- `onKeyDown` Escape-handler
- Inner div utan `onClick={stopPropagation}` (inte längre nödvändigt)
- `eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions`
  för `role="dialog"` med `onClick` (legitim dialog-design)

**Label-has-associated-control (20): `htmlFor` + `id`**
Tillagt `htmlFor`/`id`-par på 14 label-input-par:
- [ImportPreviewPhase.tsx](src/renderer/components/import/ImportPreviewPhase.tsx) (2 radio-inputs)
- [CustomerPriceTable.tsx](src/renderer/components/products/CustomerPriceTable.tsx) (2)
- [StepCompany.tsx](src/renderer/components/wizard/StepCompany.tsx) (3, + `<fieldset><legend>` för radio-grupp)
- [StepFiscalYear.tsx](src/renderer/components/wizard/StepFiscalYear.tsx) (1)
- [PageAccounts.tsx](src/renderer/pages/PageAccounts.tsx) (2)
- [YearPicker.tsx](src/renderer/components/layout/YearPicker.tsx) (1)
- [CreateAccrualDialog.tsx](src/renderer/components/accruals/CreateAccrualDialog.tsx) (7)

**eslint-disable med motivering (4):**
- [ExpenseForm.tsx](src/renderer/components/expenses/ExpenseForm.tsx) /
  [InvoiceForm.tsx](src/renderer/components/invoices/InvoiceForm.tsx) —
  `<label>` följs av custom Picker-komponent; Picker exponerar label via
  `aria-label` internt.
- [ImportPreviewPhase.tsx](src/renderer/components/import/ImportPreviewPhase.tsx) (2) /
  [StepCompany.tsx](src/renderer/components/wizard/StepCompany.tsx) (2) —
  radio-input med nested `<div>` text. Text är tillgänglig via
  `label.textContent` men regeln kräver direct text children (strikt).

**GlobalSearch combobox (2):**
- [GlobalSearch.tsx:168](src/renderer/components/layout/GlobalSearch.tsx:168) —
  Lagt till `aria-controls` (krav från `role="combobox"`).
- [GlobalSearch.tsx:229](src/renderer/components/layout/GlobalSearch.tsx:229) —
  `<li role="option" onClick>` är standard combobox-mönster: options
  aktiveras via Enter på input (aria-activedescendant), inte via
  direktfokus på option. `eslint-disable-next-line` med motivering.

**SupplierPicker autoFocus:**
- [SupplierPicker.tsx](src/renderer/components/expenses/SupplierPicker.tsx) —
  `autoFocus` på "nytt leverantörsnamn"-input är medvetet UX-val.
  `eslint-disable-next-line jsx-a11y/no-autofocus` med motivering.

**Tooltip role="button":**
- [Tooltip.tsx](src/renderer/components/ui/Tooltip.tsx) — inre `<span tabIndex={0}>`
  fick `role="button"`. Semantisk accept för tabbable element.

### P2 — IBAN-prefix-dispatch spec-draft

Ny fil: [docs/iban-prefix-dispatch-spec.md](docs/iban-prefix-dispatch-spec.md).

**Innehåll:**
- Bakgrund: nuvarande `BANK_NAME_RE`-heuristik i
  `bank-fee-classifier.ts` har begränsningar (kräver counterparty_name).
- Analys av tre tolkningar från Sprint L:
  - **(a) IBAN-prefix-baserad bank-identifiering** — rekommenderad
  - **(b) Transaction-routing baserat på IBAN-prefix** — avvisad (ingen use-case)
  - **(c) Egen DB-tabell `iban_prefix_mappings`** — avvisad som MVP
    (stabilt register motiverar konstant-mapping i kod)
- Konkret implementation-plan: ny `iban-bank-registry.ts` med
  `SE_IBAN_PREFIX_TO_BANK` Map (SEB, Swedbank, Handelsbanken, Nordea,
  Danske, ICA, Länsförsäkringar, Skandia), `lookupBankByIban` lookup-
  funktion, utvidgning av `classifyByHeuristic` med IBAN-signal.
- Test-matrix + invarianter (M153 deterministisk) + scope-out.
- Estimat ~0.5–1 SP, inga beroenden.

**Specen är blockerad på:** Implementering-beslut (tagg för nästa sprint).

### Ingen ny infrastruktur

- Inga nya M-principer.
- Inga nya migrationer (PRAGMA `user_version`: 43 oförändrat).
- Inga nya IPC-kanaler.
- Inga nya ErrorCodes.

## Verifiering

- **Lint:** 46 → **0 problems**
- **TypeScript:** `npx tsc --noEmit` ✅
- **Vitest:** 2576 tester ✅ (oförändrat, ingen regression)
- **check:m133** + **check:m133-ast** + **check:m153** + **check:lint-new** ✅

## Filer (delta mot Sprint M tip)

**Modifierade (17):**
- `src/renderer/components/accruals/CreateAccrualDialog.tsx`
- `src/renderer/components/expenses/ExpenseForm.tsx`
- `src/renderer/components/expenses/ExpenseList.tsx`
- `src/renderer/components/expenses/SupplierPicker.tsx`
- `src/renderer/components/fixed-assets/FixedAssetFormDialog.tsx`
- `src/renderer/components/import/ImportPreviewPhase.tsx`
- `src/renderer/components/invoices/InvoiceForm.tsx`
- `src/renderer/components/invoices/InvoiceList.tsx`
- `src/renderer/components/layout/GlobalSearch.tsx`
- `src/renderer/components/layout/YearPicker.tsx`
- `src/renderer/components/products/CustomerPriceTable.tsx`
- `src/renderer/components/reports/BalanceSheetView.tsx`
- `src/renderer/components/reports/IncomeStatementView.tsx`
- `src/renderer/components/ui/BatchPdfExportDialog.tsx`
- `src/renderer/components/ui/BulkPaymentDialog.tsx`
- `src/renderer/components/ui/BulkPaymentResultDialog.tsx`
- `src/renderer/components/ui/ConfirmDialog.tsx`
- `src/renderer/components/ui/ConfirmFinalizeDialog.tsx`
- `src/renderer/components/ui/PaymentDialog.tsx`
- `src/renderer/components/ui/Tooltip.tsx`
- `src/renderer/components/wizard/StepCompany.tsx`
- `src/renderer/components/wizard/StepFiscalYear.tsx`
- `src/renderer/pages/PageAccounts.tsx`
- `src/renderer/pages/PageAccruals.tsx`

**Nya (2):**
- `docs/iban-prefix-dispatch-spec.md`
- `docs/sprint-n-summary.md`

## Kvar i backlog

- **IBAN-prefix-dispatch (implementation)** — spec klar, väntar på
  implementation-sprint (~0.5–1 SP).
- **Sprint H (T3.a F62-e)** — fortsatt blockerad på revisor-samråd.
- **T3.d MT940 + BGC** — H2 2026.
- **Radix UI-migration** — fortsatt nice-to-have utan tydlig nytta.
- **Space-på-rad-togglar-checkbox** (F49-c polish).
